CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug citext NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'suspended', 'archived')),
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  currency_code char(3) NOT NULL DEFAULT 'INR',
  plan_code text NOT NULL DEFAULT 'starter',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  phone_e164 text,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'disabled')),
  is_platform_admin boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE permissions (
  code text PRIMARY KEY,
  category text NOT NULL,
  name text NOT NULL,
  description text
);

CREATE TABLE organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE organization_role_permissions (
  role_id uuid NOT NULL REFERENCES organization_roles(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES organization_roles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  ip_address inet,
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  label text NOT NULL,
  key_prefix text NOT NULL UNIQUE,
  key_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  auth_subject_type text NOT NULL DEFAULT 'organization' CHECK (auth_subject_type IN ('organization', 'user', 'service')),
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  rate_limit_per_minute integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE magnus_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_url text NOT NULL,
  api_username text,
  api_key_ciphertext text,
  allowed_ip inet,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  sync_sip_users boolean NOT NULL DEFAULT true,
  sync_balances boolean NOT NULL DEFAULT true,
  sync_caller_ids boolean NOT NULL DEFAULT true,
  sync_recharges boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE magnus_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  magnus_connection_id uuid NOT NULL REFERENCES magnus_connections(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  username text,
  account_code text,
  credit_balance numeric(18, 6) NOT NULL DEFAULT 0,
  currency_code char(3),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted', 'unknown')),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (magnus_connection_id, external_id)
);

CREATE TABLE magnus_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  magnus_connection_id uuid NOT NULL REFERENCES magnus_connections(id) ON DELETE CASCADE,
  sync_type text NOT NULL CHECK (sync_type IN ('full', 'sip_users', 'caller_ids', 'recharges', 'balances')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'partial')),
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_summary text,
  raw_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  currency_code char(3) NOT NULL,
  balance numeric(18, 6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, currency_code)
);

CREATE TABLE wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('credit', 'debit', 'refund', 'adjustment', 'hold', 'release')),
  source_type text NOT NULL CHECK (source_type IN ('manual', 'recharge', 'call_cost', 'api', 'magnus_sync', 'correction')),
  source_ref text,
  amount numeric(18, 6) NOT NULL CHECK (amount <> 0),
  currency_code char(3) NOT NULL,
  balance_before numeric(18, 6),
  balance_after numeric(18, 6),
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recharge_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  magnus_connection_id uuid REFERENCES magnus_connections(id) ON DELETE SET NULL,
  provider_ref text,
  amount numeric(18, 6) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  payment_channel text,
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE caller_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  magnus_connection_id uuid REFERENCES magnus_connections(id) ON DELETE SET NULL,
  external_id text,
  label text NOT NULL,
  number_e164 text NOT NULL,
  country_code text,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed', 'rejected', 'imported')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'magnus', 'provider', 'system')),
  active boolean NOT NULL DEFAULT true,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX ux_caller_ids_org_number_active
ON caller_ids (organization_id, number_e164)
WHERE deleted_at IS NULL;

CREATE TABLE sip_trunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  magnus_connection_id uuid REFERENCES magnus_connections(id) ON DELETE SET NULL,
  external_id text,
  name text NOT NULL,
  provider_name text,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 5060,
  transport text NOT NULL DEFAULT 'udp' CHECK (transport IN ('udp', 'tcp', 'tls', 'ws', 'wss')),
  username text,
  auth_username text,
  password_ciphertext text,
  domain text,
  from_user text,
  from_domain text,
  default_caller_id_id uuid,
  caller_id_mode text NOT NULL DEFAULT 'trunk_default' CHECK (caller_id_mode IN ('trunk_default', 'campaign', 'pool', 'api_supplied')),
  max_concurrent_calls integer NOT NULL DEFAULT 10,
  max_calls_per_second numeric(10, 2) NOT NULL DEFAULT 1,
  registration_required boolean NOT NULL DEFAULT true,
  registration_status text NOT NULL DEFAULT 'unknown' CHECK (registration_status IN ('unknown', 'registered', 'failed', 'disabled')),
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_registration_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, name)
);

CREATE TABLE sip_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  magnus_connection_id uuid REFERENCES magnus_connections(id) ON DELETE SET NULL,
  external_id text,
  username citext NOT NULL,
  display_name text,
  password_ciphertext text,
  domain text,
  default_caller_id_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted', 'unknown')),
  max_concurrent_calls integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, username)
);

CREATE TABLE caller_id_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  strategy text NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin', 'weighted', 'sticky_contact', 'random')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, name)
);

CREATE TABLE caller_id_pool_members (
  pool_id uuid NOT NULL REFERENCES caller_id_pools(id) ON DELETE CASCADE,
  caller_id_id uuid NOT NULL REFERENCES caller_ids(id) ON DELETE RESTRICT,
  weight integer NOT NULL DEFAULT 1,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, caller_id_id)
);

CREATE TABLE did_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  magnus_connection_id uuid REFERENCES magnus_connections(id) ON DELETE SET NULL,
  external_id text,
  number_e164 text NOT NULL,
  description text,
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound', 'both')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'ported', 'deleted')),
  routing_type text NOT NULL DEFAULT 'none' CHECK (routing_type IN ('ivr', 'sip_user', 'queue', 'webhook', 'none')),
  routing_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX ux_did_numbers_org_number_active
ON did_numbers (organization_id, number_e164)
WHERE deleted_at IS NULL;

ALTER TABLE sip_trunks
  ADD CONSTRAINT fk_sip_trunks_default_caller_id
  FOREIGN KEY (default_caller_id_id) REFERENCES caller_ids(id) ON DELETE SET NULL;

ALTER TABLE sip_users
  ADD CONSTRAINT fk_sip_users_default_caller_id
  FOREIGN KEY (default_caller_id_id) REFERENCES caller_ids(id) ON DELETE SET NULL;

CREATE TABLE contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name citext NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'api', 'system', 'magnus')),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX ux_contact_lists_org_name_active
ON contact_lists (organization_id, name)
WHERE deleted_at IS NULL;

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_ref text,
  phone_e164 text NOT NULL,
  display_name text,
  timezone text,
  language_code text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'do_not_call', 'invalid', 'archived')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'api', 'campaign', 'magnus', 'system')),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  last_called_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX ux_contacts_org_phone_active
ON contacts (organization_id, phone_e164)
WHERE deleted_at IS NULL;

CREATE TABLE contact_list_members (
  contact_list_id uuid NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  position integer,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_list_id, contact_id)
);

CREATE TABLE contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name citext NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE contact_tag_links (
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES contact_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE suppression_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dnc', 'blacklist', 'invalid', 'complaint')),
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE suppression_list_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  suppression_list_id uuid NOT NULL REFERENCES suppression_lists(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api', 'import', 'system', 'complaint')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (suppression_list_id, phone_e164)
);

CREATE TABLE contact_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_list_id uuid REFERENCES contact_lists(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('csv', 'txt', 'api', 'copy_paste')),
  original_filename text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'partial')),
  total_rows integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  error_summary text,
  raw_file_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE contact_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES contact_import_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone_e164 text,
  display_name text,
  status text NOT NULL CHECK (status IN ('inserted', 'updated', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_job_id, row_number)
);

CREATE TABLE voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai', 'google', 'aws', 'azure', 'system', 'custom')),
  voice_code text NOT NULL,
  language_code text NOT NULL,
  style text,
  speed numeric(5, 2) NOT NULL DEFAULT 1.0,
  pitch numeric(5, 2) NOT NULL DEFAULT 0,
  sample_rate integer NOT NULL DEFAULT 8000,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('upload', 'tts', 'recording', 'prompt', 'music_on_hold', 'generated')),
  storage_provider text NOT NULL CHECK (storage_provider IN ('local', 's3', 'r2', 'minio')),
  storage_key text NOT NULL,
  public_url text,
  mime_type text,
  original_filename text,
  checksum_sha256 text,
  size_bytes bigint,
  duration_ms integer,
  language_code text,
  tts_text text,
  voice_profile_id uuid REFERENCES voice_profiles(id) ON DELETE SET NULL,
  transcoding_status text NOT NULL DEFAULT 'not_required' CHECK (transcoding_status IN ('pending', 'ready', 'failed', 'not_required')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE campaign_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  weekly_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  holiday_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE campaign_retry_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  retry_on_statuses text[] NOT NULL DEFAULT ARRAY[]::text[],
  base_delay_seconds integer NOT NULL DEFAULT 300,
  max_delay_seconds integer NOT NULL DEFAULT 3600,
  backoff_mode text NOT NULL DEFAULT 'fixed' CHECK (backoff_mode IN ('fixed', 'linear', 'exponential')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE ivr_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  entry_node_key text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, name, version)
);

CREATE TABLE ivr_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ivr_flow_id uuid NOT NULL REFERENCES ivr_flows(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  node_type text NOT NULL CHECK (node_type IN ('play_audio', 'gather_digits', 'branch', 'transfer', 'webhook', 'pause', 'hangup', 'set_vars')),
  display_name text,
  audio_asset_id uuid REFERENCES audio_assets(id) ON DELETE SET NULL,
  voice_profile_id uuid REFERENCES voice_profiles(id) ON DELETE SET NULL,
  prompt_text text,
  min_digits integer,
  max_digits integer,
  timeout_ms integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ivr_flow_id, node_key)
);

CREATE TABLE ivr_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ivr_flow_id uuid NOT NULL REFERENCES ivr_flows(id) ON DELETE CASCADE,
  from_node_id uuid NOT NULL REFERENCES ivr_nodes(id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES ivr_nodes(id) ON DELETE CASCADE,
  match_type text NOT NULL CHECK (match_type IN ('always', 'dtmf', 'timeout', 'no_input', 'expression', 'error')),
  match_value text,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_ref text,
  name text NOT NULL,
  description text,
  mode text NOT NULL DEFAULT 'broadcast' CHECK (mode IN ('preview', 'power', 'predictive', 'broadcast', 'api')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'stopped', 'completed', 'archived')),
  sip_trunk_id uuid REFERENCES sip_trunks(id) ON DELETE SET NULL,
  sip_user_id uuid REFERENCES sip_users(id) ON DELETE SET NULL,
  caller_id_pool_id uuid REFERENCES caller_id_pools(id) ON DELETE SET NULL,
  ivr_flow_id uuid REFERENCES ivr_flows(id) ON DELETE SET NULL,
  audio_asset_id uuid REFERENCES audio_assets(id) ON DELETE SET NULL,
  voice_profile_id uuid REFERENCES voice_profiles(id) ON DELETE SET NULL,
  retry_policy_id uuid REFERENCES campaign_retry_policies(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES campaign_schedules(id) ON DELETE SET NULL,
  timezone text,
  max_concurrent_calls integer NOT NULL DEFAULT 1,
  max_calls_per_second numeric(10, 2) NOT NULL DEFAULT 1,
  dtmf_capture_enabled boolean NOT NULL DEFAULT true,
  record_calls boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_at timestamptz,
  end_at timestamptz,
  launched_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE campaign_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('contact_list', 'api_upload', 'manual', 'segment')),
  contact_list_id uuid REFERENCES contact_lists(id) ON DELETE SET NULL,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  source_ref text,
  phone_e164 text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'dialing', 'answered', 'completed', 'failed', 'skipped', 'cancelled', 'do_not_call')),
  priority integer NOT NULL DEFAULT 100,
  attempts_made integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  last_disposition text,
  last_dtmf text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, phone_e164)
);

CREATE TABLE campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  run_number integer NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'stopped', 'completed', 'failed')),
  triggered_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, run_number)
);

CREATE TABLE call_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  request_source text NOT NULL CHECK (request_source IN ('portal', 'public_api', 'campaign', 'worker', 'system', 'telegram_bot', 'mobile_app')),
  idempotency_key text,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_run_id uuid REFERENCES campaign_runs(id) ON DELETE SET NULL,
  campaign_target_id uuid REFERENCES campaign_targets(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  sip_trunk_id uuid REFERENCES sip_trunks(id) ON DELETE SET NULL,
  sip_user_id uuid REFERENCES sip_users(id) ON DELETE SET NULL,
  caller_id_id uuid REFERENCES caller_ids(id) ON DELETE SET NULL,
  ivr_flow_id uuid REFERENCES ivr_flows(id) ON DELETE SET NULL,
  requested_to_number text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'queued', 'rejected', 'cancelled')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_call_requests_org_idempotency
ON call_requests (organization_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE TABLE calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_request_id uuid REFERENCES call_requests(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_run_id uuid REFERENCES campaign_runs(id) ON DELETE SET NULL,
  campaign_target_id uuid REFERENCES campaign_targets(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound', 'callback')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'dialing', 'ringing', 'answered', 'completed', 'failed', 'cancelled')),
  to_number_e164 text NOT NULL,
  from_number_e164 text,
  sip_trunk_id uuid REFERENCES sip_trunks(id) ON DELETE SET NULL,
  sip_user_id uuid REFERENCES sip_users(id) ON DELETE SET NULL,
  caller_id_id uuid REFERENCES caller_ids(id) ON DELETE SET NULL,
  ivr_flow_id uuid REFERENCES ivr_flows(id) ON DELETE SET NULL,
  current_ivr_node_id uuid REFERENCES ivr_nodes(id) ON DELETE SET NULL,
  provider_call_ref text,
  asterisk_channel text,
  record_calls boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  hangup_cause text,
  hangup_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  sip_trunk_id uuid REFERENCES sip_trunks(id) ON DELETE SET NULL,
  sip_user_id uuid REFERENCES sip_users(id) ON DELETE SET NULL,
  caller_id_id uuid REFERENCES caller_ids(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'dialing', 'ringing', 'answered', 'completed', 'failed', 'cancelled')),
  provider_attempt_ref text,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  ring_duration_ms integer,
  talk_duration_ms integer,
  bill_duration_ms integer,
  hangup_cause text,
  hangup_source text,
  failure_code text,
  failure_reason text,
  cost_amount numeric(18, 6),
  cost_currency char(3),
  raw_provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, attempt_number)
);

CREATE TABLE dtmf_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  call_attempt_id uuid REFERENCES call_attempts(id) ON DELETE SET NULL,
  ivr_node_id uuid REFERENCES ivr_nodes(id) ON DELETE SET NULL,
  matched_edge_id uuid REFERENCES ivr_edges(id) ON DELETE SET NULL,
  digit text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  audio_asset_id uuid NOT NULL REFERENCES audio_assets(id) ON DELETE RESTRICT,
  storage_provider text NOT NULL CHECK (storage_provider IN ('local', 's3', 'r2', 'minio')),
  storage_key text NOT NULL,
  duration_ms integer,
  channels integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_url text NOT NULL,
  signing_secret_ciphertext text NOT NULL,
  subscribed_events text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  timeout_ms integer NOT NULL DEFAULT 10000,
  max_retries integer NOT NULL DEFAULT 10,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, name)
);

CREATE TABLE integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aggregate_type text NOT NULL,
  aggregate_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  request_id uuid,
  ip_address inet,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_default
PARTITION OF audit_logs DEFAULT;

CREATE TABLE call_events (
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  call_attempt_id uuid REFERENCES call_attempts(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('request_accepted', 'queued', 'dialing', 'ringing', 'answered', 'dtmf', 'ivr_transition', 'webhook_sent', 'completed', 'failed', 'hangup', 'recording_ready', 'note')),
  source text NOT NULL CHECK (source IN ('api', 'portal', 'asterisk', 'magnus', 'worker', 'system', 'user')),
  sequence_no bigint,
  node_key text,
  dtmf_digit text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

CREATE TABLE call_events_default
PARTITION OF call_events DEFAULT;

CREATE TABLE cdrs (
  started_at timestamptz NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  call_attempt_id uuid REFERENCES call_attempts(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  sip_trunk_id uuid REFERENCES sip_trunks(id) ON DELETE SET NULL,
  sip_user_id uuid REFERENCES sip_users(id) ON DELETE SET NULL,
  caller_id_id uuid REFERENCES caller_ids(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('outbound', 'inbound', 'callback')),
  provider_name text,
  provider_cdr_ref text,
  from_number_e164 text,
  to_number_e164 text,
  disposition text NOT NULL,
  hangup_cause text,
  hangup_disposition text,
  answered_at timestamptz,
  ended_at timestamptz,
  ring_duration_ms integer,
  talk_duration_ms integer,
  bill_duration_ms integer,
  total_duration_ms integer,
  cost_amount numeric(18, 6),
  sell_amount numeric(18, 6),
  margin_amount numeric(18, 6),
  currency_code char(3),
  dtmf_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  recording_available boolean NOT NULL DEFAULT false,
  raw_provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (started_at, id)
) PARTITION BY RANGE (started_at);

CREATE TABLE cdrs_default
PARTITION OF cdrs DEFAULT;

CREATE TABLE webhook_deliveries (
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  webhook_endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_id uuid,
  request_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_status integer,
  response_body text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

CREATE TABLE webhook_deliveries_default
PARTITION OF webhook_deliveries DEFAULT;

CREATE INDEX idx_sessions_user ON sessions (user_id, expires_at DESC);
CREATE INDEX idx_api_keys_org_status ON api_keys (organization_id, status);
CREATE INDEX idx_magnus_accounts_conn_external ON magnus_accounts (magnus_connection_id, external_id);
CREATE INDEX idx_magnus_sync_runs_conn_created ON magnus_sync_runs (magnus_connection_id, created_at DESC);
CREATE INDEX idx_wallet_transactions_wallet_created ON wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX idx_recharge_orders_org_status_created ON recharge_orders (organization_id, status, created_at DESC);
CREATE INDEX idx_caller_ids_org_status ON caller_ids (organization_id, verification_status, active);
CREATE INDEX idx_sip_trunks_org_active ON sip_trunks (organization_id, active, priority);
CREATE INDEX idx_sip_users_org_status ON sip_users (organization_id, status);
CREATE INDEX idx_contacts_org_status ON contacts (organization_id, status);
CREATE INDEX idx_contacts_org_last_called ON contacts (organization_id, last_called_at DESC);
CREATE INDEX idx_contact_list_members_contact ON contact_list_members (contact_id);
CREATE INDEX idx_suppression_entries_org_phone ON suppression_list_entries (organization_id, phone_e164);
CREATE INDEX idx_contact_import_jobs_org_created ON contact_import_jobs (organization_id, created_at DESC);
CREATE INDEX idx_audio_assets_org_kind_created ON audio_assets (organization_id, kind, created_at DESC);
CREATE INDEX idx_ivr_nodes_flow_sort ON ivr_nodes (ivr_flow_id, sort_order);
CREATE INDEX idx_ivr_edges_flow_from_priority ON ivr_edges (ivr_flow_id, from_node_id, priority);
CREATE INDEX idx_campaigns_org_status ON campaigns (organization_id, status, created_at DESC);
CREATE INDEX idx_campaign_targets_campaign_status_next
  ON campaign_targets (campaign_id, status, next_attempt_at, priority);
CREATE INDEX idx_campaign_targets_contact ON campaign_targets (contact_id);
CREATE INDEX idx_campaign_runs_campaign_status ON campaign_runs (campaign_id, status, created_at DESC);
CREATE INDEX idx_call_requests_org_status_created ON call_requests (organization_id, status, created_at DESC);
CREATE INDEX idx_calls_org_created ON calls (organization_id, created_at DESC);
CREATE INDEX idx_calls_campaign_status ON calls (campaign_id, status);
CREATE INDEX idx_call_attempts_call_attempt_number ON call_attempts (call_id, attempt_number);
CREATE INDEX idx_dtmf_events_call_received ON dtmf_events (call_id, received_at);
CREATE INDEX idx_call_recordings_call ON call_recordings (call_id);
CREATE INDEX idx_integration_events_status_available ON integration_events (status, available_at);
CREATE INDEX idx_audit_logs_org_created ON audit_logs (organization_id, created_at DESC);
CREATE INDEX idx_call_events_call_created ON call_events (call_id, created_at);
CREATE INDEX idx_call_events_attempt_created ON call_events (call_attempt_id, created_at);
CREATE INDEX idx_cdrs_org_started ON cdrs (organization_id, started_at DESC);
CREATE INDEX idx_cdrs_campaign_started ON cdrs (campaign_id, started_at DESC);
CREATE INDEX idx_webhook_endpoints_org_status ON webhook_endpoints (organization_id, status);
CREATE INDEX idx_webhook_deliveries_endpoint_created ON webhook_deliveries (webhook_endpoint_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status_retry ON webhook_deliveries (status, next_retry_at);

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'organizations',
    'users',
    'organization_roles',
    'organization_memberships',
    'sessions',
    'api_keys',
    'magnus_connections',
    'magnus_accounts',
    'magnus_sync_runs',
    'wallets',
    'recharge_orders',
    'sip_trunks',
    'sip_users',
    'caller_ids',
    'caller_id_pools',
    'did_numbers',
    'contact_lists',
    'contacts',
    'contact_tags',
    'suppression_lists',
    'contact_import_jobs',
    'voice_profiles',
    'audio_assets',
    'campaign_schedules',
    'campaign_retry_policies',
    'ivr_flows',
    'ivr_nodes',
    'campaigns',
    'campaign_targets',
    'campaign_runs',
    'call_requests',
    'calls',
    'call_attempts',
    'dtmf_events',
    'webhook_endpoints',
    'integration_events'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      tbl,
      tbl
    );
  END LOOP;
END;
$$;
