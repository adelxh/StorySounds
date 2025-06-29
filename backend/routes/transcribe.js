
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const upload = multer({ dest: 'uploads/' });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const audioPath = req.file.path;

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1',
      response_format: 'json',
    });

    // Delete file after processing
    fs.unlinkSync(audioPath);

    res.json({ text: transcription.text });
  } catch (err) {
    console.error('❌ Transcription error:', err);
    res.status(500).json({ error: 'Failed to transcribe audio.' });
  }
});

module.exports = router;
