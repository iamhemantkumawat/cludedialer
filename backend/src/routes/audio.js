const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');

const router = express.Router();

function getSoundsDir() {
  const dir = process.env.ASTERISK_SOUNDS_DIR;
  if (!dir) throw new Error('ASTERISK_SOUNDS_DIR not set');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Multer — store in temp, then move
const upload = multer({
  dest: '/tmp/autodialer-uploads/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.wav', '.mp3', '.gsm', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only WAV, MP3, GSM, OGG files allowed'));
  },
});

// POST upload audio file
router.post('/upload', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const soundsDir = getSoundsDir();
    const fileId = uuidv4();
    const srcExt = path.extname(req.file.originalname).toLowerCase();
    const destFile = path.join(soundsDir, fileId + srcExt);

    fs.renameSync(req.file.path, destFile);

    // Try converting to WAV (Asterisk-friendly 8kHz ulaw) if ffmpeg available
    let finalFile = fileId + srcExt;
    try {
      const wavDest = path.join(soundsDir, fileId + '.wav');
      execSync(
        `ffmpeg -y -i "${destFile}" -ar 8000 -ac 1 -acodec pcm_s16le "${wavDest}"`,
        { timeout: 30000, stdio: 'pipe' }
      );
      fs.unlinkSync(destFile); // remove original
      finalFile = fileId + '.wav';
      console.log(`[Audio] Converted to WAV: ${finalFile}`);
    } catch {
      console.log('[Audio] ffmpeg not available or conversion failed — using original file');
    }

    res.json({
      fileId,
      filename: finalFile,
      originalName: req.file.originalname,
      // Asterisk Read() path — no extension (Asterisk picks best format)
      asteriskPath: `${process.env.ASTERISK_AUDIO_PREFIX}/${fileId}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST generate TTS audio
router.post('/tts', async (req, res) => {
  const { text, lang = 'en' } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const soundsDir = getSoundsDir();
    const fileId = uuidv4();
    const mp3Path = path.join(soundsDir, fileId + '.mp3');

    // Google TTS (free, unofficial)
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob&ttsspeed=0.9`;
    const fetch = require('node-fetch');
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoDialer/1.0)' },
      timeout: 15000,
    });

    if (!response.ok) throw new Error(`TTS fetch failed: ${response.status}`);

    const buffer = await response.buffer();
    fs.writeFileSync(mp3Path, buffer);

    // Convert to WAV if ffmpeg available
    let finalFile = fileId + '.mp3';
    try {
      const wavPath = path.join(soundsDir, fileId + '.wav');
      execSync(
        `ffmpeg -y -i "${mp3Path}" -ar 8000 -ac 1 -acodec pcm_s16le "${wavPath}"`,
        { timeout: 30000, stdio: 'pipe' }
      );
      fs.unlinkSync(mp3Path);
      finalFile = fileId + '.wav';
    } catch {
      console.log('[Audio] ffmpeg unavailable — keeping MP3');
    }

    res.json({
      fileId,
      filename: finalFile,
      text,
      asteriskPath: `${process.env.ASTERISK_AUDIO_PREFIX}/${fileId}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET list uploaded audio files
router.get('/', (req, res) => {
  try {
    const soundsDir = getSoundsDir();
    const files = fs.readdirSync(soundsDir)
      .filter(f => /\.(wav|mp3|gsm|ogg)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(soundsDir, f));
        return {
          filename: f,
          fileId: path.parse(f).name,
          size: stat.size,
          created: stat.birthtime,
          asteriskPath: `${process.env.ASTERISK_AUDIO_PREFIX}/${path.parse(f).name}`,
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET stream/play audio file
router.get('/:fileId/play', (req, res) => {
  try {
    const soundsDir = getSoundsDir();
    const exts = ['.wav', '.mp3', '.gsm', '.ogg'];
    let filePath = null;
    for (const ext of exts) {
      const f = path.join(soundsDir, req.params.fileId + ext);
      if (fs.existsSync(f)) { filePath = f; break; }
    }
    if (!filePath) return res.status(404).json({ error: 'Audio file not found' });

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.gsm': 'audio/x-gsm' };
    const mime = mimeMap[ext] || 'audio/wav';
    const stat = fs.statSync(filePath);

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE audio file
router.delete('/:fileId', (req, res) => {
  try {
    const soundsDir = getSoundsDir();
    const exts = ['.wav', '.mp3', '.gsm', '.ogg'];
    let deleted = false;
    for (const ext of exts) {
      const f = path.join(soundsDir, req.params.fileId + ext);
      if (fs.existsSync(f)) { fs.unlinkSync(f); deleted = true; }
    }
    res.json({ deleted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
