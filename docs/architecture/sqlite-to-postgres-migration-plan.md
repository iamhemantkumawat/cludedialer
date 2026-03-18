# SQLite To PostgreSQL Migration Plan

This migration plan is based on the current live backend model:

- `sip_accounts`
- `campaigns`
- `contacts`
- `call_results`
- `contact_lists`
- `portal_contacts`

Current live database location:

- [backend/.env](/Users/hemant/Desktop/CyberX%20Calls%20Data/cludedialer/.claude/worktrees/quizzical-leavitt/backend/.env) sets `DATA_DIR=/Users/hemant/Desktop/CyberX Calls Data/cludedialer/data`
- live SQLite file is `/Users/hemant/Desktop/CyberX Calls Data/cludedialer/data/autodialer.db`

Important note:

- the worktree-local SQLite file under `.claude/worktrees/quizzical-leavitt/data/autodialer.db` is empty
- the real migration source should be the live root file above unless you change `DATA_DIR`

## Migration Goal

Move from a single-file SQLite app into:

- PostgreSQL as primary database
- NestJS modular monolith
- Redis + BullMQ workers
- optional dual-run period before cutover

## Recommended Migration Strategy

Use a phased migration, not a one-shot rewrite.

1. Freeze the current SQLite schema.
2. Stand up PostgreSQL with the new production schema.
3. Build a read-only extractor from SQLite.
4. Import legacy data into PostgreSQL with stable ID maps.
5. Run the new API in shadow mode against PostgreSQL.
6. Cut writes over to PostgreSQL.
7. Keep SQLite backup for rollback and forensic checks.

## Deliverables To Build First

Suggested script layout:

```text
scripts/migrate/sqlite-to-postgres/
├── 00-config.ts
├── 01-bootstrap-org.ts
├── 02-migrate-sip-trunks.ts
├── 03-migrate-contact-lists.ts
├── 04-migrate-contacts.ts
├── 05-migrate-media.ts
├── 06-migrate-campaigns.ts
├── 07-migrate-call-history.ts
├── 08-verify-counts.ts
├── 09-cutover-checklist.ts
└── shared/
    ├── sqlite-client.ts
    ├── postgres-client.ts
    ├── id-map.ts
    ├── phone-normalizer.ts
    └── checkpoints.ts
```

Use checkpoints so each step is re-runnable and idempotent.

## Phase 0: Pre-Migration Decisions

Decide these before writing ETL:

1. Create one bootstrap organization for all existing legacy data.
2. Create one bootstrap admin user.
3. Decide how to normalize phone numbers.
4. Decide whether old campaign contacts become canonical contacts.
5. Decide whether old audio files are copied into object storage immediately or first referenced from local disk.

Recommended answers:

- put all current data into one bootstrap organization named `Legacy AutoDialer`
- create one bootstrap admin bound to your current owner email
- normalize phones to E.164 where possible
- migrate old campaign contacts into canonical `contacts` and materialized `campaign_targets`
- migrate audio metadata first, move binary storage later if needed

## Phase 1: Prepare PostgreSQL

1. Create a fresh PostgreSQL database.
2. Apply [postgresql-schema.sql](/Users/hemant/Desktop/CyberX%20Calls%20Data/cludedialer/.claude/worktrees/quizzical-leavitt/docs/architecture/postgresql-schema.sql).
3. Create a bootstrap organization.
4. Create bootstrap roles and one admin user.
5. Seed permissions and organization role mappings.

Bootstrap records to create before ETL:

- `organizations`
- `users`
- `organization_roles`
- `organization_role_permissions`
- `organization_memberships`
- `wallets`

## Phase 2: Extract Legacy Data

Source tables today:

```text
sip_accounts
campaigns
contacts
call_results
contact_lists
portal_contacts
```

Recommended extraction order:

1. `sip_accounts`
2. `contact_lists`
3. `portal_contacts`
4. audio files on disk
5. `campaigns`
6. `contacts`
7. `call_results`

## Phase 3: ID Mapping Strategy

Do not reuse integer IDs or assume UUID compatibility across domains.

Create mapping tables in memory, JSON, or a dedicated migration schema:

```text
legacy_sip_account_id      -> sip_trunks.id
legacy_contact_list_id     -> contact_lists.id
legacy_portal_contact_id   -> contacts.id
legacy_campaign_id         -> campaigns.id
legacy_campaign_contact_id -> campaign_targets.id
legacy_call_result_id      -> cdrs.id
```

Keep a migration checkpoint file after every step:

```json
{
  "bootstrap_org_id": "...",
  "bootstrap_user_id": "...",
  "sip_account_map": {},
  "contact_list_map": {},
  "portal_contact_map": {},
  "campaign_map": {},
  "campaign_target_map": {},
  "call_result_map": {}
}
```

## Table Mapping

### 1. `sip_accounts` -> `sip_trunks`

Current source fields:

- `id`
- `name`
- `username`
- `password`
- `domain`
- `port`
- `caller_id`
- `is_active`
- `created_at`

Target mapping:

- `sip_accounts.id` -> store in `sip_trunks.external_id`
- `name` -> `name`
- `domain` -> `host`
- `port` -> `port`
- `username` -> `username`
- `username` -> `auth_username`
- `password` -> `password_ciphertext` after app-layer encryption
- `domain` -> `domain`
- `caller_id` -> migrate into `caller_ids` first, then set `sip_trunks.default_caller_id_id`
- `is_active` -> `active`
- `created_at` -> `created_at`

Notes:

- every non-empty legacy caller ID should create or reuse a row in `caller_ids`
- set `provider_name='legacy-sqlite-import'` if no provider metadata exists

### 2. `contact_lists` -> `contact_lists`

Current source fields:

- `id`
- `sip_account_id`
- `list_name`
- `description`
- `created_at`

Target mapping:

- legacy `id` goes into migration map only
- `list_name` -> `name`
- `description` -> `description`
- `sip_account_id` -> store in `metadata.legacy_sip_account_id`
- `created_at` -> `created_at`
- set `source='manual'` unless list was known to be imported

### 3. `portal_contacts` -> `contacts` + `contact_list_members`

Current source fields:

- `id`
- `sip_account_id`
- `contact_list_id`
- `phone_number`
- `contact_name`
- `status`
- `attempts`
- `last_result`
- `created_at`
- `updated_at`

Target mapping:

- create one canonical `contacts` row per normalized phone number per organization
- `portal_contacts.id` -> `contacts.external_ref`
- `phone_number` -> normalized `phone_e164`
- `contact_name` -> `display_name`
- `status` -> mapped `contacts.status`
- `attempts` and `last_result` -> `contacts.attributes`
- `created_at` -> `created_at`
- `updated_at` -> `updated_at`
- `contact_list_id` -> `contact_list_members.contact_list_id`

Status map:

- `pending` -> `active`
- `called` -> `active`
- `failed` -> `active`
- anything explicitly blocked later -> `blocked`

Notes:

- if the same number exists in multiple lists, keep one canonical `contacts` row and multiple `contact_list_members`
- store old list-specific attempt state in `attributes.legacy`

### 4. Audio Files On Disk -> `audio_assets`

Current source:

- files inside `ASTERISK_SOUNDS_DIR`

Current env source:

- [backend/.env](/Users/hemant/Desktop/CyberX%20Calls%20Data/cludedialer/.claude/worktrees/quizzical-leavitt/backend/.env)

Target mapping:

- each file becomes one `audio_assets` row
- file basename -> `storage_key`
- file type -> `mime_type`
- size -> `size_bytes`
- file birth/mtime -> `created_at`
- set `kind='upload'`
- set `storage_provider='local'` for first pass

Notes:

- do not block the DB migration on moving files to S3/R2
- first migrate metadata, then migrate binaries in a later storage cutover

### 5. `campaigns` -> `campaigns`

Current source fields:

- `id`
- `name`
- `sip_account_id`
- `audio_file`
- `audio_type`
- `tts_text`
- `dtmf_digits`
- `concurrent_calls`
- `status`
- `total_numbers`
- `dialed`
- `answered`
- `created_at`

Target mapping:

- `campaigns.id` -> `campaigns.external_ref`
- `name` -> `name`
- `sip_account_id` -> lookup `sip_trunks.id`
- `audio_file` -> lookup `audio_assets.id` when file exists
- `tts_text` -> `metadata.legacy_tts_text`
- `audio_type` -> `metadata.legacy_audio_type`
- `dtmf_digits` -> `metadata.legacy_dtmf_digits`
- `concurrent_calls` -> `max_concurrent_calls`
- `status` -> mapped `status`
- `created_at` -> `created_at`

Status map:

- `pending` -> `draft`
- `running` -> `running`
- `paused` -> `paused`
- `stopped` -> `stopped`
- `completed` -> `completed`

Notes:

- create a default `campaign_runs` row for campaigns that were ever started
- if there is no IVR flow yet, create campaign without `ivr_flow_id`

### 6. `contacts` -> `campaign_targets`

Current source fields:

- `id`
- `campaign_id`
- `phone_number`
- `status`

Important distinction:

- legacy `contacts` are campaign-scoped targets
- future `contacts` are canonical org contacts

Target mapping:

1. normalize `phone_number`
2. upsert canonical row in `contacts`
3. create `campaign_targets` row linked to `campaign_id`
4. copy old target state into `campaign_targets.status`

Status map:

- `pending` -> `pending`
- `calling` -> `dialing`
- `answered` -> `answered`
- `failed` -> `failed`
- `busy` -> `failed`
- `noanswer` -> `failed`
- `no_dtmf` -> `completed`

Notes:

- if a campaign number is not present in `portal_contacts`, still create canonical `contacts`
- set `campaign_targets.source_ref` to the old legacy target ID

### 7. `call_results` -> `calls` + `call_attempts` + `cdrs` + optional `call_events`

Current source fields:

- `id`
- `campaign_id`
- `phone_number`
- `dtmf`
- `status`
- `called_at`
- `duration`

Target mapping:

1. find `campaign`
2. find or create canonical `contact`
3. find `campaign_target` by `(campaign_id, phone_number)`
4. create one `calls` row
5. create one `call_attempts` row with `attempt_number=1`
6. create one `cdrs` row
7. optionally create historical `call_events` rows:
   - `answered` or `failed`
   - `dtmf` if present
   - `completed`

Disposition map for `cdrs.disposition`:

- `answered` -> `ANSWERED`
- `failed` -> `FAILED`
- `busy` -> `BUSY`
- `noanswer` -> `NOANSWER`
- `calling` -> `UNKNOWN`
- anything else -> uppercased legacy value

Notes:

- SQLite does not contain enough detail to rebuild full ring and hangup timing
- treat old `duration` as both `talk_duration_ms` and `bill_duration_ms` only if the call was answered
- if `dtmf` exists, write one `dtmf_events` row

## Phase 4: Data Normalization Rules

### Phone numbers

Normalize all phones using one shared function:

1. trim spaces
2. remove separators like `-`, `(`, `)`, and spaces
3. if number already starts with `+`, keep it
4. if number is Indian-format local/mobile and your tenant default country is India, convert to `+91...`
5. if the number cannot be normalized safely, write it to a quarantine file and skip insert

Do not silently invent country codes unless your tenant default is explicit.

### Status values

Map old ad-hoc statuses into the new constrained status values.

Keep original values inside JSON:

```json
{
  "legacy": {
    "source_table": "call_results",
    "legacy_status": "noanswer"
  }
}
```

### Dates

Legacy SQLite timestamps are stored as text.

Convert them to UTC `timestamptz` during import.

## Phase 5: Verification Queries

Run at least these checks after import:

### Count checks

```sql
SELECT COUNT(*) FROM sip_trunks;
SELECT COUNT(*) FROM contact_lists;
SELECT COUNT(*) FROM contacts;
SELECT COUNT(*) FROM campaigns;
SELECT COUNT(*) FROM campaign_targets;
SELECT COUNT(*) FROM cdrs;
```

### Uniqueness checks

```sql
SELECT organization_id, phone_e164, COUNT(*)
FROM contacts
GROUP BY organization_id, phone_e164
HAVING COUNT(*) > 1;
```

### Broken relations

```sql
SELECT COUNT(*)
FROM campaign_targets ct
LEFT JOIN campaigns c ON c.id = ct.campaign_id
WHERE c.id IS NULL;
```

### Random sampling

Manually inspect:

- 20 migrated contacts
- 20 migrated campaign targets
- 20 migrated CDRs
- 10 audio assets

## Phase 6: Shadow Mode

Before cutover:

1. run PostgreSQL-backed API in staging or alternate local port
2. read from PostgreSQL only
3. keep writes on SQLite in production
4. compare responses for:
   - campaign list
   - contacts list
   - SIP accounts
   - call logs

This catches mapping mistakes before real cutover.

## Phase 7: Cutover Checklist

1. Stop dialer workers.
2. Stop public API writes.
3. Take a final SQLite backup.
4. Re-run migration delta if new rows were created after the initial import.
5. Run verification checks.
6. Switch app config from SQLite to PostgreSQL.
7. Start API.
8. Start workers.
9. Run smoke tests.

Smoke tests:

- login works
- SIP trunks visible
- contact lists visible
- contacts visible
- campaign list visible
- call logs visible
- create contact
- create campaign
- trigger one test call

## Phase 8: Rollback Plan

If cutover fails:

1. stop PostgreSQL-backed API and workers
2. switch config back to SQLite
3. restart old API
4. keep PostgreSQL snapshot for diagnosis
5. fix ETL or schema issue
6. repeat cutover later

Do not delete SQLite until:

- at least 7 to 14 days of stable PostgreSQL operation
- billing totals reconcile
- historical CDR checks pass

## Recommended Order For Building The New Code

1. PostgreSQL + NestJS bootstrap
2. auth and organizations
3. contacts and contact import
4. telephony inventory
5. audio/media
6. campaigns
7. call execution and CDRs
8. billing
9. Magnus integration
10. public API and webhook outbox

## Practical First Migration Scope

For the first production move, migrate only:

- SIP trunks
- contact lists
- contacts
- campaigns
- campaign targets
- call history
- audio metadata

Leave these for phase 2 after cutover:

- wallet and recharge history
- Magnus account sync history
- advanced IVR graph versions
- webhook delivery history

## Suggested Acceptance Criteria

The migration is complete when:

1. all legacy SIP accounts exist as trunks
2. all legacy contact lists exist
3. all legacy portal contacts are available in canonical contacts and lists
4. all campaigns exist with target counts matching source
5. all legacy call results exist in CDRs
6. the new API can create a contact, campaign, and call request
7. one test call succeeds end to end on PostgreSQL-backed code
