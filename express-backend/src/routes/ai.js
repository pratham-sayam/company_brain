const { Router } = require('express');
const {
  classify,
  generateDataroom,
  embed,
  extractEntities,
  ocrImage,
  summarizeFile,
  generateTitle,
  chatStream,
  chat,
} = require('../controllers/aiController');
const { authenticate } = require('../middleware/authenticate');

const router = Router();

// All AI endpoints require authentication — only logged-in users
// can consume Gemini API quota through the Express proxy.
router.post('/classify', authenticate, classify);
router.post('/generate-dataroom', authenticate, generateDataroom);

// OCR via Gemini Vision
router.post('/ocr', authenticate, ocrImage);

// Copilot endpoints (V1 Copilot)
router.post('/embed', authenticate, embed);
router.post('/extract-entities', authenticate, extractEntities);
router.post('/summarize-file', authenticate, summarizeFile);
router.post('/generate-title', authenticate, generateTitle);

// Chat
router.post('/chat/stream', authenticate, chatStream);
router.post('/chat', authenticate, chat);

module.exports = router;
