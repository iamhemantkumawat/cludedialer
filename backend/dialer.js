require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { exec, execFile } = require('child_process');
const fs              = require('fs');
const os              = require('os');
const path            = require('path');
const db  = require('./db');
const ami = require('./ami');
const { accountRoom } = require('./account');
const { IVR_ENTRY_CONTEXT, getIvrEntryExtension, parseIvrDefinition, prepareIvrAssets } = require('./ivr');

const { renderTts } = require('./tts');

let io = null;

/**
 * activeCalls: Map<actionId, CallInfo>
 * CallInfo keeps every AMI identifier we discover for the live call so we can
 * correlate bridged queue/agent legs back to the same outbound contact.
 */
const activeCalls = new Map();

/**
 * runningCampaigns: Set<campaignId>
 */
const runningCampaigns = new Set();

function setIO(socketIO) {
  io = socketIO;
}

function toTitleCaseStatus(status = '') {
  return String(status || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

function buildPortalLastResult(status, dtmf = '', causeTxt = '', willRetry = false) {
  let result = '-';

  if (status === 'answered') {
    result = dtmf ? 'Answered + DTMF' : 'Answered (No DTMF)';
  } else if (causeTxt) {
    result = causeTxt;
  } else if (status) {
    result = toTitleCaseStatus(status);
  }

  return willRetry && status !== 'answered' ? `Retrying (${result})` : result;
}

function buildPortalStatus(status, willRetry = false) {
  if (willRetry) return 'pending';
  return status === 'answered' ? 'called' : status;
}

async function updatePortalContactState({ accountId, portalContactId, sourceContactListId, phoneNumber, status, attempts, lastResult }) {
  const sets = [];
  const params = [];

  if (status !== undefined) {
    sets.push('status = ?');
    params.push(status);
  }
  if (attempts !== undefined) {
    sets.push('attempts = ?');
    params.push(attempts);
  }
  if (lastResult !== undefined) {
    sets.push('last_result = ?');
    params.push(lastResult);
  }
  if (!sets.length) return;

  sets.push('updated_at = NOW()');

  if (portalContactId) {
    await db.run(
      `UPDATE portal_contacts SET ${sets.join(', ')} WHERE id = ? AND account_id = ?`,
      [...params, portalContactId, accountId]
    ).catch(() => {});
    return;
  }

  if (sourceContactListId && phoneNumber) {
    await db.run(
      `UPDATE portal_contacts SET ${sets.join(', ')} WHERE contact_list_id = ? AND account_id = ? AND phone_number = ?`,
      [...params, sourceContactListId, accountId, phoneNumber]
    ).catch(() => {});
  }
}

// ─── AMI event handlers ───────────────────────────────────────────────────────

ami.on('OriginateResponse', async (evt) => {
  const actionId = evt.actionid;
  if (!activeCalls.has(actionId)) return;

  const call = activeCalls.get(actionId);
  syncEventWithCall(evt, call);

  if ((evt.response || '').toLowerCase() === 'failure') {
    const reason = parseInt(evt.reason || '0');
    // reason is Q.931 cause code or special Asterisk originate reason
    let status = 'failed';
    if (reason === 4)  status = 'congestion';
    if (reason === 5)  status = 'busy';
    if (reason === 8)  status = 'no-answer';
    const causeTxt = evt['cause-txt'] || evt.reason || '';
    await finalizeCall(actionId, status, 0, causeTxt);
    return;
  }

  if (evt.channel)  call.channel  = evt.channel;
  if (evt.uniqueid) call.uniqueid = evt.uniqueid;
});

ami.on('Newchannel', (evt) => {
  const match = findMatchingCall(evt);
  if (!match) return;
  syncEventWithCall(evt, match.call);
});

ami.on('DialBegin', (evt) => {
  const match = findMatchingCall(evt);
  if (!match) return;
  syncEventWithCall(evt, match.call);
});

ami.on('BridgeEnter', (evt) => {
  const match = findMatchingCall(evt);
  if (!match) return;
  syncEventWithCall(evt, match.call);
});

ami.on('Newstate', async (evt) => {
  if (evt.channelstate !== '6' && evt.channelstatedesc !== 'Up') return;

  const match = findMatchingCall(evt);
  if (!match) return;

  const { call } = match;
  syncEventWithCall(evt, call);

  if (!call.answered) {
    call.answered  = true;
    call.startTime = Date.now();
    await db.run("UPDATE contacts SET status = 'answered' WHERE id = ?", [call.contactId]).catch(() => {});
    if (io) {
      io.to(accountRoom(call.accountId)).emit('call:answered', {
        campaignId: call.campaignId,
        contactId: call.contactId,
        phone: call.phoneNumber,
        startTime: call.startTime,
      });
    }
  }
});

ami.on('DTMFEnd', (evt) => {
  if ((evt.direction || '').toLowerCase() !== 'received') return;

  const match = findMatchingCall(evt);
  if (!match) return;

  const { call } = match;
  syncEventWithCall(evt, call);
  call.dtmf = (call.dtmf || '') + (evt.digit || '');
  // DTMF is only possible after answer — mark answered if race condition missed Newstate
  if (!call.answered) {
    call.answered  = true;
    call.startTime = call.startTime || Date.now();
    db.run("UPDATE contacts SET status = 'answered' WHERE id = ?", [call.contactId]).catch(() => {});
  }
  if (io) {
    io.to(accountRoom(call.accountId)).emit('call:dtmf', {
      campaignId: call.campaignId,
      contactId: call.contactId,
      phone: call.phoneNumber,
      digit: evt.digit,
    });
  }
});

// Q.931 cause → human status
function causeToStatus(cause, answered) {
  if (answered) return 'answered';
  switch (cause) {
    case 17: case 486: return 'busy';
    case 18: case 19: return 'no-answer';
    case 0:           return 'no-answer';      // unspecified timeout
    case 16:          return 'cancelled';       // CANCEL / normal clearing
    case 21: case 603: return 'rejected';       // call rejected
    case 1: case 2: case 3: case 27: case 28: return 'not-found'; // bad number
    case 34: case 38: case 41: case 42: case 63: return 'network-error';
    default:          return 'failed';
  }
}

ami.on('Hangup', async (evt) => {
  const match = findMatchingCall(evt);
  if (!match) return;

  const { actionId, call } = match;
  syncEventWithCall(evt, call);

  const cause    = parseInt(evt.cause || '0');
  const causeTxt = evt['cause-txt'] || evt.causetxt || evt['Cause-txt'] || '';
  const status   = causeToStatus(cause, call.answered);
  const duration = call.startTime ? Math.floor((Date.now() - call.startTime) / 1000) : 0;

  await hangupSiblingChannels(call, evt.channel);
  await finalizeCall(actionId, status, duration, causeTxt);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeChannel(channel) {
  return (channel || '').split(';')[0].trim();
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function isTrackableChannel(channel) {
  const normalized = normalizeChannel(channel).toUpperCase();
  return normalized.startsWith('SIP/')
    || normalized.startsWith('PJSIP/')
    || normalized.startsWith('IAX2/')
    || normalized.startsWith('DAHDI/');
}

function addChannel(call, channel) {
  if (!channel || !isTrackableChannel(channel)) return;
  if (!call.channels) call.channels = new Set();
  call.channels.add(String(channel).trim());
}

function addIdentifier(call, key, value) {
  if (!value) return;
  if (!call[key]) call[key] = new Set();
  call[key].add(String(value).trim());
}

function eventChannels(evt) {
  return uniqueValues([
    evt.channel,
    evt.destchannel,
    evt.channel1,
    evt.channel2,
    evt.srcchannel,
    evt.dstchannel,
    evt.bridgedchannel,
  ]);
}

function eventUniqueids(evt) {
  return uniqueValues([
    evt.uniqueid,
    evt.destuniqueid,
    evt.uniqueid1,
    evt.uniqueid2,
    evt.srcuniqueid,
    evt.dstuniqueid,
  ]);
}

function eventLinkedids(evt) {
  return uniqueValues([
    evt.linkedid,
    evt.destlinkedid,
    evt.linkedid1,
    evt.linkedid2,
  ]);
}

function syncEventWithCall(evt, call) {
  for (const channel of eventChannels(evt)) addChannel(call, channel);
  for (const uniqueid of eventUniqueids(evt)) addIdentifier(call, 'uniqueids', uniqueid);
  for (const linkedid of eventLinkedids(evt)) addIdentifier(call, 'linkedids', linkedid);

  if (!call.channel && evt.channel) call.channel = evt.channel;
  if (!call.uniqueid && evt.uniqueid) call.uniqueid = evt.uniqueid;
}

function matchChannel(evtChannel, call) {
  const target = normalizeChannel(evtChannel);
  if (!target) return false;
  if (call.channel && normalizeChannel(call.channel) === target) return true;
  if (!call.channels) return false;

  for (const channel of call.channels) {
    if (normalizeChannel(channel) === target) return true;
  }
  return false;
}

function matchUniqueid(evtUniqueid, call) {
  if (!evtUniqueid) return false;
  if (call.uniqueid && evtUniqueid === call.uniqueid) return true;
  return Boolean(call.uniqueids && call.uniqueids.has(evtUniqueid));
}

function matchLinkedid(evtLinkedid, call) {
  return Boolean(evtLinkedid && call.linkedids && call.linkedids.has(evtLinkedid));
}

function findMatchingCall(evt) {
  const channels = eventChannels(evt);
  const uniqueids = eventUniqueids(evt);
  const linkedids = eventLinkedids(evt);
  const hasTrackableChannel = channels.some((channel) => isTrackableChannel(channel));

  for (const [actionId, call] of activeCalls) {
    if (
      channels.some((channel) => matchChannel(channel, call))
      || uniqueids.some((uniqueid) => matchUniqueid(uniqueid, call))
      || (hasTrackableChannel && linkedids.some((linkedid) => matchLinkedid(linkedid, call)))
    ) {
      return { actionId, call };
    }
  }
  return null;
}

function getTrackedChannels(call) {
  return uniqueValues([
    call.channel,
    ...(call.channels ? [...call.channels] : []),
  ]);
}

async function hangupSiblingChannels(call, sourceChannel = '') {
  const source = normalizeChannel(sourceChannel);
  const channels = getTrackedChannels(call).filter((channel) => normalizeChannel(channel) !== source);

  for (const channel of channels) {
    try {
      await ami.hangupChannel(channel);
    } catch (_) {}
  }
}

async function finalizeCall(actionId, status, duration, causeTxt = '') {
  const call = activeCalls.get(actionId);
  if (!call || call.finalizing) return;
  call.finalizing = true;
  activeCalls.delete(actionId);

  const { campaignId, contactId, phoneNumber, callerId } = call;

  const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]).catch(() => null);
  const contact  = await db.get('SELECT attempts, portal_contact_id FROM contacts WHERE id = ?', [contactId]).catch(() => null);
  const attempts = ((contact ? parseInt(contact.attempts) : 0) || 0) + 1;
  const maxRetries = campaign ? (parseInt(campaign.retry_attempts) || 0) : 0;

  const willRetry = status !== 'answered' && attempts <= maxRetries;
  if (willRetry) {
    await db.run("UPDATE contacts SET status = 'pending', attempts = ? WHERE id = ?", [attempts, contactId]).catch(() => {});
  } else {
    await db.run('UPDATE contacts SET status = ?, attempts = ? WHERE id = ?', [status, attempts, contactId]).catch(() => {});
  }

  await db.run(`
    INSERT INTO call_results (id, account_id, campaign_id, phone_number, dtmf, status, duration, caller_id, cause_txt, called_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `, [uuidv4(), call.accountId, campaignId, phoneNumber, call.dtmf || '', status, duration, callerId || '', causeTxt]).catch(() => {});

  await updatePortalContactState({
    accountId: call.accountId,
    portalContactId: contact ? contact.portal_contact_id : '',
    sourceContactListId: campaign ? campaign.source_contact_list_id : null,
    phoneNumber,
    status: buildPortalStatus(status, willRetry),
    attempts,
    lastResult: buildPortalLastResult(status, call.dtmf || '', causeTxt, willRetry),
  });

  if (status === 'answered') {
    await db.run('UPDATE campaigns SET answered = answered + 1 WHERE id = ?', [campaignId]).catch(() => {});
  }

  const campaignUpdated = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]).catch(() => null);
  if (io) {
    io.to(accountRoom(call.accountId)).emit('call:ended', {
      campaignId,
      flowType: call.flowType || 'campaign',
      contactId,
      phone: phoneNumber,
      status,
      duration,
      dtmf: call.dtmf || '',
      retrying: willRetry,
      attempt: attempts,
      maxRetries,
    });
    if (campaignUpdated) {
      io.to(accountRoom(call.accountId)).emit('campaign:updated', campaignUpdated);
    }
  }

  if (runningCampaigns.has(campaignId)) {
    setImmediate(() => fillSlots(campaignId));
  }
}

// ─── TTS pre-generation ───────────────────────────────────────────────────────

async function generateTtsForCampaign(campaign) {
  if (campaign.audio_type !== 'tts' || !campaign.tts_text) return;

  const ttsFile  = `tts_${campaign.id}`;
  const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), `${ttsFile}_`));
  const mp3Path  = path.join(tmpDir, `${ttsFile}.mp3`);
  const gsmPath  = path.join(tmpDir, `${ttsFile}.gsm`);
  const wavPath  = path.join(tmpDir, `${ttsFile}.wav`);
  const container        = process.env.ASTERISK_CONTAINER || 'local-asterisk';
  const containerBasePath = `/var/lib/asterisk/sounds/custom/${ttsFile}`;

  try {
    await renderTts(campaign.tts_text, campaign.tts_language || 'en-US', campaign.tts_voice_type || 'female', mp3Path);
    await clearContainerTtsOutputs(container, containerBasePath);

    try {
      await convertAudioWithFfmpeg(mp3Path, gsmPath, ['-ar', '8000', '-ac', '1', '-c:a', 'gsm']);
      await copyToContainer(gsmPath, container, `${containerBasePath}.gsm`);
      console.log('[TTS] ready:', `${containerBasePath}.gsm`);
      return;
    } catch (gsmError) {
      console.warn('[TTS] GSM conversion failed, falling back to WAV:', gsmError.message);
    }

    await convertAudioWithFfmpeg(mp3Path, wavPath, ['-ar', '8000', '-ac', '1', '-c:a', 'pcm_s16le']);
    await copyToContainer(wavPath, container, `${containerBasePath}.wav`);
    console.log('[TTS] ready:', `${containerBasePath}.wav`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function copyToContainer(localPath, container, containerPath) {
  return new Promise((resolve, reject) => {
    exec(`docker exec ${container} mkdir -p /var/lib/asterisk/sounds/custom`, (err) => {
      if (err) return reject(new Error('mkdir in container failed: ' + err.message));
      exec(`docker cp ${localPath} ${container}:${containerPath}`, (err2) => {
        err2 ? reject(err2) : resolve();
      });
    });
  });
}

function execFileP(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (err, stdout, stderr) => {
      if (err) {
        reject(new Error((stderr || err.message || '').trim() || `${command} failed`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function convertAudioWithFfmpeg(inputPath, outputPath, extraArgs) {
  await execFileP('ffmpeg', ['-y', '-i', inputPath, ...extraArgs, outputPath]);
}

function clearContainerTtsOutputs(container, basePath) {
  return new Promise((resolve) => {
    exec(`docker exec ${container} sh -c "mkdir -p /var/lib/asterisk/sounds/custom && rm -f '${basePath}.gsm' '${basePath}.wav' '${basePath}.mp3'"`, () => {
      resolve();
    });
  });
}

// ─── Campaign engine ──────────────────────────────────────────────────────────

async function startCampaign(campaignId) {
  const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) throw new Error('Campaign not found');
  if (!['pending', 'paused', 'stopped'].includes(campaign.status)) {
    throw new Error(`Campaign is already ${campaign.status}`);
  }

  const hasPending = await db.get("SELECT id FROM contacts WHERE campaign_id = ? AND status = 'pending' LIMIT 1", [campaignId]);
  if (!hasPending) throw new Error('No pending contacts to dial');

  if (campaign.flow_type === 'ivr') {
    const definition = parseIvrDefinition(campaign.ivr_definition);
    if (!definition.nodes.length) throw new Error('IVR has no menu nodes configured');
    await prepareIvrAssets(campaign);
  } else {
    await generateTtsForCampaign(campaign);
  }

  await db.run("UPDATE campaigns SET status = 'running' WHERE id = ?", [campaignId]);
  runningCampaigns.add(campaignId);

  const updated = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (io) io.to(accountRoom(campaign.account_id)).emit('campaign:updated', updated);

  await fillSlots(campaignId);
}

async function fillSlots(campaignId) {
  if (!runningCampaigns.has(campaignId)) return;

  const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign || campaign.status !== 'running') return;

  const activeCount = [...activeCalls.values()].filter(c => c.campaignId === campaignId).length;
  const slots = parseInt(campaign.concurrent_calls) - activeCount;

  if (slots <= 0) return;

  for (let i = 0; i < slots; i++) {
    const contact = await db.get(`
      SELECT * FROM contacts WHERE campaign_id = ? AND status = 'pending' LIMIT 1
    `, [campaignId]);

    if (!contact) {
      if (activeCount + i === 0) completeCampaign(campaignId);
      break;
    }

    await dialContact(campaign, contact);
  }
}

async function dialContact(campaign, contact) {
  const sip      = await db.get('SELECT * FROM sip_accounts WHERE id = ?', [campaign.sip_account_id]);
  const queueCfg = await db.get('SELECT max_wait FROM queue_settings WHERE id = 1').catch(() => null);
  const queueMaxWait = (queueCfg && parseInt(queueCfg.max_wait)) || 120;
  if (!sip) {
    console.error('[Dialer] SIP account not found:', campaign.sip_account_id);
    return;
  }

  const actionId = uuidv4();
  const channel = (sip.channel_type || 'PJSIP') === 'SIP'
    ? `SIP/${sip.domain}/${contact.phone_number}`
    : `PJSIP/${contact.phone_number}@${sip.domain}`;
  const timeout = (parseInt(campaign.call_timeout) || 30) * 1000;
  const isIvrFlow = campaign.flow_type === 'ivr';
  const definition = isIvrFlow ? parseIvrDefinition(campaign.ivr_definition) : null;
  const rootNode = definition
    ? (definition.nodes.find((node) => node.id === definition.root_node_id) || definition.nodes[0] || null)
    : null;

  let audioFile = '';
  if (!isIvrFlow && campaign.audio_type === 'upload' && campaign.audio_file) {
    audioFile = 'custom/' + campaign.audio_file.replace(/\.[^.]+$/, '');
  } else if (!isIvrFlow && campaign.audio_type === 'tts' && campaign.tts_text) {
    audioFile = `custom/tts_${campaign.id}`;
  }
  const dtmfWait = (parseInt(campaign.dtmf_digits) || 0) > 0 ? 10 : 3;

  await db.run("UPDATE contacts SET status = 'calling' WHERE id = ?", [contact.id]);
  await db.run('UPDATE campaigns SET dialed = dialed + 1 WHERE id = ?', [campaign.id]);
  await updatePortalContactState({
    accountId: campaign.account_id,
    portalContactId: contact.portal_contact_id,
    sourceContactListId: campaign.source_contact_list_id,
    phoneNumber: contact.phone_number,
    status: 'calling',
    lastResult: 'Dialing...',
  });

  activeCalls.set(actionId, {
    accountId: campaign.account_id,
    campaignId: campaign.id,
    flowType: campaign.flow_type || 'campaign',
    contactId: contact.id,
    phoneNumber: contact.phone_number,
    callerId: sip.caller_id || campaign.name,
    channel,
    uniqueid: null,
    uniqueids: new Set(),
    linkedids: new Set(),
    channels: new Set([channel]),
    answered: false,
    startTime: null,
    dtmf: '',
    finalizing: false,
  });

  const campaignUpdated = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaign.id]);
  if (io) {
    io.to(accountRoom(campaign.account_id)).emit('call:started', {
      campaignId: campaign.id,
      flowType: campaign.flow_type || 'campaign',
      contactId: contact.id,
      phone: contact.phone_number,
    });
    io.to(accountRoom(campaign.account_id)).emit('campaign:updated', campaignUpdated);
  }

  try {
    await ami.originate({
      actionid: actionId,
      channel,
      context:  isIvrFlow ? IVR_ENTRY_CONTEXT : (process.env.ASTERISK_CONTEXT || 'autodialer'),
      exten:    isIvrFlow ? getIvrEntryExtension(campaign.id) : 's',
      priority: 1,
      timeout,
      callerid: sip.caller_id || campaign.name,
      variables: [
        `AUTODIALER_AUDIO=${audioFile}`,
        `AUTODIALER_CAMPAIGN_ID=${campaign.id}`,
        `AUTODIALER_CONTACT_ID=${contact.id}`,
        `AUTODIALER_PHONE_NUMBER=${contact.phone_number}`,
        `AUTODIALER_QUEUE_MAXWAIT=${queueMaxWait}`,
        `AUTODIALER_DTMF_DIGITS=${parseInt(campaign.dtmf_digits) || 0}`,
        `AUTODIALER_DTMF_WAIT=${dtmfWait}`,
        `AUTODIALER_TRANSFER_DEST=${campaign.transfer_on_dtmf && campaign.transfer_dest ? campaign.transfer_dest : ''}`,
        `AUTODIALER_FLOW_TYPE=${campaign.flow_type || 'campaign'}`,
        `AUTODIALER_IVR_START_NODE=${rootNode ? rootNode.id : ''}`,
      ],
    });
  } catch (err) {
    console.error('[Dialer] Originate failed:', err.message);
    activeCalls.delete(actionId);
    await db.run("UPDATE contacts SET status = 'failed' WHERE id = ?", [contact.id]).catch(() => {});
    if (runningCampaigns.has(campaign.id)) setImmediate(() => fillSlots(campaign.id));
  }
}

async function pauseCampaign(campaignId) {
  runningCampaigns.delete(campaignId);
  await db.run("UPDATE campaigns SET status = 'paused' WHERE id = ?", [campaignId]);
  await db.run("UPDATE contacts SET status = 'pending' WHERE campaign_id = ? AND status = 'calling'", [campaignId]);
  const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (io && campaign) io.to(accountRoom(campaign.account_id)).emit('campaign:updated', campaign);
}

async function stopCampaign(campaignId) {
  runningCampaigns.delete(campaignId);

  for (const [actionId, call] of activeCalls) {
    if (call.campaignId === campaignId) {
      for (const channel of getTrackedChannels(call)) {
        try { await ami.hangupChannel(channel); } catch (_) {}
      }
      activeCalls.delete(actionId);
    }
  }

  await db.run("UPDATE campaigns SET status = 'stopped' WHERE id = ?", [campaignId]);
  await db.run("UPDATE contacts SET status = 'pending' WHERE campaign_id = ? AND status = 'calling'", [campaignId]);
  const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (io && campaign) io.to(accountRoom(campaign.account_id)).emit('campaign:updated', campaign);
}

async function completeCampaign(campaignId) {
  runningCampaigns.delete(campaignId);
  await db.run("UPDATE campaigns SET status = 'completed' WHERE id = ?", [campaignId]);
  const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  console.log(`[Dialer] Campaign ${campaignId} completed`);
  if (io && campaign) {
    io.to(accountRoom(campaign.account_id)).emit('campaign:updated', campaign);
    io.to(accountRoom(campaign.account_id)).emit('campaign:completed', {
      campaignId,
      name: campaign.name || '',
      flowType: campaign.flow_type || 'campaign',
    });
  }
}

function getActiveCalls(accountId = '') {
  return [...activeCalls.entries()]
    .filter(([, c]) => !accountId || c.accountId === accountId)
    .map(([actionId, c]) => ({
      actionId,
      campaignId: c.campaignId,
      flowType:   c.flowType || 'campaign',
      contactId:  c.contactId,
      phone:      c.phoneNumber,
      answered:   c.answered,
      startTime:  c.startTime,
      dtmf:       c.dtmf,
      duration:   c.startTime ? Math.floor((Date.now() - c.startTime) / 1000) : 0,
    }));
}

module.exports = { startCampaign, pauseCampaign, stopCampaign, getActiveCalls, setIO };
