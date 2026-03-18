const { v4: uuidv4 } = require('uuid');
const { originateCall, getAMI } = require('./ami');
const db = require('./db');

// Track active calls: actionId -> { campaignId, phoneNumber, contactId }
const activeCalls = new Map();
// Track campaign workers: campaignId -> { running: bool }
const workers = new Map();

function getIo() { return global.io; }

function emit(event, data) {
  getIo()?.emit(event, data);
}

// ─── AMI Event Handler ───────────────────────────────────────────────────────

function setupAMIEvents() {
  const ami = getAMI();

  ami.on('managerevent', (evt) => {
    // Our custom DTMF/status event from the dialplan
    if (evt.event === 'UserEvent' && evt.userevent === 'CyberXDialer') {
      handleDialerEvent(evt);
      return;
    }

    // Originate response — catches no-answer, busy, failed before call is answered
    if (evt.event === 'OriginateResponse') {
      handleOriginateResponse(evt);
    }
  });
}

function handleDialerEvent(evt) {
  const campaignId = evt.campaignid;
  const phoneNumber = evt.number;
  const dtmf = evt.dtmf || '';
  const status = evt.status; // answered_dtmf | no_dtmf | hangup

  if (!campaignId || !phoneNumber) return;

  // Only record terminal statuses (not the intermediate hangup after dtmf event)
  if (status === 'answered_dtmf' || status === 'no_dtmf') {
    const resultId = uuidv4();
    db.prepare(`
      INSERT OR REPLACE INTO call_results (id, campaign_id, phone_number, dtmf, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(resultId, campaignId, phoneNumber, dtmf, status);

    db.prepare(`UPDATE contacts SET status = ? WHERE campaign_id = ? AND phone_number = ?`)
      .run(status === 'answered_dtmf' ? 'answered' : 'no_dtmf', campaignId, phoneNumber);

    db.prepare(`UPDATE campaigns SET answered = answered + 1 WHERE id = ?`).run(campaignId);

    emit('call:result', { campaignId, phoneNumber, dtmf, status });
    updateCampaignStats(campaignId);
  }

  // hangup — remove from active calls and possibly complete campaign
  if (status === 'hangup') {
    // Find and remove from active calls
    for (const [actionId, info] of activeCalls) {
      if (info.campaignId === campaignId && info.phoneNumber === phoneNumber) {
        activeCalls.delete(actionId);
        break;
      }
    }

    // If no result was recorded yet (user disconnected mid-playback without pressing a key),
    // record as 'no_dtmf'. This happens when Read() is interrupted by a hangup.
    const existing = db.prepare(
      'SELECT id FROM call_results WHERE campaign_id = ? AND phone_number = ?'
    ).get(campaignId, phoneNumber);

    if (!existing) {
      db.prepare(
        `INSERT INTO call_results (id, campaign_id, phone_number, dtmf, status) VALUES (?,?,?,'','no_dtmf')`
      ).run(uuidv4(), campaignId, phoneNumber);
      db.prepare(
        `UPDATE contacts SET status = 'no_dtmf' WHERE campaign_id = ? AND phone_number = ?`
      ).run(campaignId, phoneNumber);
    }

    db.prepare(`UPDATE campaigns SET dialed = dialed + 1 WHERE id = ?`).run(campaignId);
    emit('call:hangup', { campaignId, phoneNumber });
    updateCampaignStats(campaignId);
    checkCampaignCompletion(campaignId);
  }
}

function handleOriginateResponse(evt) {
  const actionId = evt.actionid;
  if (!actionId || !activeCalls.has(actionId)) return;

  const { campaignId, phoneNumber, contactId } = activeCalls.get(actionId);

  // Only handle failures — successful origination continues via handleDialerEvent
  if (evt.response === 'Failure') {
    const reason = evt.reason || 'failed';
    const status = reason === '17' ? 'busy' : reason === '19' ? 'noanswer' : 'failed';

    db.prepare(`
      INSERT INTO call_results (id, campaign_id, phone_number, dtmf, status)
      VALUES (?, ?, ?, '', ?)
    `).run(uuidv4(), campaignId, phoneNumber, status);

    db.prepare(`UPDATE contacts SET status = ? WHERE id = ?`).run(status, contactId);
    db.prepare(`UPDATE campaigns SET dialed = dialed + 1 WHERE id = ?`).run(campaignId);

    activeCalls.delete(actionId);
    emit('call:result', { campaignId, phoneNumber, dtmf: '', status });
    emit('call:hangup', { campaignId, phoneNumber });
    updateCampaignStats(campaignId);
    checkCampaignCompletion(campaignId);
  }
}

// ─── Campaign Control ─────────────────────────────────────────────────────────

async function startCampaign(campaignId, contactListId = null) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'running') return;

  const sip = db.prepare('SELECT * FROM sip_accounts WHERE id = ?').get(campaign.sip_account_id);
  if (!sip) throw new Error('SIP account not found');

  // If a contact list is supplied, replace pending contacts with numbers from that list
  if (contactListId) {
    const portalContacts = db.prepare(
      `SELECT phone_number FROM portal_contacts WHERE contact_list_id = ? AND status = 'pending'`
    ).all(contactListId);

    if (portalContacts.length === 0) throw new Error('No pending contacts in the selected list');

    const loadContacts = db.transaction(() => {
      db.prepare(`DELETE FROM contacts WHERE campaign_id = ? AND status = 'pending'`).run(campaignId);
      const ins = db.prepare(`INSERT OR IGNORE INTO contacts (id, campaign_id, phone_number) VALUES (?, ?, ?)`);
      for (const { phone_number } of portalContacts) {
        ins.run(require('uuid').v4(), campaignId, phone_number);
      }
      db.prepare(`UPDATE campaigns SET total_numbers = ? WHERE id = ?`).run(portalContacts.length, campaignId);
    });
    loadContacts();
    console.log(`[Dialer] Loaded ${portalContacts.length} contacts from list ${contactListId} into campaign ${campaignId}`);
  }

  db.prepare(`UPDATE campaigns SET status = 'running' WHERE id = ?`).run(campaignId);
  emit('campaign:update', { id: campaignId, status: 'running' });

  const worker = { running: true };
  workers.set(campaignId, worker);

  runDialerLoop(campaignId, campaign, sip, worker);
}

async function pauseCampaign(campaignId) {
  db.prepare(`UPDATE campaigns SET status = 'paused' WHERE id = ?`).run(campaignId);
  const worker = workers.get(campaignId);
  if (worker) worker.running = false;
  emit('campaign:update', { id: campaignId, status: 'paused' });
}

async function stopCampaign(campaignId) {
  db.prepare(`UPDATE campaigns SET status = 'stopped' WHERE id = ?`).run(campaignId);
  const worker = workers.get(campaignId);
  if (worker) worker.running = false;
  workers.delete(campaignId);
  emit('campaign:update', { id: campaignId, status: 'stopped' });
}

// ─── Dialer Loop ──────────────────────────────────────────────────────────────

async function runDialerLoop(campaignId, campaign, sip, worker) {
  while (worker.running) {
    const currentCampaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!currentCampaign || currentCampaign.status !== 'running') {
      worker.running = false;
      break;
    }

    const activeForCampaign = [...activeCalls.values()].filter(c => c.campaignId === campaignId).length;

    if (activeForCampaign < currentCampaign.concurrent_calls) {
      const slotsAvailable = currentCampaign.concurrent_calls - activeForCampaign;
      const contacts = db.prepare(
        `SELECT * FROM contacts WHERE campaign_id = ? AND status = 'pending' LIMIT ?`
      ).all(campaignId, slotsAvailable);

      if (contacts.length === 0) {
        // Wait for remaining active calls to finish
        if (activeForCampaign === 0) {
          checkCampaignCompletion(campaignId);
          worker.running = false;
          break;
        }
      }

      for (const contact of contacts) {
        db.prepare(`UPDATE contacts SET status = 'calling' WHERE id = ?`).run(contact.id);
        fireCall(campaignId, currentCampaign, sip, contact).catch(err => {
          console.error(`[Dialer] Call error for ${contact.phone_number}:`, err.message);
          db.prepare(`UPDATE contacts SET status = 'failed' WHERE id = ?`).run(contact.id);
        });
      }
    }

    await sleep(600);
  }
}

async function fireCall(campaignId, campaign, sip, contact) {
  const actionId = uuidv4();
  const audioPath = `${process.env.ASTERISK_AUDIO_PREFIX}/${campaign.audio_file}`;

  activeCalls.set(actionId, {
    campaignId,
    phoneNumber: contact.phone_number,
    contactId: contact.id,
  });

  // Use caller_id if set, otherwise use SIP username — avoids sending "AutoDialer" as
  // FROM display name which many SIP providers reject with 403 Forbidden
  const callerId = sip.caller_id
    ? `${sip.caller_id} <${sip.caller_id}>`
    : `${sip.username} <${sip.username}>`;

  try {
    await originateCall({
      channel: `SIP/${sip.username}/${contact.phone_number}`,
      callerId,
      timeout: 30000,
      actionId,
      variables: {
        CAMPAIGN_ID: campaignId,
        SIP_USER: sip.username,
        ORIGINAL_NUMBER: contact.phone_number,
        AUDIO_FILE: audioPath,
        DTMF_MAX_DIGITS: String(campaign.dtmf_digits),
      },
    });
    console.log(`[Dialer] Originated call to ${contact.phone_number} (ActionID: ${actionId})`);
    emit('call:started', { campaignId, phoneNumber: contact.phone_number });
  } catch (err) {
    console.error(`[Dialer] Originate failed for ${contact.phone_number}:`, err.message);
    activeCalls.delete(actionId);
    db.prepare(`UPDATE contacts SET status = 'failed' WHERE id = ?`).run(contact.id);
    db.prepare(`INSERT INTO call_results (id, campaign_id, phone_number, dtmf, status) VALUES (?,?,?,'','failed')`).run(uuidv4(), campaignId, contact.phone_number);
    emit('call:result', { campaignId, phoneNumber: contact.phone_number, dtmf: '', status: 'failed' });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function updateCampaignStats(campaignId) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status != 'pending' AND status != 'calling' THEN 1 ELSE 0 END) as dialed,
      SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered
    FROM contacts WHERE campaign_id = ?
  `).get(campaignId);

  emit('campaign:stats', { id: campaignId, ...stats });
}

function checkCampaignCompletion(campaignId) {
  const pending = db.prepare(
    `SELECT COUNT(*) as c FROM contacts WHERE campaign_id = ? AND status IN ('pending', 'calling')`
  ).get(campaignId);

  if (pending.c === 0) {
    const worker = workers.get(campaignId);
    if (worker) worker.running = false;
    workers.delete(campaignId);

    db.prepare(`UPDATE campaigns SET status = 'completed' WHERE id = ?`).run(campaignId);
    emit('campaign:update', { id: campaignId, status: 'completed' });
    console.log(`[Dialer] Campaign ${campaignId} completed`);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Startup cleanup ──────────────────────────────────────────────────────────
// If backend was restarted, any contacts stuck in "calling" go back to "pending"
// and any campaigns stuck in "running" go to "paused"
function resetStaleCalls() {
  const staleContacts = db.prepare(`UPDATE contacts SET status = 'pending' WHERE status = 'calling'`).run();
  const staleCampaigns = db.prepare(`UPDATE campaigns SET status = 'paused' WHERE status = 'running'`).run();
  if (staleContacts.changes > 0) console.log(`[Dialer] Reset ${staleContacts.changes} stale calling contacts → pending`);
  if (staleCampaigns.changes > 0) console.log(`[Dialer] Paused ${staleCampaigns.changes} campaigns that were running at shutdown`);
}

module.exports = { setupAMIEvents, startCampaign, pauseCampaign, stopCampaign, resetStaleCalls };
