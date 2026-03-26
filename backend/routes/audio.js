require('dotenv').config();
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const AUDIO_DIR = path.join(__dirname, '../../data/audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: AUDIO_DIR,
  filename: (req, file, cb) => {
    // Sanitise filename, keep extension
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(wav|mp3|gsm|ulaw|alaw|g729|ogg)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Only audio files are allowed'));
  },
});

// GET list uploaded audio files
router.get('/', (req, res) => {
  const files = fs.readdirSync(AUDIO_DIR)
    .filter(f => !f.startsWith('.'))
    .map(f => {
      const stat = fs.statSync(path.join(AUDIO_DIR, f));
      return { name: f, size: stat.size, modified: stat.mtime };
    });
  res.json(files);
});

// POST upload audio file
router.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filename = req.file.filename;
  const containerName = process.env.ASTERISK_CONTAINER || 'local-asterisk';
  const destPath = `/var/lib/asterisk/sounds/custom/${filename}`;

  // Copy to Asterisk container (best-effort — warn if it fails)
  exec(`docker cp "${path.join(AUDIO_DIR, filename)}" ${containerName}:${destPath}`, (err) => {
    if (err) {
      console.warn(`[Audio] docker cp failed — you may need to copy manually: ${err.message}`);
    } else {
      console.log(`[Audio] Copied ${filename} to ${containerName}:${destPath}`);
    }
  });

  res.json({ filename, path: `/audio/${filename}` });
});

// DELETE audio file
router.delete('/:filename', (req, res) => {
  const filepath = path.join(AUDIO_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filepath);
  res.json({ success: true });
});

module.exports = router;
