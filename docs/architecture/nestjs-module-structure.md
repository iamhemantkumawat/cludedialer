# NestJS Module And File Structure

This structure is designed for:

- one codebase
- one PostgreSQL database
- one admin/public API app
- separate worker apps for dialing, integrations, and webhooks
- shared contracts for future web, mobile app, and Telegram bots

## Top Level Layout

```text
cludedialer/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── bootstrap/
│   │       ├── common/
│   │       ├── config/
│   │       ├── database/
│   │       ├── auth/
│   │       ├── health/
│   │       ├── admin/
│   │       ├── public-api/
│   │       ├── webhooks/
│   │       └── modules/
│   ├── worker-dialer/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── worker-dialer.module.ts
│   │       └── jobs/
│   ├── worker-integrations/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── worker-integrations.module.ts
│   │       └── jobs/
│   └── worker-webhooks/
│       └── src/
│           ├── main.ts
│           ├── worker-webhooks.module.ts
│           └── jobs/
├── libs/
│   ├── database/
│   │   ├── src/
│   │   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   └── database.module.ts
│   ├── common/
│   │   └── src/
│   │       ├── constants/
│   │       ├── decorators/
│   │       ├── exceptions/
│   │       ├── guards/
│   │       ├── interceptors/
│   │       ├── pipes/
│   │       ├── serializers/
│   │       └── utils/
│   ├── contracts/
│   │   └── src/
│   │       ├── dto/
│   │       ├── events/
│   │       ├── enums/
│   │       └── index.ts
│   ├── telephony/
│   │   └── src/
│   │       ├── asterisk/
│   │       ├── dialplan/
│   │       ├── providers/
│   │       └── telephony.module.ts
│   └── integrations/
│       └── src/
│           ├── magnus/
│           └── integrations.module.ts
└── docs/
    └── architecture/
```

## API App Structure

```text
apps/api/src/
├── main.ts
├── app.module.ts
├── bootstrap/
│   ├── app-factory.ts
│   ├── swagger.ts
│   └── validation.ts
├── common/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── pipes/
│   └── policies/
├── config/
│   ├── app.config.ts
│   ├── auth.config.ts
│   ├── bullmq.config.ts
│   ├── db.config.ts
│   ├── storage.config.ts
│   └── telephony.config.ts
├── database/
│   ├── prisma.service.ts
│   ├── prisma.module.ts
│   ├── transaction.util.ts
│   └── query-helpers/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts
│   ├── api-key.strategy.ts
│   ├── guards/
│   ├── dto/
│   └── policies/
├── health/
│   ├── health.module.ts
│   ├── health.controller.ts
│   └── health.service.ts
├── admin/
│   ├── admin.module.ts
│   └── admin.controller.ts
├── public-api/
│   ├── public-api.module.ts
│   ├── calls.controller.ts
│   ├── contacts.controller.ts
│   ├── campaigns.controller.ts
│   ├── api-idempotency.interceptor.ts
│   └── dto/
├── webhooks/
│   ├── webhooks.module.ts
│   ├── inbound-events.controller.ts
│   └── signature/
└── modules/
```

## Domain Modules

Each business module should follow the same pattern:

```text
modules/<module-name>/
├── <module-name>.module.ts
├── controllers/
├── services/
├── repositories/
├── dto/
├── entities/
├── events/
├── jobs/
├── policies/
├── mappers/
└── validators/
```

Use this rule:

- `controllers/` exposes admin or public HTTP endpoints
- `services/` contains orchestration and business rules
- `repositories/` contains Prisma/SQL queries only
- `dto/` contains request/response DTOs
- `entities/` contains domain models, not database tables
- `events/` contains emitted domain events
- `jobs/` contains BullMQ producers/processors used by the API app
- `policies/` contains permission and tenant checks
- `validators/` contains feature-specific validation

## Recommended Modules

### `modules/organizations`

Tables:

- `organizations`
- `organization_roles`
- `organization_role_permissions`
- `organization_memberships`

Files:

```text
modules/organizations/
├── organizations.module.ts
├── controllers/
│   ├── organizations.controller.ts
│   ├── memberships.controller.ts
│   └── roles.controller.ts
├── services/
│   ├── organizations.service.ts
│   ├── memberships.service.ts
│   └── roles.service.ts
├── repositories/
│   ├── organizations.repository.ts
│   ├── memberships.repository.ts
│   └── roles.repository.ts
├── dto/
└── policies/
```

### `modules/users`

Tables:

- `users`
- `sessions`

Files:

```text
modules/users/
├── users.module.ts
├── controllers/
│   └── users.controller.ts
├── services/
│   ├── users.service.ts
│   └── sessions.service.ts
├── repositories/
│   ├── users.repository.ts
│   └── sessions.repository.ts
└── dto/
```

### `modules/api-keys`

Tables:

- `api_keys`

Files:

```text
modules/api-keys/
├── api-keys.module.ts
├── controllers/
│   └── api-keys.controller.ts
├── services/
│   └── api-keys.service.ts
├── repositories/
│   └── api-keys.repository.ts
├── dto/
└── policies/
```

### `modules/audit`

Tables:

- `audit_logs`

Files:

```text
modules/audit/
├── audit.module.ts
├── services/
│   ├── audit.service.ts
│   └── audit-writer.service.ts
├── repositories/
│   └── audit.repository.ts
└── interceptors/
    └── audit.interceptor.ts
```

### `modules/magnus`

Tables:

- `magnus_connections`
- `magnus_accounts`
- `magnus_sync_runs`

Files:

```text
modules/magnus/
├── magnus.module.ts
├── controllers/
│   ├── magnus-connections.controller.ts
│   └── magnus-sync.controller.ts
├── services/
│   ├── magnus-connections.service.ts
│   ├── magnus-sync.service.ts
│   ├── magnus-recharge.service.ts
│   └── magnus-sip-sync.service.ts
├── repositories/
│   ├── magnus-connections.repository.ts
│   ├── magnus-accounts.repository.ts
│   └── magnus-sync-runs.repository.ts
├── clients/
│   └── magnus-api.client.ts
├── mappers/
│   └── magnus.mapper.ts
└── jobs/
    ├── sync-sip-users.job.ts
    ├── sync-caller-ids.job.ts
    └── sync-recharges.job.ts
```

### `modules/billing`

Tables:

- `wallets`
- `wallet_transactions`
- `recharge_orders`

Files:

```text
modules/billing/
├── billing.module.ts
├── controllers/
│   ├── wallets.controller.ts
│   └── recharges.controller.ts
├── services/
│   ├── wallets.service.ts
│   ├── recharge-orders.service.ts
│   └── ledger.service.ts
├── repositories/
│   ├── wallets.repository.ts
│   ├── wallet-transactions.repository.ts
│   └── recharge-orders.repository.ts
├── dto/
└── jobs/
    └── recharge-settlement.job.ts
```

### `modules/telephony`

Tables:

- `sip_trunks`
- `sip_users`
- `caller_ids`
- `caller_id_pools`
- `caller_id_pool_members`
- `did_numbers`

Files:

```text
modules/telephony/
├── telephony.module.ts
├── controllers/
│   ├── sip-trunks.controller.ts
│   ├── sip-users.controller.ts
│   ├── caller-ids.controller.ts
│   └── did-numbers.controller.ts
├── services/
│   ├── sip-trunks.service.ts
│   ├── sip-users.service.ts
│   ├── caller-ids.service.ts
│   ├── caller-id-pools.service.ts
│   └── did-routing.service.ts
├── repositories/
│   ├── sip-trunks.repository.ts
│   ├── sip-users.repository.ts
│   ├── caller-ids.repository.ts
│   ├── caller-id-pools.repository.ts
│   └── did-numbers.repository.ts
├── selectors/
│   ├── trunk-selector.service.ts
│   └── caller-id-selector.service.ts
└── health/
    └── telephony-health.service.ts
```

### `modules/contacts`

Tables:

- `contact_lists`
- `contacts`
- `contact_list_members`
- `contact_tags`
- `contact_tag_links`
- `suppression_lists`
- `suppression_list_entries`
- `contact_import_jobs`
- `contact_import_rows`

Files:

```text
modules/contacts/
├── contacts.module.ts
├── controllers/
│   ├── contacts.controller.ts
│   ├── contact-lists.controller.ts
│   ├── contact-tags.controller.ts
│   ├── suppression-lists.controller.ts
│   └── contact-imports.controller.ts
├── services/
│   ├── contacts.service.ts
│   ├── contact-lists.service.ts
│   ├── contact-tags.service.ts
│   ├── suppression-lists.service.ts
│   ├── contact-imports.service.ts
│   └── contact-normalization.service.ts
├── repositories/
│   ├── contacts.repository.ts
│   ├── contact-lists.repository.ts
│   ├── suppression-lists.repository.ts
│   └── contact-imports.repository.ts
├── dto/
├── mappers/
└── jobs/
    └── contact-import-processor.job.ts
```

### `modules/media`

Tables:

- `voice_profiles`
- `audio_assets`

Files:

```text
modules/media/
├── media.module.ts
├── controllers/
│   ├── audio-assets.controller.ts
│   └── voice-profiles.controller.ts
├── services/
│   ├── audio-assets.service.ts
│   ├── media-storage.service.ts
│   ├── media-transcode.service.ts
│   └── tts.service.ts
├── repositories/
│   ├── audio-assets.repository.ts
│   └── voice-profiles.repository.ts
├── dto/
└── jobs/
    ├── transcode-audio.job.ts
    └── generate-tts.job.ts
```

### `modules/ivr`

Tables:

- `ivr_flows`
- `ivr_nodes`
- `ivr_edges`

Files:

```text
modules/ivr/
├── ivr.module.ts
├── controllers/
│   └── ivr-flows.controller.ts
├── services/
│   ├── ivr-flows.service.ts
│   ├── ivr-runtime.service.ts
│   └── ivr-publish.service.ts
├── repositories/
│   ├── ivr-flows.repository.ts
│   ├── ivr-nodes.repository.ts
│   └── ivr-edges.repository.ts
├── dto/
├── validators/
│   └── ivr-graph.validator.ts
└── mappers/
    └── ivr-runtime.mapper.ts
```

### `modules/campaigns`

Tables:

- `campaign_schedules`
- `campaign_retry_policies`
- `campaigns`
- `campaign_sources`
- `campaign_targets`
- `campaign_runs`

Files:

```text
modules/campaigns/
├── campaigns.module.ts
├── controllers/
│   ├── campaigns.controller.ts
│   ├── campaign-runs.controller.ts
│   ├── campaign-schedules.controller.ts
│   └── campaign-retry-policies.controller.ts
├── services/
│   ├── campaigns.service.ts
│   ├── campaign-runs.service.ts
│   ├── campaign-dispatch.service.ts
│   ├── campaign-target-builder.service.ts
│   ├── campaign-schedules.service.ts
│   └── campaign-retry-policies.service.ts
├── repositories/
│   ├── campaigns.repository.ts
│   ├── campaign-runs.repository.ts
│   ├── campaign-targets.repository.ts
│   └── campaign-schedules.repository.ts
├── dto/
├── jobs/
│   ├── campaign-dispatch.job.ts
│   ├── campaign-target-build.job.ts
│   └── campaign-retry.job.ts
└── policies/
```

### `modules/calls`

Tables:

- `call_requests`
- `calls`
- `call_attempts`
- `call_events`
- `dtmf_events`
- `call_recordings`
- `cdrs`

Files:

```text
modules/calls/
├── calls.module.ts
├── controllers/
│   ├── calls.controller.ts
│   ├── cdrs.controller.ts
│   └── recordings.controller.ts
├── services/
│   ├── call-requests.service.ts
│   ├── calls.service.ts
│   ├── call-state-machine.service.ts
│   ├── call-event-writer.service.ts
│   ├── cdrs.service.ts
│   ├── recordings.service.ts
│   └── public-call-api.service.ts
├── repositories/
│   ├── call-requests.repository.ts
│   ├── calls.repository.ts
│   ├── call-attempts.repository.ts
│   ├── call-events.repository.ts
│   ├── dtmf-events.repository.ts
│   ├── cdrs.repository.ts
│   └── call-recordings.repository.ts
├── dto/
├── jobs/
│   ├── call-originate.job.ts
│   ├── call-finalize.job.ts
│   └── cdr-reconcile.job.ts
├── state/
│   └── call-status.machine.ts
└── mappers/
    └── cdr.mapper.ts
```

### `modules/webhook-outbox`

Tables:

- `webhook_endpoints`
- `webhook_deliveries`
- `integration_events`

Files:

```text
modules/webhook-outbox/
├── webhook-outbox.module.ts
├── controllers/
│   └── webhook-endpoints.controller.ts
├── services/
│   ├── webhook-endpoints.service.ts
│   ├── webhook-delivery.service.ts
│   └── outbox.service.ts
├── repositories/
│   ├── webhook-endpoints.repository.ts
│   ├── webhook-deliveries.repository.ts
│   └── integration-events.repository.ts
├── dto/
└── jobs/
    ├── publish-integration-event.job.ts
    └── deliver-webhook.job.ts
```

## Worker Apps

### `apps/worker-dialer`

Purpose:

- originate outbound calls
- retry failed attempts
- update call state
- write call events and CDRs

Imports:

- `libs/database`
- `libs/telephony`
- `modules/calls`
- `modules/campaigns`
- `modules/telephony`
- `modules/media`
- `modules/ivr`

Core jobs:

- `campaign-dispatch`
- `call-originate`
- `call-finalize`
- `campaign-retry`

### `apps/worker-integrations`

Purpose:

- sync Magnus SIP users
- sync caller IDs
- sync balances and recharges
- reconcile external billing data

Imports:

- `libs/database`
- `libs/integrations`
- `modules/magnus`
- `modules/billing`
- `modules/telephony`

Core jobs:

- `magnus-sync-sip-users`
- `magnus-sync-caller-ids`
- `magnus-sync-recharges`
- `magnus-sync-balances`

### `apps/worker-webhooks`

Purpose:

- publish outbox events
- sign and deliver customer webhooks
- retry failed webhook deliveries

Imports:

- `libs/database`
- `modules/webhook-outbox`

Core jobs:

- `publish-integration-event`
- `deliver-webhook`

## Shared Library Rules

### `libs/database`

Contains:

- Prisma client and generated types
- raw SQL helpers for high-volume CDR/call-event queries
- migration runner

### `libs/contracts`

Contains:

- public API DTOs
- event payload types
- reusable enums and response shapes

This is the package future mobile apps and Telegram bots should import.

### `libs/telephony`

Contains:

- Asterisk AMI client
- call originate adapter
- provider-specific payload builders
- telephony health checks

This prevents telephony code from leaking into HTTP controllers.

### `libs/integrations/magnus`

Contains:

- Magnus API client
- request signing and auth helpers
- payload mappers
- retry-safe integration wrappers

## Request Flow Guidelines

Use this pattern for all new features:

1. Controller validates request and tenant context.
2. Service applies business rules and opens a DB transaction if needed.
3. Repository writes normalized records.
4. Service emits domain event or enqueues BullMQ job.
5. Worker processes long-running or telephony work.
6. Event/outbox module pushes webhook notifications.

## What Not To Do

- Do not put SQL in controllers.
- Do not call MagnusBilling directly from the frontend.
- Do not let the API app hold long-running dialing loops.
- Do not mix webhook retry logic into business modules.
- Do not let mobile/Telegram clients consume internal tables directly.

## Recommended First Build Order

1. `organizations`, `users`, `auth`, `api-keys`
2. `contacts`
3. `telephony`
4. `media`
5. `ivr`
6. `campaigns`
7. `calls`
8. `billing`
9. `magnus`
10. `webhook-outbox`
