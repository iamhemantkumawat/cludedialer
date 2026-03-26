require('dotenv').config();
const { exec, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('./db');
const { queueName } = require('./routes/queue');

const CONTAINER = process.env.ASTERISK_CONTAINER || 'local-asterisk';
const { renderTts } = require('./tts');
const IVR_ENTRY_CONTEXT = process.env.ASTERISK_IVR_ENTRY_CONTEXT || 'autodialer-ivr-entry';
const LOCAL_IVR_DIALPLAN = '/tmp/extensions_autodialer_ivr.conf';
const CONTAINER_IVR_DIALPLAN = '/etc/asterisk/extensions_autodialer_ivr.conf';
const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'default'];
const NODE_ACTION_TYPES = new Set(['none', 'node', 'queue', 'agent', 'hangup']);

function execP(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message || '').trim() || `${command} failed`));
        return;
      }
      resolve(stdout || '');
    });
  });
}

function execFileP(command, args) {
  return new Promise((resolve, reject) => {
    const { execFile: _ef } = require('child_process');
    _ef(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message || '').trim() || `${command} failed`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function safeToken(value, fallback = 'node') {
  const token = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  return token || fallback;
}

function normalizeVoiceType(value = '') {
  return String(value).trim().toLowerCase() === 'male' ? 'male' : 'female';
}

function normalizeRoute(route) {
  const type = NODE_ACTION_TYPES.has(String(route?.type || '').trim().toLowerCase())
    ? String(route.type).trim().toLowerCase()
    : 'none';
  const target = String(route?.target || '').trim();
  return { type, target };
}

function normalizeNode(node, index) {
  const audioType = ['none', 'upload', 'tts'].includes(String(node?.audio_type || '').trim())
    ? String(node.audio_type).trim()
    : 'none';
  const routes = {};
  for (const key of DIGIT_KEYS) {
    routes[key] = normalizeRoute(node?.routes?.[key]);
  }

  return {
    id: safeToken(node?.id || `node_${index + 1}`, `node_${index + 1}`),
    name: String(node?.name || `Menu ${index + 1}`).trim() || `Menu ${index + 1}`,
    audio_type: audioType,
    audio_file: String(node?.audio_file || '').trim(),
    tts_text: String(node?.tts_text || '').trim(),
    tts_language: String(node?.tts_language || 'en-US').trim() || 'en-US',
    tts_voice_type: normalizeVoiceType(node?.tts_voice_type),
    wait_seconds: Math.max(1, Math.min(30, parseInt(node?.wait_seconds || '6', 10) || 6)),
    routes,
  };
}

function normalizeIvrDefinition(definition) {
  const source = definition && typeof definition === 'object' && !Array.isArray(definition) ? definition : {};
  const seen = new Set();
  const nodes = (Array.isArray(source.nodes) ? source.nodes : []).map((node, index) => {
    const normalized = normalizeNode(node, index);
    let nextId = normalized.id;
    let suffix = 2;
    while (seen.has(nextId)) {
      nextId = `${normalized.id}_${suffix++}`;
    }
    seen.add(nextId);
    return { ...normalized, id: nextId };
  });

  if (!nodes.length) {
    nodes.push(normalizeNode({}, 0));
  }

  const rootCandidate = safeToken(source.root_node_id || nodes[0].id, nodes[0].id);
  const rootNodeId = nodes.some((node) => node.id === rootCandidate) ? rootCandidate : nodes[0].id;

  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    for (const key of DIGIT_KEYS) {
      const route = node.routes[key];
      if (route.type === 'node' && !nodeIds.has(route.target)) {
        node.routes[key] = { type: 'none', target: '' };
      }
    }
  }

  return { root_node_id: rootNodeId, nodes };
}

function parseIvrDefinition(raw) {
  if (!raw) return normalizeIvrDefinition({});
  if (typeof raw === 'string') {
    try {
      return normalizeIvrDefinition(JSON.parse(raw));
    } catch {
      return normalizeIvrDefinition({});
    }
  }
  return normalizeIvrDefinition(raw);
}

function serializeIvrDefinition(definition) {
  return JSON.stringify(normalizeIvrDefinition(definition));
}

function getIvrEntryExtension(flowId) {
  return `ivr_${safeToken(flowId, 'flow').replace(/-/g, '_')}`;
}

function getIvrNodeContext(flowId, nodeId) {
  return `ad_ivr_${safeToken(flowId, 'flow').replace(/-/g, '_')}_${safeToken(nodeId, 'node').replace(/-/g, '_')}`;
}

function getIvrTtsBaseName(flowId, nodeId) {
  return `tts_ivr_${safeToken(flowId, 'flow')}_${safeToken(nodeId, 'node')}`.slice(0, 72);
}

function getNodePromptSound(flowId, node) {
  if (node.audio_type === 'upload' && node.audio_file) {
    return `custom/${node.audio_file.replace(/\.[^.]+$/, '')}`;
  }
  if (node.audio_type === 'tts' && node.tts_text) {
    return `custom/${getIvrTtsBaseName(flowId, node.id)}`;
  }
  return '';
}

async function convertAudioWithFfmpeg(inputPath, outputPath, extraArgs) {
  await execFileP('ffmpeg', ['-y', '-i', inputPath, ...extraArgs, outputPath]);
}

function copyToContainer(localPath, containerPath) {
  return execP(`docker cp "${localPath}" ${CONTAINER}:${containerPath}`);
}

function clearContainerPromptOutputs(basePath) {
  return execP(`docker exec ${CONTAINER} sh -c "mkdir -p /var/lib/asterisk/sounds/custom && rm -f '${basePath}.gsm' '${basePath}.wav' '${basePath}.mp3'"`).catch(() => '');
}

async function syncTtsPrompt(flowId, node) {
  const baseName = getIvrTtsBaseName(flowId, node.id);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${baseName}_`));
  const mp3Path = path.join(tmpDir, `${baseName}.mp3`);
  const gsmPath = path.join(tmpDir, `${baseName}.gsm`);
  const wavPath = path.join(tmpDir, `${baseName}.wav`);
  const containerBasePath = `/var/lib/asterisk/sounds/custom/${baseName}`;

  try {
    await renderTts(node.tts_text, node.tts_language || 'en-US', node.tts_voice_type || 'female', mp3Path);
    await clearContainerPromptOutputs(containerBasePath);

    try {
      await convertAudioWithFfmpeg(mp3Path, gsmPath, ['-ar', '8000', '-ac', '1', '-c:a', 'gsm']);
      await copyToContainer(gsmPath, `${containerBasePath}.gsm`);
      return;
    } catch (_) {}

    await convertAudioWithFfmpeg(mp3Path, wavPath, ['-ar', '8000', '-ac', '1', '-c:a', 'pcm_s16le']);
    await copyToContainer(wavPath, `${containerBasePath}.wav`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function prepareIvrAssets(flow) {
  const definition = parseIvrDefinition(flow.ivr_definition);
  for (const node of definition.nodes) {
    if (node.audio_type === 'tts' && node.tts_text) {
      await syncTtsPrompt(flow.id, node);
    }
  }
}

function buildRouteSteps(route, flow, definition, agentMap) {
  const resolved = normalizeRoute(route);

  if (resolved.type === 'node') {
    const targetNode = definition.nodes.find((node) => node.id === resolved.target);
    if (!targetNode) return ['Hangup()'];
    return [`Goto(${getIvrNodeContext(flow.id, targetNode.id)},s,1)`];
  }

  if (resolved.type === 'queue') {
    return [
      'Set(CALLERID(num)=${AUTODIALER_PHONE_NUMBER})',
      'Set(CALLERID(name)=${AUTODIALER_PHONE_NUMBER})',
      'Playback(transfer)',
      `Queue(${queueName(flow.account_id)},tT,,,\${AUTODIALER_QUEUE_MAXWAIT})`,
      'Hangup()',
    ];
  }

  if (resolved.type === 'agent') {
    const agentUsername = agentMap.get(`${flow.account_id}:${resolved.target}`);
    if (!agentUsername) return ['Hangup()'];
    return [
      'Set(CALLERID(num)=${AUTODIALER_PHONE_NUMBER})',
      'Set(CALLERID(name)=${AUTODIALER_PHONE_NUMBER})',
      'Playback(transfer)',
      `Dial(SIP/${agentUsername},120,tTr)`,
      'Hangup()',
    ];
  }

  return ['Hangup()'];
}

function buildExtension(extension, route, flow, definition, agentMap) {
  const steps = buildRouteSteps(route, flow, definition, agentMap);
  const lines = [`exten => ${extension},1,${steps[0]}`];
  for (const step of steps.slice(1)) {
    lines.push(` same => n,${step}`);
  }
  return lines;
}

function buildNodeContext(flow, node, definition, agentMap) {
  const contextName = getIvrNodeContext(flow.id, node.id);
  const prompt = getNodePromptSound(flow.id, node);
  const lines = [`[${contextName}]`];

  lines.push(`exten => s,1,NoOp(IVR ${flow.id} node ${node.id})`);
  lines.push(' same => n,ExecIf($["${CHANNEL(state)}" != "Up"]?Answer())');
  lines.push(' same => n,Set(CALLERID(num)=${AUTODIALER_PHONE_NUMBER})');
  lines.push(' same => n,Set(CALLERID(name)=${AUTODIALER_PHONE_NUMBER})');
  if (prompt) {
    lines.push(` same => n,Background(${prompt})`);
  }
  lines.push(` same => n,WaitExten(${node.wait_seconds || 6})`);
  lines.push(' same => n,Goto(default,1)');

  for (const digit of DIGIT_KEYS.filter((key) => key !== 'default')) {
    lines.push(...buildExtension(digit, node.routes[digit], flow, definition, agentMap));
  }
  lines.push(...buildExtension('default', node.routes.default, flow, definition, agentMap));
  lines.push('exten => i,1,Goto(default,1)');
  lines.push('exten => t,1,Goto(default,1)');
  lines.push('exten => h,1,Hangup()');
  lines.push('');

  return lines.join('\n');
}

function buildIvrDialplan(flows, agentMap) {
  const lines = [
    '; Auto-generated IVR dialplan for CyberX AutoDialer',
    '; Do not edit manually',
    '',
    `[${IVR_ENTRY_CONTEXT}]`,
  ];

  if (!flows.length) {
    lines.push('exten => _X.,1,Hangup()');
    lines.push('');
    return lines.join('\n');
  }

  for (const flow of flows) {
    const definition = parseIvrDefinition(flow.ivr_definition);
    const rootNode = definition.nodes.find((node) => node.id === definition.root_node_id) || definition.nodes[0];
    lines.push(`exten => ${getIvrEntryExtension(flow.id)},1,Goto(${getIvrNodeContext(flow.id, rootNode.id)},s,1)`);
  }

  lines.push('');

  for (const flow of flows) {
    const definition = parseIvrDefinition(flow.ivr_definition);
    for (const node of definition.nodes) {
      lines.push(buildNodeContext(flow, node, definition, agentMap));
    }
  }

  return lines.join('\n');
}

async function rebuildIvrDialplan() {
  const flows = await db.all(`
    SELECT *
    FROM campaigns
    WHERE flow_type = 'ivr'
    ORDER BY account_id, created_at
  `);
  const agents = await db.all('SELECT id, account_id, username FROM agents ORDER BY account_id, created_at');
  const agentMap = new Map(agents.map((agent) => [`${agent.account_id}:${agent.id}`, agent.username]));
  const content = buildIvrDialplan(flows, agentMap);

  fs.writeFileSync(LOCAL_IVR_DIALPLAN, content);
  await copyToContainer(LOCAL_IVR_DIALPLAN, CONTAINER_IVR_DIALPLAN);
  await execP(
    `docker exec ${CONTAINER} sh -c "grep -q 'extensions_autodialer_ivr.conf' /etc/asterisk/extensions_local.conf 2>/dev/null || printf '\\n#include extensions_autodialer_ivr.conf\\n' >> /etc/asterisk/extensions_local.conf"`
  );
  await execP(`docker exec ${CONTAINER} asterisk -rx "dialplan reload"`).catch(() => '');
}

module.exports = {
  IVR_ENTRY_CONTEXT,
  DIGIT_KEYS,
  parseIvrDefinition,
  normalizeIvrDefinition,
  serializeIvrDefinition,
  getIvrEntryExtension,
  getNodePromptSound,
  prepareIvrAssets,
  rebuildIvrDialplan,
};
