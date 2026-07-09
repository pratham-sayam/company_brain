/**
 * Express Service — runs exclusively in the Electron main process.
 *
 * Responsibilities:
 *   - Make authenticated HTTP calls to the Express cloud backend.
 *   - Used for AI proxy endpoints (Gemini calls routed through Express).
 *   - Access token is sourced from authService — never from the renderer.
 */

const authService = require('./authService');
const config      = require('../config');

function getExpressUrl() {
  return config.EXPRESS_URL;
}

/**
 * Sends prepared file data to Express for AI classification via Gemini.
 * Express holds the Gemini API key — it never reaches the desktop app.
 *
 * @param {Array}    fingerprints - File fingerprint objects from Python
 * @param {string}   folderTree   - Folder tree text from Python
 * @param {string[]} folderIds    - Valid folder IDs from Python
 * @param {string}   requestId    - Idempotency key for usage tracking
 * @returns {Promise<Array>} Classification results from Gemini
 */
async function classifyFiles(fingerprints, folderTree, folderIds, requestId) {
  const token = authService.getToken();
  if (!token) throw new Error('No active session. Please log in.');

  const res = await fetch(`${getExpressUrl()}/api/v1/ai/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fingerprints,
      folder_tree: folderTree,
      folder_ids: folderIds,
      requestId,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'AI classification failed.');
  return data.results;
}

/**
 * Sends prepared file data to Express for AI DataRoom generation via Gemini.
 * Express holds the Gemini API key — it never reaches the desktop app.
 *
 * @param {string} name         - DataRoom name
 * @param {string} description  - DataRoom description
 * @param {Array}  fingerprints - File fingerprint objects from Python
 * @param {string} requestId    - Idempotency key for usage tracking
 * @returns {Promise<Object>} Gemini result with folders and assignments
 */
async function generateDataroom(name, description, fingerprints, requestId) {
  const token = authService.getToken();
  if (!token) throw new Error('No active session. Please log in.');

  const res = await fetch(`${getExpressUrl()}/api/v1/ai/generate-dataroom`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      dataroom_name: name,
      dataroom_description: description,
      fingerprints,
      requestId,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'AI DataRoom generation failed.');
  return data.gemini_result;
}

/**
 * Pre-check file upload capacity against usage limits.
 * Advisory only — hard enforcement is in the classify endpoint.
 *
 * @param {number} count - Number of files the user wants to upload
 * @returns {Promise<{ allowed, current, limit, remaining, resetsAt }>}
 */
async function checkFileLimit(count) {
  const token = authService.getToken();
  if (!token) throw new Error('No active session. Please log in.');

  const res = await fetch(`${getExpressUrl()}/api/v1/usage/check-files?count=${count}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Usage check failed.');
  return data;
}

/**
 * Fetch full usage summary for the Settings page.
 *
 * @returns {Promise<{ usage: { files: {...}, messages: {...} } }>}
 */
async function getUsage() {
  const token = authService.getToken();
  if (!token) throw new Error('No active session. Please log in.');

  const res = await fetch(`${getExpressUrl()}/api/v1/usage`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch usage.');
  return data;
}

/**
 * Send a base64-encoded image to Express for OCR via Gemini Vision.
 *
 * @param {string} imageBase64 - Base64-encoded image bytes
 * @param {string} mimeType    - Image MIME type (image/png, image/jpeg)
 * @param {string} filename    - Original filename
 * @returns {Promise<string>} Extracted text from the image
 */
async function ocrImage(imageBase64, mimeType, filename) {
  const token = authService.getToken();
  if (!token) throw new Error('No active session. Please log in.');

  const res = await fetch(`${getExpressUrl()}/api/v1/ai/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      image_base64: imageBase64,
      mime_type: mimeType,
      filename,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'OCR failed.');
  return data.extracted_text;
}

module.exports = { classifyFiles, generateDataroom, checkFileLimit, getUsage, ocrImage };

