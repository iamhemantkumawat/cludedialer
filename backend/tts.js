/**
 * tts.js — shared Google Cloud Text-to-Speech helper
 *
 * Uses the REST API with an API key (no service-account JSON needed).
 * Falls back to gTTS (free, lower quality) when GOOGLE_TTS_API_KEY is not set.
 *
 * Usage:
 *   const { renderTts } = require('./tts');
 *   await renderTts(text, language, voiceType, '/tmp/output.mp3');
 */

require('dotenv').config();
const { execFile } = require('child_process');
const fs   = require('fs');
const path = require('path');

const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY || '';

// ─── Google Cloud TTS voice map ───────────────────────────────────────────────
// Neural2 voices first (best quality), Standard as fallback for unsupported langs
const CLOUD_VOICES = {
  'en-US': { female: 'en-US-Neural2-C', male: 'en-US-Neural2-D' },
  'en-GB': { female: 'en-GB-Neural2-A', male: 'en-GB-Neural2-B' },
  'en-IN': { female: 'en-IN-Neural2-A', male: 'en-IN-Neural2-C' },
  'en-AU': { female: 'en-AU-Neural2-A', male: 'en-AU-Neural2-B' },
  'hi-IN': { female: 'hi-IN-Neural2-A', male: 'hi-IN-Neural2-B' },
  'it-IT': { female: 'it-IT-Neural2-A', male: 'it-IT-Neural2-F' },
  'es-ES': { female: 'es-ES-Neural2-A', male: 'es-ES-Neural2-F' },
  'de-DE': { female: 'de-DE-Neural2-G', male: 'de-DE-Neural2-H' },
  'pt-BR': { female: 'pt-BR-Neural2-A', male: 'pt-BR-Neural2-B' },
  'pt-PT': { female: 'pt-PT-Wavenet-E', male: 'pt-PT-Wavenet-F' },
  'tr-TR': { female: 'tr-TR-Wavenet-A', male: 'tr-TR-Wavenet-B' },
};

// ─── gTTS fallback presets ─────────────────────────────────────────────────────
const GTTS_PRESETS = {
  'en-US': { female: { lang: 'en', tlds: ['com', 'com.ng'] }, male: { lang: 'en', tlds: ['ca', 'com'] } },
  'en-GB': { female: { lang: 'en', tlds: ['co.uk', 'ie'] },   male: { lang: 'en', tlds: ['ie', 'co.uk'] } },
  'en-IN': { female: { lang: 'en', tlds: ['co.in', 'com'] },  male: { lang: 'en', tlds: ['co.in'] } },
  'en-AU': { female: { lang: 'en', tlds: ['com.au', 'com'] }, male: { lang: 'en', tlds: ['com.au'] } },
  'hi-IN': { female: { lang: 'hi', tlds: ['co.in', 'com'] },  male: { lang: 'hi', tlds: ['co.in'] } },
  'it-IT': { female: { lang: 'it', tlds: ['it', 'com'] },     male: { lang: 'it', tlds: ['it'] } },
  'es-ES': { female: { lang: 'es', tlds: ['es', 'com'] },     male: { lang: 'es', tlds: ['es'] } },
  'de-DE': { female: { lang: 'de', tlds: ['de', 'com'] },     male: { lang: 'de', tlds: ['de'] } },
  'pt-BR': { female: { lang: 'pt', tlds: ['com.br', 'com'] }, male: { lang: 'pt', tlds: ['com.br'] } },
  'pt-PT': { female: { lang: 'pt', tlds: ['pt', 'com'] },     male: { lang: 'pt', tlds: ['pt'] } },
  'tr-TR': { female: { lang: 'tr', tlds: ['com', 'co.in'] },  male: { lang: 'tr', tlds: ['com'] } },
};

const GTTS_SCRIPT      = path.join(__dirname, 'scripts', 'gtts_render.py');
const GTTS_VENV_PYTHON = path.join(__dirname, '.venv_gtts', 'bin', 'python3');
const GTTS_PYTHON      = fs.existsSync(GTTS_VENV_PYTHON) ? GTTS_VENV_PYTHON : 'python3';

function execFileP(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || '').trim() || `${cmd} failed`));
      resolve({ stdout, stderr });
    });
  });
}

function normalizeVoiceType(v = '') {
  return String(v).trim().toLowerCase() === 'male' ? 'male' : 'female';
}

// ─── Google Cloud TTS ──────────────────────────────────────────────────────────
async function callGoogleTtsApi(text, language, voiceName) {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input:       { text },
        voice:       { languageCode: language, name: voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95, pitch: 0 },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Cloud TTS ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  if (!data.audioContent) throw new Error('Google Cloud TTS returned no audioContent');
  return data.audioContent;
}

async function renderGoogleCloudTts(text, language, voiceType, outputPath) {
  const voiceMap = CLOUD_VOICES[language] || CLOUD_VOICES['en-US'];
  const voiceName = voiceMap[voiceType] || voiceMap.female;

  let audioContent;
  try {
    audioContent = await callGoogleTtsApi(text, language, voiceName);
    console.log(`[TTS] Google Cloud TTS OK — voice=${voiceName}`);
  } catch (err) {
    // If male voice fails, automatically fall back to female
    if (voiceType === 'male' && voiceMap.female !== voiceName) {
      console.warn(`[TTS] Male voice ${voiceName} failed (${err.message}), retrying with female fallback`);
      audioContent = await callGoogleTtsApi(text, language, voiceMap.female);
      console.log(`[TTS] Google Cloud TTS OK (female fallback) — voice=${voiceMap.female}`);
    } else {
      throw err;
    }
  }

  fs.writeFileSync(outputPath, Buffer.from(audioContent, 'base64'));
}

// ─── gTTS fallback ─────────────────────────────────────────────────────────────
async function renderGttsFallback(text, language, voiceType, outputPath) {
  const family = GTTS_PRESETS[language] || GTTS_PRESETS['en-US'];
  const preset = family[voiceType] || family.female;

  let lastError = null;
  for (const tld of preset.tlds) {
    try {
      await execFileP(GTTS_PYTHON, [GTTS_SCRIPT, '--text', text, '--lang', preset.lang, '--tld', tld, '--output', outputPath]);
      console.log(`[TTS] gTTS fallback OK — lang=${preset.lang} tld=${tld}`);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(lastError ? lastError.message : 'gTTS render failed');
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Render TTS to an MP3 file.
 * Uses Google Cloud TTS if GOOGLE_TTS_API_KEY is set, otherwise gTTS.
 *
 * @param {string} text        - The text to synthesize
 * @param {string} language    - BCP-47 language code e.g. 'en-US', 'hi-IN'
 * @param {string} voiceType   - 'female' | 'male'
 * @param {string} outputPath  - Local path to write the MP3 to
 */
async function renderTts(text, language, voiceType, outputPath) {
  const voice = normalizeVoiceType(voiceType);
  if (GOOGLE_TTS_API_KEY) {
    await renderGoogleCloudTts(text, language, voice, outputPath);
  } else {
    console.warn('[TTS] GOOGLE_TTS_API_KEY not set — using gTTS fallback (low quality)');
    await renderGttsFallback(text, language, voice, outputPath);
  }
}

/**
 * Return raw MP3 bytes for the given text+language (used by the preview endpoint).
 * Writes to a temp file and returns a Buffer.
 */
async function renderTtsBuffer(text, language, voiceType) {
  const os   = require('os');
  const tmp  = require('path').join(os.tmpdir(), `tts_preview_${Date.now()}.mp3`);
  try {
    await renderTts(text, language, voiceType, tmp);
    return fs.readFileSync(tmp);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

module.exports = { renderTts, renderTtsBuffer, GOOGLE_TTS_API_KEY };
