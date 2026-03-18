#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');
const { Client } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function log(message) {
  console.log(`[db:import-legacy] ${message}`);
}

function getTargetConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'cludedialer_portal',
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD || undefined,
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function asUuidOrRandom(value) {
  return isUuid(value) ? String(value) : crypto.randomUUID();
}

function normalizePhone(input, defaultCountryCode = '+91') {
  const cleaned = String(input || '').trim().replace(/[^+0-9]/g, '');
  if (!cleaned) {
    return '';
  }

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (cleaned.startsWith('00')) {
    return `+${cleaned.slice(2)}`;
  }

  if (cleaned.length === 10) {
    return `${defaultCountryCode}${cleaned}`;
  }

  return cleaned;
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (text.includes('T')) {
    return text.endsWith('Z') ? text : `${text}Z`;
  }

  return `${text.replace(' ', 'T')}Z`;
}

function mimeTypeForExtension(extension) {
  const ext = String(extension || '').toLowerCase();
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.gsm') return 'audio/x-gsm';
  return 'audio/wav';
}

function mapLegacyCampaignStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'running') return 'running';
  if (value === 'paused') return 'paused';
  if (value === 'stopped') return 'stopped';
  if (value === 'completed') return 'completed';
  return 'draft';
}

function mapLegacyOutcome(status) {
  const value = String(status || '').toLowerCase();

  if (value === 'pending') {
    return { targetStatus: 'pending', lastDisposition: null, dialerStatus: 'pending' };
  }

  if (value === 'calling') {
    return { targetStatus: 'dialing', lastDisposition: null, dialerStatus: 'calling' };
  }

  if (value === 'answered' || value === 'answered_dtmf') {
    return {
      targetStatus: 'answered',
      lastDisposition: value === 'answered_dtmf' ? 'ANSWERED_DTMF' : 'ANSWERED',
      dialerStatus: 'answered',
    };
  }

  if (value === 'no_dtmf') {
    return { targetStatus: 'completed', lastDisposition: 'NO_DTMF', dialerStatus: 'no_dtmf' };
  }

  if (value === 'busy') {
    return { targetStatus: 'failed', lastDisposition: 'BUSY', dialerStatus: 'busy' };
  }

  if (value === 'noanswer' || value === 'no answer') {
    return { targetStatus: 'failed', lastDisposition: 'NOANSWER', dialerStatus: 'noanswer' };
  }

  if (value === 'called' || value === 'completed') {
    return { targetStatus: 'completed', lastDisposition: 'CALLED', dialerStatus: 'called' };
  }

  return { targetStatus: 'failed', lastDisposition: 'FAILED', dialerStatus: 'failed' };
}

async function fetchOne(client, text, params = []) {
  const result = await client.query(text, params);
  return result.rows[0] || null;
}

async function getBootstrapContext(client) {
  const orgSlug = process.env.APP_ORG_SLUG || 'legacy-autodialer';
  const userEmail = process.env.APP_BOOTSTRAP_USER_EMAIL || 'admin@cyberxcalls.local';

  const organization = await fetchOne(client, 'SELECT id, currency_code FROM organizations WHERE slug = $1 LIMIT 1', [orgSlug]);
  if (!organization) {
    throw new Error(`Bootstrap organization ${orgSlug} not found. Run npm run db:init first.`);
  }

  const user = await fetchOne(client, 'SELECT id FROM users WHERE email = $1 LIMIT 1', [userEmail]);
  if (!user) {
    throw new Error(`Bootstrap user ${userEmail} not found. Run npm run db:init first.`);
  }

  const defaultList = await fetchOne(
    client,
    `
      SELECT id
      FROM contact_lists
      WHERE organization_id = $1
        AND name = 'Default'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [organization.id],
  );
  if (!defaultList) {
    throw new Error('Default contact list not found. Run npm run db:init first.');
  }

  return {
    organizationId: organization.id,
    bootstrapUserId: user.id,
    currencyCode: organization.currency_code || process.env.APP_DEFAULT_CURRENCY || 'INR',
    defaultListId: defaultList.id,
  };
}

async function ensureCallerId(client, organizationId, number) {
  const normalized = normalizePhone(number);
  if (!normalized) {
    return null;
  }

  const existing = await fetchOne(
    client,
    `
      SELECT id
      FROM caller_ids
      WHERE organization_id = $1
        AND number_e164 = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [organizationId, normalized],
  );

  if (existing) {
    return existing.id;
  }

  const callerIdId = crypto.randomUUID();
  await client.query(
    `
      INSERT INTO caller_ids (
        id,
        organization_id,
        label,
        number_e164,
        verification_status,
        source,
        active
      )
      VALUES ($1, $2, $3, $4, 'imported', 'system', true)
    `,
    [callerIdId, organizationId, normalized, normalized],
  );

  return callerIdId;
}

async function ensureContactList(client, organizationId, legacyRow, defaultListId) {
  const listName = String(legacyRow.list_name || '').trim() || 'Default';
  const metadata = {
    legacy_contact_list_id: String(legacyRow.id),
    legacy_sip_account_id: legacyRow.sip_account_id || null,
  };

  const existing = await fetchOne(
    client,
    `
      SELECT id
      FROM contact_lists
      WHERE organization_id = $1
        AND name = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [organizationId, listName],
  );

  if (existing) {
    await client.query(
      `
        UPDATE contact_lists
        SET
          description = COALESCE(NULLIF($2, ''), description),
          metadata = COALESCE(contact_lists.metadata, '{}'::jsonb) || $3::jsonb,
          updated_at = now()
        WHERE id = $1
      `,
      [existing.id, legacyRow.description || '', JSON.stringify(metadata)],
    );
    return existing.id;
  }

  const listId = listName.toLowerCase() === 'default' ? defaultListId : crypto.randomUUID();
  await client.query(
    `
      INSERT INTO contact_lists (
        id,
        organization_id,
        name,
        description,
        source,
        metadata,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'import', $5::jsonb, COALESCE($6::timestamptz, now()), COALESCE($6::timestamptz, now()))
      ON CONFLICT DO NOTHING
    `,
    [listId, organizationId, listName, legacyRow.description || '', JSON.stringify(metadata), toTimestamp(legacyRow.created_at)],
  );
  return listId;
}

async function ensureCanonicalContact(client, params) {
  const {
    organizationId,
    legacyId,
    phone,
    displayName,
    source,
    createdAt,
    updatedAt,
    attributes,
  } = params;

  const existing = await fetchOne(
    client,
    `
      SELECT id, attributes, display_name
      FROM contacts
      WHERE organization_id = $1
        AND phone_e164 = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [organizationId, phone],
  );

  const mergedAttributes = JSON.stringify(attributes || {});

  if (existing) {
    await client.query(
      `
        UPDATE contacts
        SET
          display_name = CASE
            WHEN COALESCE(contacts.display_name, '') = '' AND COALESCE($3, '') <> '' THEN $3
            ELSE contacts.display_name
          END,
          source = COALESCE(contacts.source, $4),
          attributes = COALESCE(contacts.attributes, '{}'::jsonb) || $5::jsonb,
          updated_at = COALESCE($6::timestamptz, contacts.updated_at, now())
        WHERE id = $1
      `,
      [
        existing.id,
        organizationId,
        displayName || '',
        source || 'import',
        mergedAttributes,
        updatedAt || createdAt || null,
      ],
    );
    return existing.id;
  }

  const contactId = asUuidOrRandom(legacyId);
  await client.query(
    `
      INSERT INTO contacts (
        id,
        organization_id,
        external_ref,
        phone_e164,
        display_name,
        status,
        source,
        attributes,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'active',
        $6,
        $7::jsonb,
        COALESCE($8::timestamptz, now()),
        COALESCE($9::timestamptz, COALESCE($8::timestamptz, now()))
      )
    `,
    [
      contactId,
      organizationId,
      legacyId ? String(legacyId) : null,
      phone,
      displayName || '',
      source || 'import',
      mergedAttributes,
      createdAt || null,
      updatedAt || createdAt || null,
    ],
  );

  return contactId;
}

async function ensureContactListMember(client, listId, contactId) {
  await client.query(
    `
      INSERT INTO contact_list_members (contact_list_id, contact_id, added_at)
      VALUES ($1, $2, now())
      ON CONFLICT (contact_list_id, contact_id)
      DO NOTHING
    `,
    [listId, contactId],
  );
}

async function findAudioAssetId(client, organizationId, legacyAudioFile) {
  const audioKey = String(legacyAudioFile || '').trim();
  if (!audioKey) {
    return null;
  }

  if (isUuid(audioKey)) {
    const byId = await fetchOne(
      client,
      `
        SELECT id
        FROM audio_assets
        WHERE organization_id = $1
          AND id = $2::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [organizationId, audioKey],
    );
    if (byId) {
      return byId.id;
    }
  }

  const byStorage = await fetchOne(
    client,
    `
      SELECT id
      FROM audio_assets
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND (
          storage_key = $2
          OR storage_key LIKE $3
          OR metadata->>'legacy_audio_basename' = $2
        )
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [organizationId, audioKey, `${audioKey}.%`],
  );

  return byStorage?.id || null;
}

async function importSipAccounts(client, sqlite, context) {
  const rows = sqlite.prepare('SELECT * FROM sip_accounts ORDER BY created_at ASC').all();
  const trunkMap = new Map();

  for (const row of rows) {
    const trunkId = asUuidOrRandom(row.id);
    const callerIdId = await ensureCallerId(client, context.organizationId, row.caller_id);
    const existing = await fetchOne(
      client,
      `
        SELECT id
        FROM sip_trunks
        WHERE organization_id = $1
          AND (id = $2::uuid OR external_id = $3)
        LIMIT 1
      `,
      [context.organizationId, trunkId, String(row.id)],
    );

    const values = [
      context.organizationId,
      String(row.id),
      row.name || row.username || 'Legacy SIP',
      row.domain,
      Number(row.port || 5060),
      row.username,
      row.password,
      callerIdId,
      Boolean(row.is_active),
      toTimestamp(row.created_at),
    ];

    if (existing) {
      await client.query(
        `
          UPDATE sip_trunks
          SET
            external_id = $2,
            name = $3,
            provider_name = 'legacy-sqlite-import',
            host = $4,
            port = $5,
            username = $6,
            auth_username = $6,
            password_ciphertext = $7,
            domain = $4,
            from_user = $6,
            from_domain = $4,
            default_caller_id_id = $8,
            active = $9,
            created_at = COALESCE($10::timestamptz, created_at),
            updated_at = now()
          WHERE id = $1
        `,
        [existing.id, ...values.slice(1)],
      );
      trunkMap.set(String(row.id), existing.id);
      continue;
    }

    await client.query(
      `
        INSERT INTO sip_trunks (
          id,
          organization_id,
          external_id,
          name,
          provider_name,
          host,
          port,
          username,
          auth_username,
          password_ciphertext,
          domain,
          from_user,
          from_domain,
          default_caller_id_id,
          active,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, 'legacy-sqlite-import', $5, $6, $7, $7, $8, $5, $7, $5, $9, $10,
          COALESCE($11::timestamptz, now()),
          COALESCE($11::timestamptz, now())
        )
      `,
      [trunkId, ...values],
    );

    trunkMap.set(String(row.id), trunkId);
  }

  log(`Imported ${rows.length} SIP trunk records.`);
  return trunkMap;
}

async function importContactLists(client, sqlite, context) {
  const rows = sqlite.prepare('SELECT * FROM contact_lists ORDER BY created_at ASC').all();
  const listMap = new Map();

  for (const row of rows) {
    const listId = await ensureContactList(client, context.organizationId, row, context.defaultListId);
    listMap.set(String(row.id), listId);
  }

  listMap.set('default', context.defaultListId);
  log(`Imported ${rows.length} contact list records.`);
  return listMap;
}

async function importPortalContacts(client, sqlite, context, listMap) {
  const rows = sqlite.prepare('SELECT * FROM portal_contacts ORDER BY created_at ASC').all();

  for (const row of rows) {
    const phone = normalizePhone(row.phone_number);
    if (!phone) {
      continue;
    }

    const outcome = mapLegacyOutcome(row.status);
    const attributes = {
      dialer_status: outcome.dialerStatus,
      attempts: Number(row.attempts || 0),
      last_result: row.last_result || '-',
      legacy_portal_contact_id: String(row.id),
      legacy_sip_account_id: row.sip_account_id || null,
    };

    const contactId = await ensureCanonicalContact(client, {
      organizationId: context.organizationId,
      legacyId: row.id,
      phone,
      displayName: row.contact_name || '',
      source: 'import',
      createdAt: toTimestamp(row.created_at),
      updatedAt: toTimestamp(row.updated_at),
      attributes,
    });

    const listId = listMap.get(String(row.contact_list_id)) || context.defaultListId;
    await ensureContactListMember(client, listId, contactId);
  }

  log(`Imported ${rows.length} portal contact records.`);
}

async function importAudioAssets(client, context) {
  const soundsDir = process.env.ASTERISK_SOUNDS_DIR;
  if (!soundsDir || !fs.existsSync(soundsDir)) {
    log('ASTERISK_SOUNDS_DIR is not configured or not present. Skipping audio import.');
    return;
  }

  const files = fs.readdirSync(soundsDir).filter((name) => /\.(wav|mp3|ogg|gsm)$/i.test(name));
  const audioPrefix = process.env.ASTERISK_AUDIO_PREFIX || '/srv/var/lib/asterisk/sounds/custom_campaigns';

  for (const fileName of files) {
    const filePath = path.join(soundsDir, fileName);
    const stats = fs.statSync(filePath);
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    const preferredId = isUuid(baseName) ? baseName : crypto.randomUUID();
    const metadata = {
      asteriskPath: `${audioPrefix}/${baseName}`,
      legacy_audio_basename: baseName,
    };

    const existing = await fetchOne(
      client,
      `
        SELECT id
        FROM audio_assets
        WHERE organization_id = $1
          AND deleted_at IS NULL
          AND (
            storage_key = $2
            OR metadata->>'legacy_audio_basename' = $3
            OR (id = $4::uuid)
          )
        LIMIT 1
      `,
      [context.organizationId, fileName, baseName, preferredId],
    );

    if (existing) {
      await client.query(
        `
          UPDATE audio_assets
          SET
            original_filename = COALESCE(original_filename, $2),
            mime_type = COALESCE($3, mime_type),
            size_bytes = $4,
            metadata = COALESCE(audio_assets.metadata, '{}'::jsonb) || $5::jsonb,
            updated_at = now()
          WHERE id = $1
        `,
        [existing.id, fileName, mimeTypeForExtension(extension), stats.size, JSON.stringify(metadata)],
      );
      continue;
    }

    await client.query(
      `
        INSERT INTO audio_assets (
          id,
          organization_id,
          created_by_user_id,
          kind,
          storage_provider,
          storage_key,
          mime_type,
          original_filename,
          size_bytes,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, 'upload', 'local', $4, $5, $6, $7, $8::jsonb,
          COALESCE($9::timestamptz, now()),
          COALESCE($10::timestamptz, COALESCE($9::timestamptz, now()))
        )
      `,
      [
        preferredId,
        context.organizationId,
        context.bootstrapUserId,
        fileName,
        mimeTypeForExtension(extension),
        fileName,
        stats.size,
        JSON.stringify(metadata),
        stats.birthtime?.toISOString?.() || null,
        stats.mtime?.toISOString?.() || null,
      ],
    );
  }

  log(`Synced ${files.length} local audio assets.`);
}

async function importCampaigns(client, sqlite, context, trunkMap) {
  const rows = sqlite.prepare('SELECT * FROM campaigns ORDER BY created_at ASC').all();
  const campaignMap = new Map();

  for (const row of rows) {
    const campaignId = asUuidOrRandom(row.id);
    const trunkId = trunkMap.get(String(row.sip_account_id)) || null;
    const audioAssetId = await findAudioAssetId(client, context.organizationId, row.audio_file);
    const metadata = {
      legacy_audio_type: row.audio_type || 'upload',
      legacy_tts_text: row.tts_text || '',
      legacy_dtmf_digits: Number(row.dtmf_digits || 1),
      legacy_totals: {
        total_numbers: Number(row.total_numbers || 0),
        dialed: Number(row.dialed || 0),
        answered: Number(row.answered || 0),
      },
      legacy_audio_file: row.audio_file || null,
    };

    const existing = await fetchOne(
      client,
      `
        SELECT id
        FROM campaigns
        WHERE organization_id = $1
          AND (id = $2::uuid OR external_ref = $3)
        LIMIT 1
      `,
      [context.organizationId, campaignId, String(row.id)],
    );

    const values = [
      context.organizationId,
      String(row.id),
      row.name || 'Legacy Campaign',
      mapLegacyCampaignStatus(row.status),
      trunkId,
      audioAssetId,
      Number(row.concurrent_calls || 1),
      JSON.stringify(metadata),
      toTimestamp(row.created_at),
    ];

    if (existing) {
      await client.query(
        `
          UPDATE campaigns
          SET
            external_ref = $2,
            name = $3,
            status = $4,
            sip_trunk_id = $5,
            audio_asset_id = $6,
            max_concurrent_calls = $7,
            metadata = COALESCE(campaigns.metadata, '{}'::jsonb) || $8::jsonb,
            created_at = COALESCE($9::timestamptz, created_at),
            updated_at = now()
          WHERE id = $1
        `,
        [existing.id, ...values.slice(1)],
      );
      campaignMap.set(String(row.id), existing.id);
    } else {
      await client.query(
        `
          INSERT INTO campaigns (
            id,
            organization_id,
            external_ref,
            name,
            mode,
            status,
            sip_trunk_id,
            audio_asset_id,
            max_concurrent_calls,
            dtmf_capture_enabled,
            metadata,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, 'broadcast', $5, $6, $7, $8, true, $9::jsonb,
            COALESCE($10::timestamptz, now()),
            COALESCE($10::timestamptz, now())
          )
        `,
        [campaignId, ...values],
      );
      campaignMap.set(String(row.id), campaignId);
    }

    const persistedCampaignId = campaignMap.get(String(row.id));
    const source = await fetchOne(
      client,
      `
        SELECT id
        FROM campaign_sources
        WHERE campaign_id = $1
          AND source_type = 'manual'
        LIMIT 1
      `,
      [persistedCampaignId],
    );

    if (!source) {
      await client.query(
        `
          INSERT INTO campaign_sources (
            id,
            organization_id,
            campaign_id,
            source_type,
            criteria,
            created_at
          )
          VALUES ($1, $2, $3, 'manual', '{}'::jsonb, now())
        `,
        [crypto.randomUUID(), context.organizationId, persistedCampaignId],
      );
    }
  }

  log(`Imported ${rows.length} campaign records.`);
  return campaignMap;
}

async function importCampaignContacts(client, sqlite, context, campaignMap) {
  const rows = sqlite.prepare('SELECT * FROM contacts ORDER BY campaign_id, rowid ASC').all();

  for (const row of rows) {
    const campaignId = campaignMap.get(String(row.campaign_id));
    if (!campaignId) {
      continue;
    }

    const phone = normalizePhone(row.phone_number);
    if (!phone) {
      continue;
    }

    const outcome = mapLegacyOutcome(row.status);
    const contactId = await ensureCanonicalContact(client, {
      organizationId: context.organizationId,
      legacyId: row.id,
      phone,
      displayName: '',
      source: 'campaign',
      createdAt: null,
      updatedAt: null,
      attributes: {
        dialer_status: outcome.dialerStatus,
        attempts: 0,
        last_result: row.status || '-',
        legacy_campaign_contact_id: String(row.id),
      },
    });

    const existing = await fetchOne(
      client,
      `
        SELECT id
        FROM campaign_targets
        WHERE campaign_id = $1
          AND phone_e164 = $2
        LIMIT 1
      `,
      [campaignId, phone],
    );

    const targetId = asUuidOrRandom(row.id);
    const params = [
      context.organizationId,
      campaignId,
      contactId,
      phone,
      outcome.targetStatus,
      outcome.lastDisposition,
    ];

    if (existing) {
      await client.query(
        `
          UPDATE campaign_targets
          SET
            contact_id = $2,
            status = $3,
            last_disposition = $4,
            updated_at = now(),
            metadata = COALESCE(campaign_targets.metadata, '{}'::jsonb) || $5::jsonb
          WHERE id = $1
        `,
        [
          existing.id,
          contactId,
          outcome.targetStatus,
          outcome.lastDisposition,
          JSON.stringify({ legacy_campaign_contact_id: String(row.id) }),
        ],
      );
      continue;
    }

    await client.query(
      `
        INSERT INTO campaign_targets (
          id,
          organization_id,
          campaign_id,
          contact_id,
          source_ref,
          phone_e164,
          display_name,
          status,
          priority,
          last_disposition,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, '', $7, 100, $8, $9::jsonb, now(), now()
        )
        ON CONFLICT (campaign_id, phone_e164)
        DO NOTHING
      `,
      [
        targetId,
        context.organizationId,
        campaignId,
        contactId,
        String(row.id),
        phone,
        outcome.targetStatus,
        outcome.lastDisposition,
        JSON.stringify({ legacy_campaign_contact_id: String(row.id) }),
      ],
    );
  }

  log(`Imported ${rows.length} campaign contact rows.`);
}

async function importCallResults(client, sqlite, context, campaignMap) {
  const rows = sqlite.prepare('SELECT * FROM call_results ORDER BY called_at ASC').all();

  for (const row of rows) {
    const campaignId = campaignMap.get(String(row.campaign_id));
    if (!campaignId) {
      continue;
    }

    const phone = normalizePhone(row.phone_number);
    if (!phone) {
      continue;
    }

    const outcome = mapLegacyOutcome(row.status);
    const calledAt = toTimestamp(row.called_at) || new Date().toISOString();
    const durationMs = Math.max(0, Number(row.duration || 0)) * 1000;
    const contact = await fetchOne(
      client,
      `
        SELECT id
        FROM contacts
        WHERE organization_id = $1
          AND phone_e164 = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [context.organizationId, phone],
    );

    const target = await fetchOne(
      client,
      `
        SELECT id
        FROM campaign_targets
        WHERE campaign_id = $1
          AND phone_e164 = $2
        LIMIT 1
      `,
      [campaignId, phone],
    );

    if (target) {
      await client.query(
        `
          UPDATE campaign_targets
          SET
            status = $2,
            attempts_made = GREATEST(attempts_made, 1),
            last_attempt_at = $3::timestamptz,
            last_disposition = $4,
            last_dtmf = NULLIF($5, ''),
            updated_at = now()
          WHERE id = $1
        `,
        [target.id, outcome.targetStatus, calledAt, outcome.lastDisposition, String(row.dtmf || '')],
      );
    }

    if (contact) {
      await client.query(
        `
          UPDATE contacts
          SET
            last_called_at = $2::timestamptz,
            attributes = COALESCE(contacts.attributes, '{}'::jsonb) || $3::jsonb,
            updated_at = now()
          WHERE id = $1
        `,
        [
          contact.id,
          calledAt,
          JSON.stringify({
            dialer_status: outcome.dialerStatus,
            last_result: row.status || '-',
            last_dtmf: row.dtmf || '',
          }),
        ],
      );
    }

    const cdrId = asUuidOrRandom(row.id);
    const existing = await fetchOne(client, 'SELECT id FROM cdrs WHERE id = $1 LIMIT 1', [cdrId]);
    if (existing) {
      continue;
    }

    await client.query(
      `
        INSERT INTO cdrs (
          started_at,
          id,
          organization_id,
          campaign_id,
          contact_id,
          direction,
          provider_name,
          provider_cdr_ref,
          to_number_e164,
          disposition,
          answered_at,
          ended_at,
          bill_duration_ms,
          total_duration_ms,
          currency_code,
          dtmf_summary,
          raw_provider_payload,
          created_at
        )
        VALUES (
          $1::timestamptz,
          $2,
          $3,
          $4,
          $5,
          'outbound',
          'legacy-sqlite-import',
          $6,
          $7,
          $8,
          $9::timestamptz,
          ($1::timestamptz + (($10 / 1000.0) * interval '1 second')),
          $10,
          $10,
          $11,
          $12::jsonb,
          $13::jsonb,
          $1::timestamptz
        )
      `,
      [
        calledAt,
        cdrId,
        context.organizationId,
        campaignId,
        contact?.id || null,
        String(row.id),
        phone,
        String(row.status || '').toLowerCase(),
        ['answered', 'answered_dtmf', 'no_dtmf'].includes(String(row.status || '').toLowerCase()) ? calledAt : null,
        durationMs,
        context.currencyCode,
        JSON.stringify(row.dtmf ? { primary: String(row.dtmf) } : {}),
        JSON.stringify({
          legacy_call_result_id: String(row.id),
          legacy_status: row.status || '',
        }),
      ],
    );
  }

  log(`Imported ${rows.length} call result rows.`);
}

async function main() {
  const legacyPath =
    process.env.LEGACY_SQLITE_PATH ||
    path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'autodialer.db');

  if (!legacyPath || !fs.existsSync(legacyPath)) {
    log(`Legacy SQLite file not found at ${legacyPath}. Nothing to import.`);
    return;
  }

  const sqlite = new Database(legacyPath, { readonly: true, fileMustExist: true });
  const postgres = new Client(getTargetConfig());
  let transactionStarted = false;

  await postgres.connect();

  try {
    const context = await getBootstrapContext(postgres);
    const schemaCheck = await fetchOne(postgres, "SELECT to_regclass('public.organizations') AS table_name");
    if (!schemaCheck?.table_name) {
      throw new Error('PostgreSQL schema is not initialized. Run npm run db:init first.');
    }

    await postgres.query('BEGIN');
    transactionStarted = true;

    const trunkMap = await importSipAccounts(postgres, sqlite, context);
    const listMap = await importContactLists(postgres, sqlite, context);
    await importPortalContacts(postgres, sqlite, context, listMap);
    await importAudioAssets(postgres, context);
    const campaignMap = await importCampaigns(postgres, sqlite, context, trunkMap);
    await importCampaignContacts(postgres, sqlite, context, campaignMap);
    await importCallResults(postgres, sqlite, context, campaignMap);

    await postgres.query('COMMIT');
    transactionStarted = false;
    log('Legacy SQLite import complete.');
  } catch (error) {
    if (transactionStarted) {
      await postgres.query('ROLLBACK');
    }
    throw error;
  } finally {
    sqlite.close();
    await postgres.end();
  }
}

main().catch((error) => {
  console.error(`[db:import-legacy] ${error.stack || error.message}`);
  process.exit(1);
});
