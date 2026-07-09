/**
 * Gemini Service — Express backend only.
 *
 * Owns the GEMINI_API_KEY and all Google Gemini API communication.
 * No other layer may call Gemini directly — this is the single gateway.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_NAME = 'gemini-2.5-flash';
const TEMPERATURE = 0.1;
const MAX_RETRIES = 3;
const BATCH_SIZE = 10;
const MAX_PARALLEL_BATCHES = 5;

// ── Gemini client ────────────────────────────────────────

function _getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured in express-backend/.env');
  return new GoogleGenerativeAI(apiKey);
}

// ── Low-level Gemini call with retries ───────────────────

async function _callGemini(systemPrompt, userPrompt, retries = MAX_RETRIES) {
  const genAI = _getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt,
    generationConfig: { temperature: TEMPERATURE },
  });

  let lastError;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await model.generateContent(userPrompt);
      let raw = result.response.text();

      // Strip markdown code fences if present
      raw = raw.replace(/^```(?:json)?\s*\n?/gm, '');
      raw = raw.replace(/\n?```\s*$/gm, '');
      raw = raw.trim();

      // Validate it's parseable JSON
      JSON.parse(raw);
      return raw;
    } catch (e) {
      lastError = e;

      // On second attempt, append a re-prompt hint for JSON issues
      if (e instanceof SyntaxError && attempt === 1) {
        userPrompt +=
          '\n\nIMPORTANT: Your previous response was not valid JSON. ' +
          'Return ONLY a valid JSON object/array with no extra text.';
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      }
    }
  }

  throw new Error(`Gemini API failed after ${retries} attempts: ${lastError?.message}`);
}

// ── Classification ───────────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT =
  'You are a document classification AI. You assign files to the most ' +
  'appropriate folder based on file name, content preview, and folder context descriptions.\n\n' +
  'Rules:\n' +
  '1. Return ONLY a JSON array — no markdown, no explanation.\n' +
  '2. Each element must have: file_id, folder_id (or null), confidence (0.0-1.0), reasoning (short string).\n' +
  '3. folder_id must be one of the provided folder IDs, or null if no folder fits.\n' +
  '4. confidence should reflect how well the file matches the chosen folder.\n';

async function _classifyBatch(batch, folderTree, folderIdsSet) {
  const filesJson = JSON.stringify(batch, null, 2);

  const userPrompt =
    `## Folder structure\n${folderTree}\n\n` +
    `## Files to classify\n${filesJson}\n\n` +
    'Classify each file into the best-matching folder. ' +
    'Return a JSON array of objects with keys: file_id, folder_id, confidence, reasoning.';

  const raw = await _callGemini(CLASSIFY_SYSTEM_PROMPT, userPrompt);
  const results = JSON.parse(raw);

  // Validate and sanitise folder IDs
  return results.map((r) => ({
    file_id: r.file_id,
    folder_id: r.folder_id != null && folderIdsSet.has(r.folder_id) ? r.folder_id : null,
    confidence: parseFloat(r.confidence || 0),
    reasoning: r.reasoning || '',
  }));
}

/**
 * Classify files into folders using Gemini.
 *
 * @param {Array} fingerprints - File fingerprint objects from Python
 * @param {string} folderTree  - Text representation of folder hierarchy
 * @param {string[]} folderIds - Valid folder IDs
 * @returns {Promise<Array>} Classification results
 */
async function classifyFiles(fingerprints, folderTree, folderIds) {
  const folderIdsSet = new Set(folderIds);

  // Split into batches of BATCH_SIZE
  const batches = [];
  for (let i = 0; i < fingerprints.length; i += BATCH_SIZE) {
    batches.push(fingerprints.slice(i, i + BATCH_SIZE));
  }

  // Process batches in chunks of MAX_PARALLEL_BATCHES
  const allResults = [];
  for (let i = 0; i < batches.length; i += MAX_PARALLEL_BATCHES) {
    const chunk = batches.slice(i, i + MAX_PARALLEL_BATCHES);
    const batchResults = await Promise.all(
      chunk.map((batch) => _classifyBatch(batch, folderTree, folderIdsSet))
    );
    for (const br of batchResults) {
      allResults.push(...br);
    }
  }

  return allResults;
}

// ── DataRoom generation ──────────────────────────────────

const GENERATE_SYSTEM_PROMPT =
  'You are a document organization AI. Given a set of files, you create ' +
  'a logical folder structure and assign each file to the best folder.\n\n' +
  'Rules:\n' +
  '1. Return ONLY a JSON object — no markdown, no explanation.\n' +
  '2. The JSON must have two keys: \'folders\' and \'assignments\'.\n' +
  '3. \'folders\' is an array of objects with: name, context (description of what belongs here), ' +
  'children (array of nested folder objects, same structure, can be empty).\n' +
  '4. \'assignments\' is an array of objects with: file_id, folder_path (array of folder names ' +
  'from root to target, e.g. [\'Legal\', \'Contracts\']), confidence (0.0-1.0), reasoning.\n' +
  '5. Create 3-10 top-level folders. Use subfolders only when clearly needed.\n' +
  '6. Every file must appear in assignments, even if confidence is low.\n' +
  '7. folder_path must match exactly the folder names you defined.\n';

/**
 * Generate a DataRoom folder structure and file assignments using Gemini.
 *
 * @param {string} name         - DataRoom name
 * @param {string} description  - DataRoom description
 * @param {Array} fingerprints  - File fingerprint objects from Python
 * @returns {Promise<Object>} Gemini result with folders and assignments
 */
async function generateDataroom(name, description, fingerprints) {
  const filesJson = JSON.stringify(fingerprints, null, 2);

  const userPrompt =
    `## DataRoom: ${name}\n` +
    `## Description: ${description || 'No description provided'}\n\n` +
    `## Files to organize (${fingerprints.length} files)\n${filesJson}\n\n` +
    'Create an organized folder structure and assign each file to the best folder.';

  const raw = await _callGemini(GENERATE_SYSTEM_PROMPT, userPrompt);
  return JSON.parse(raw);
}

// ── Embeddings (V1 Copilot) ──────────────────────────────

const EMBEDDING_BATCH_SIZE = 50;

/**
 * Batch embed texts via Gemini embedding API.
 *
 * @param {string[]} texts - Array of text strings to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedTexts(texts) {
  const genAI = _getClient();
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

  const model = genAI.getGenerativeModel({ model: embeddingModel });

  const allVectors = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await model.batchEmbedContents({
          requests: batch.map((text) => ({
            content: { parts: [{ text }] },
          })),
        });

        for (const emb of result.embeddings) {
          allVectors.push(emb.values);
        }
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
        }
      }
    }

    if (lastError) {
      throw new Error(`Embedding failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
    }
  }

  return allVectors;
}

// ── Entity extraction (V1 Copilot) ──────────────────────

const ENTITY_EXTRACTION_PROMPT =
  'Extract all notable entities from this document. Return JSON only, no markdown:\n' +
  '{\n' +
  '  "organizations": [],\n' +
  '  "people": [],\n' +
  '  "monetary_values": [],\n' +
  '  "dates": [],\n' +
  '  "locations": [],\n' +
  '  "key_terms": []\n' +
  '}\n' +
  'Do NOT assume any industry. Extract what\'s actually in the document.';

/**
 * Extract entities from document text via Gemini.
 *
 * @param {string} text - Document text to extract entities from
 * @returns {Promise<Object>} Parsed entity JSON
 */
async function extractEntities(text) {
  const raw = await _callGemini(ENTITY_EXTRACTION_PROMPT, text);
  return JSON.parse(raw);
}

// ── File summary (V1 Copilot) ────────────────────────────

const SUMMARIZE_SYSTEM_PROMPT =
  'Summarize this document in 2-3 sentences. Be specific about names, numbers, dates, key terms. ' +
  'Return ONLY the summary text, no JSON, no markdown formatting.';

/**
 * Generate a file summary via Gemini.
 *
 * @param {string} text - Document text (first 2000 chars)
 * @returns {Promise<string>} Summary text
 */
async function summarizeFile(text) {
  const genAI = _getClient();
  const chatModel = process.env.GEMINI_CHAT_MODEL || MODEL_NAME;
  const model = genAI.getGenerativeModel({
    model: chatModel,
    systemInstruction: SUMMARIZE_SYSTEM_PROMPT,
    generationConfig: { temperature: 0.2 },
  });

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(text);
      return result.response.text().trim();
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      }
    }
  }
  throw new Error(`Summarize failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// ── OCR via Gemini Vision ─────────────────────────────────

const OCR_SYSTEM_PROMPT =
  'You are an OCR engine. Extract all visible text from images accurately. ' +
  'Preserve paragraph structure and reading order. Do not add commentary or interpretation. ' +
  'Return ONLY the extracted text.';

/**
 * Extract text from an image using Gemini Vision (multimodal).
 *
 * @param {string} imageBase64 - Base64-encoded image bytes
 * @param {string} mimeType    - Image MIME type (image/png, image/jpeg)
 * @param {string} filename    - Original filename (for context)
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromImage(imageBase64, mimeType, filename) {
  const genAI = _getClient();
  const chatModel = process.env.GEMINI_CHAT_MODEL || MODEL_NAME;
  const model = genAI.getGenerativeModel({
    model: chatModel,
    systemInstruction: OCR_SYSTEM_PROMPT,
    generationConfig: { temperature: 0.1 },
  });

  const parts = [
    { inlineData: { mimeType, data: imageBase64 } },
    {
      text: `Extract ALL text visible in this image (${filename}). ` +
        'Return ONLY the extracted text, preserving layout where possible. ' +
        'If no text is visible, return "[No text detected]".',
    },
  ];

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
      return result.response.text().trim();
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      }
    }
  }
  throw new Error(`OCR failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// ── Chat title generation (V1 Copilot) ───────────────────

const TITLE_SYSTEM_PROMPT =
  'Generate a concise 5-word title for a chat that starts with the given message. ' +
  'Return ONLY the title, nothing else. No quotes, no punctuation at the end.';

/**
 * Generate a chat session title via Gemini.
 *
 * @param {string} message - First user message
 * @returns {Promise<string>} Generated title
 */
async function generateTitle(message) {
  const genAI = _getClient();
  const chatModel = process.env.GEMINI_CHAT_MODEL || MODEL_NAME;
  const model = genAI.getGenerativeModel({
    model: chatModel,
    systemInstruction: TITLE_SYSTEM_PROMPT,
    generationConfig: { temperature: 0.3, maxOutputTokens: 20 },
  });

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(message);
      return result.response.text().trim();
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      }
    }
  }
  throw new Error(`Title generation failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// ── Chat streaming (Phase C2 — Copilot) ──────────────────

// Whitelist of tools Electron may execute — reject anything else
const ALLOWED_TOOLS = new Set([
  'search_documents',
  'get_file_content',
  'list_files',
  'get_entities',
  'find_similar',
]);

const CHAT_SYSTEM_PROMPT =
  'You are Orvyn Copilot, an intelligent AI assistant for document management and analysis.\n\n' +
  'You help users understand, search, analyze, and extract information from their documents.\n' +
  'You work with any type of document in any domain: business, legal, financial, medical,\n' +
  'academic, personal, HR, operations, engineering, research, or any other field.\n\n' +
  'RULES:\n' +
  '1. Answer based ONLY on the provided document excerpts. Never make up information.\n' +
  '2. Always cite sources using [Source: filename] format.\n' +
  '3. If you cannot find the answer, say clearly: "I couldn\'t find this in your documents."\n' +
  '4. Be precise with numbers, dates, names — quote them exactly as they appear.\n' +
  '5. Note any inconsistencies between documents.\n' +
  '6. Adapt your analysis style to the document domain (legal docs get legal analysis,\n' +
  '   financial docs get financial analysis, technical docs get technical analysis).\n' +
  '7. When summarizing, provide structured summaries with key points.\n' +
  '8. Suggest relevant follow-up questions the user might want to ask.\n';

/**
 * Stream chat responses via Gemini generateContentStream.
 * Writes SSE events to the Express response object.
 *
 * Events:
 *   data: {"type":"chunk","text":"..."}
 *   data: {"type":"tool_call","name":"...","args":{...}}
 *   data: {"type":"tool_call_stop"}
 *   data: {"type":"error","message":"..."}
 *   data: {"type":"end"}
 *
 * When Gemini returns a tool_call, the stream ends with tool_call_stop.
 * Electron executes the tool, then makes a NEW POST with updated messages.
 * Express does NOT hold the connection open. Each tool round is a fresh request.
 *
 * @param {object} res        - Express response object (for SSE writing)
 * @param {string} systemPrompt - System instruction (or null for default)
 * @param {Array}  messages    - Gemini conversation messages
 * @param {Array}  [tools]     - Gemini function declarations
 * @param {object} [toolConfig] - Gemini tool config
 */
async function chatStream(res, systemPrompt, messages, tools, toolConfig) {
  const genAI = _getClient();
  const chatModel = process.env.GEMINI_CHAT_MODEL || MODEL_NAME;
  const chatTemp = parseFloat(process.env.GEMINI_CHAT_TEMPERATURE || '0.3');
  const maxTokens = parseInt(process.env.GEMINI_CHAT_MAX_OUTPUT_TOKENS || '4096', 10);

  const modelConfig = {
    model: chatModel,
    systemInstruction: systemPrompt || CHAT_SYSTEM_PROMPT,
    generationConfig: { temperature: chatTemp, maxOutputTokens: maxTokens },
  };

  // Only add tools if provided
  if (tools && tools.length > 0) {
    modelConfig.tools = [{ functionDeclarations: tools }];
  }
  if (toolConfig) {
    modelConfig.toolConfig = { functionCallingConfig: { mode: toolConfig.mode || 'AUTO' } };
  }

  const model = genAI.getGenerativeModel(modelConfig);

  try {
    const result = await model.generateContentStream({ contents: messages });
    let hasToolCall = false;

    for await (const chunk of result.stream) {
      // Check for text content
      const textContent = chunk.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        ?.map(p => p.text)
        ?.join('') || '';

      if (textContent) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: textContent })}\n\n`);
      }

      // Check for function calls
      const functionCalls = chunk.candidates?.[0]?.content?.parts
        ?.filter(p => p.functionCall) || [];

      if (functionCalls.length > 0) {
        for (const part of functionCalls) {
          // Whitelist check — reject hallucinated or unexpected tool names
          if (!ALLOWED_TOOLS.has(part.functionCall.name)) {
            console.warn(`[chatStream] Rejected tool call: ${part.functionCall.name}`);
            res.write(`data: ${JSON.stringify({
              type: 'error',
              message: `Blocked disallowed tool: ${part.functionCall.name}`,
            })}\n\n`);
            continue;
          }
          hasToolCall = true;
          res.write(`data: ${JSON.stringify({
            type: 'tool_call',
            name: part.functionCall.name,
            args: part.functionCall.args,
          })}\n\n`);
        }
      }
    }

    if (hasToolCall) {
      // Signal Electron to execute tool and make a new request
      res.write(`data: ${JSON.stringify({ type: 'tool_call_stop' })}\n\n`);
    } else {
      // Normal end — Gemini is done
      res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
  }
}

/**
 * Non-streaming chat fallback (for testing).
 *
 * @param {string} systemPrompt
 * @param {Array}  messages
 * @param {Array}  [tools]
 * @param {object} [toolConfig]
 * @returns {Promise<{response: string, tool_calls: Array}>}
 */
async function chatNonStreaming(systemPrompt, messages, tools, toolConfig) {
  const genAI = _getClient();
  const chatModel = process.env.GEMINI_CHAT_MODEL || MODEL_NAME;
  const chatTemp = parseFloat(process.env.GEMINI_CHAT_TEMPERATURE || '0.3');
  const maxTokens = parseInt(process.env.GEMINI_CHAT_MAX_OUTPUT_TOKENS || '4096', 10);

  const modelConfig = {
    model: chatModel,
    systemInstruction: systemPrompt || CHAT_SYSTEM_PROMPT,
    generationConfig: { temperature: chatTemp, maxOutputTokens: maxTokens },
  };

  if (tools && tools.length > 0) {
    modelConfig.tools = [{ functionDeclarations: tools }];
  }
  if (toolConfig) {
    modelConfig.toolConfig = { functionCallingConfig: { mode: toolConfig.mode || 'AUTO' } };
  }

  const model = genAI.getGenerativeModel(modelConfig);

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent({ contents: messages });
      const parts = result.response.candidates?.[0]?.content?.parts || [];

      const textParts = parts.filter(p => p.text).map(p => p.text);
      const toolCalls = parts.filter(p => p.functionCall).map(p => ({
        name: p.functionCall.name,
        args: p.functionCall.args,
      }));

      return { response: textParts.join(''), tool_calls: toolCalls };
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      }
    }
  }
  throw new Error(`Chat failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

module.exports = {
  classifyFiles,
  generateDataroom,
  embedTexts,
  extractEntities,
  extractTextFromImage,
  summarizeFile,
  generateTitle,
  chatStream,
  chatNonStreaming,
  CHAT_SYSTEM_PROMPT,
};
