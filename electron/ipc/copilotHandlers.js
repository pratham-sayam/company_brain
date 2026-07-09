const crypto = require('crypto');
const path = require('path');
const { app } = require('electron');

const authService        = require('../services/authService');
const userContextService = require('../services/userContextService');
const log                = require('../services/logger');
const config             = require('../config');

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let activeStreamController = null;

// ---------------------------------------------------------------------------
// Helpers — URL + auth
// ---------------------------------------------------------------------------

function getPythonUrl() {
  const url = process.env.PYTHON_URL;
  if (!url) throw new Error('PYTHON_URL is not configured');
  return url;
}

function getExpressUrl() {
  return config.EXPRESS_URL;
}

function getToken() {
  const token = authService.getToken();
  if (!token) throw new Error('No active session. Please log in.');
  return token;
}

/** Returns { db_path, chroma_path, user_id } for every Python call. */
function getUserContext() {
  const userId = userContextService.getActiveUserId();
  const dbPath = userContextService.getActiveDatabasePath();
  if (!userId || !dbPath) throw new Error('No active user context.');
  const chromaPath = path.join(app.getPath('userData'), 'users', userId, 'chroma');
  return { db_path: dbPath, chroma_path: chromaPath, user_id: userId };
}

// ---------------------------------------------------------------------------
// Helper — authenticated Express POST (JSON)
// ---------------------------------------------------------------------------

async function expressPost(endpoint, body) {
  let res;
  try {
    res = await fetch(`${getExpressUrl()}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error(`Express ${endpoint} timed out after 30s.`);
    }
    throw new Error(`Express server unavailable: ${err.message}`);
  }
  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = { error: rawText };
  }
  if (!res.ok) throw new Error(data.error || data.detail || `Express ${endpoint} failed.`);
  return data;
}

// ---------------------------------------------------------------------------
// Helper — Python POST (JSON)
// ---------------------------------------------------------------------------

async function pythonPost(endpoint, body) {
  const res = await fetch(`${getPythonUrl()}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    // FastAPI 422 returns detail as an array of validation error objects.
    // Stringify it so logs show readable field names instead of [object Object].
    let detail = data.detail;
    if (Array.isArray(detail)) {
      detail = detail.map(e => `${(e.loc || []).join('.')}: ${e.msg}`).join('; ');
    } else if (typeof detail === 'object' && detail !== null) {
      detail = JSON.stringify(detail);
    }
    throw new Error(detail || `Python ${endpoint} failed (${res.status}).`);
  }
  return data;
}

/** Python GET with optional query params */
async function pythonGet(endpoint,  params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${getPythonUrl()}${endpoint}?${qs}` : `${getPythonUrl()}${endpoint}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Python GET ${endpoint} failed.`);
  return data;
}

/** Python DELETE */
async function pythonDelete(endpoint) {
  const res = await fetch(`${getPythonUrl()}${endpoint}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Python DELETE ${endpoint} failed.`);
  return data;
}

// ---------------------------------------------------------------------------
// Helper — build system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt() {
  return `You are Orvyn Copilot, an intelligent AI assistant for document management and analysis.

You help users understand, search, analyze, and extract information from their documents.
You work with any type of document in any domain: business, legal, financial, medical,
academic, personal, HR, operations, engineering, research, or any other field.

RULES:
1. Answer based ONLY on the provided document excerpts. Never make up information.
2. When referencing information from documents, cite using numbered markers like [1], [2] etc. matching the source numbers in the excerpts. Only cite sources you actually use in your answer.
3. If you cannot find the answer, say clearly: "I couldn't find this in your documents."
4. Be precise with numbers, dates, names — quote them exactly as they appear.
5. Note any inconsistencies between documents.
6. Adapt your analysis style to the document domain (legal docs get legal analysis,
   financial docs get financial analysis, technical docs get technical analysis).
7. When summarizing, provide structured summaries with key points.
8. Suggest relevant follow-up questions the user might want to ask.`;
}

// ---------------------------------------------------------------------------
// Helper — build messages array for Gemini
// ---------------------------------------------------------------------------

function buildMessages(formattedChunks, history, userMessage) {
  const messages = [];

  // Add conversation history
  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }],
      });
    }
  }

  // Build user message with document context
  const contextBlock = formattedChunks
    ? `\n\nRelevant document excerpts:\n${formattedChunks}\n\nUser question: ${userMessage}`
    : userMessage;

  messages.push({
    role: 'user',
    parts: [{ text: contextBlock }],
  });

  return messages;
}

// ---------------------------------------------------------------------------
// Helper — Gemini function calling tool definitions
// ---------------------------------------------------------------------------

const COPILOT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'search_documents',
        description: 'Search for information across documents using semantic and keyword search',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'What to search for' },
            scope_type: { type: 'STRING', description: 'file, folder, dataroom, or global' },
            scope_ids: { type: 'ARRAY', items: { type: 'STRING' }, description: 'IDs to scope the search' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_file_content',
        description: 'Get the full extracted text content of a specific file',
        parameters: {
          type: 'OBJECT',
          properties: {
            file_id: { type: 'STRING', description: 'The file ID' },
          },
          required: ['file_id'],
        },
      },
      {
        name: 'list_files',
        description: 'List all files in a DataRoom with their types, sizes, and folders',
        parameters: {
          type: 'OBJECT',
          properties: {
            dataroom_id: { type: 'STRING' },
            folder_id: { type: 'STRING', description: 'Optional: specific folder' },
          },
          required: ['dataroom_id'],
        },
      },
      {
        name: 'get_entities',
        description: 'Get extracted entities (organizations, people, amounts, dates) from a file or DataRoom',
        parameters: {
          type: 'OBJECT',
          properties: {
            scope_type: { type: 'STRING', description: 'file or dataroom' },
            scope_id: { type: 'STRING' },
          },
          required: ['scope_type', 'scope_id'],
        },
      },
      {
        name: 'find_similar',
        description: 'Find documents similar to a given document across all DataRooms',
        parameters: {
          type: 'OBJECT',
          properties: {
            file_id: { type: 'STRING' },
            max_results: { type: 'INTEGER', description: 'Max results, default 5' },
          },
          required: ['file_id'],
        },
      },
    ],
  },
];

// Tool whitelist — only these tools may be executed
const ALLOWED_TOOLS = new Set([
  'search_documents',
  'get_file_content',
  'list_files',
  'get_entities',
  'find_similar',
]);

// ---------------------------------------------------------------------------
// Helper — stream one round from Express SSE, return { text, toolCalls }
// ---------------------------------------------------------------------------

async function streamFromExpress(event, body) {
  const response = await fetch(`${getExpressUrl()}/api/v1/ai/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
    signal: activeStreamController ? activeStreamController.signal : undefined,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || errData.detail || 'Chat stream request failed.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let toolCalls = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      let parsed;
      try {
        parsed = JSON.parse(trimmed.slice(6));
      } catch {
        log.warn('copilot: failed to parse SSE line:', trimmed);
        continue;
      }

      switch (parsed.type) {
        case 'chunk':
          text += parsed.text;
          event.sender.send('copilot:stream-chunk', { text: parsed.text });
          break;
        case 'tool_call':
          toolCalls.push({ name: parsed.name, args: parsed.args });
          break;
        case 'tool_call_stop':
          // Stream ended for this round — tool execution needed
          break;
        case 'error':
          event.sender.send('copilot:stream-error', { message: parsed.message });
          break;
        case 'end':
          // Normal completion
          break;
      }
    }
  }

  return { text, toolCalls };
}

// ---------------------------------------------------------------------------
// Helper — execute a tool via Python
// ---------------------------------------------------------------------------

async function executeTool(name, args, scopeType, scopeIds) {
  // Whitelist check
  if (!ALLOWED_TOOLS.has(name)) {
    log.warn(`copilot: rejected disallowed tool call: ${name}`);
    return { error: `Tool not allowed: ${name}` };
  }

  const ctx = getUserContext();

  // search_documents requires special handling:
  //   1. Gemini sends 'query' but Python expects 'query_text'
  //   2. Python requires 'query_vector' which Gemini never provides —
  //      we must embed the query via Express before calling Python.
  if (name === 'search_documents') {
    try {
      const queryText = args.query || args.query_text || '';
      if (!queryText) return { error: 'search_documents: query is empty' };

      const embedResult = await expressPost('/api/v1/ai/embed', { texts: [queryText] });
      const queryVector = embedResult.vectors[0];

      return await pythonPost('/api/v1/copilot/tool/search', {
        query_text: queryText,
        query_vector: queryVector,
        scope_type: args.scope_type || 'global',
        scope_ids: args.scope_ids || null,
        ...ctx,
      });
    } catch (err) {
      log.error('copilot: tool search_documents failed:', err.message);
      return { error: err.message };
    }
  }

  // list_files requires dataroom_id which the LLM never provides (system identifier).
  // Electron injects it from the current session scope.
  if (name === 'list_files') {
    const dataroomId = args.dataroom_id
      || ((scopeType === 'dataroom' || scopeType === 'multi_dataroom') && scopeIds?.[0])
      || null;
    try {
      return await pythonPost('/api/v1/copilot/tool/list-files', {
        dataroom_id: dataroomId,
        folder_id: args.folder_id || null,
        ...ctx,
      });
    } catch (err) {
      log.error('copilot: tool list_files failed:', err.message);
      return { error: err.message };
    }
  }

  const toolEndpoints = {
    get_file_content:  '/api/v1/copilot/tool/get-file-content',
    get_entities:      '/api/v1/copilot/tool/get-entities',
    find_similar:      '/api/v1/copilot/tool/find-similar',
  };

  const endpoint = toolEndpoints[name];
  if (!endpoint) return { error: `Unknown tool: ${name}` };

  // Strip any LLM-provided keys that match system context fields to prevent shadowing.
  const CTX_KEYS = new Set(['db_path', 'chroma_path', 'user_id']);
  const safeArgs = Object.fromEntries(Object.entries(args).filter(([k]) => !CTX_KEYS.has(k)));

  try {
    return await pythonPost(endpoint, { ...safeArgs, ...ctx });
  } catch (err) {
    log.error(`copilot: tool ${name} failed:`, err.message);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Background title regeneration for sessions with missing/default titles
// ---------------------------------------------------------------------------

async function regenerateMissingTitles(sessions, ctx, event) {
  for (const s of sessions) {
    try {
      // Get first user message for this session
      const messagesResult = await pythonGet(
        `/api/v1/chat/sessions/${encodeURIComponent(s.id)}/messages`,
        ctx,
      );
      const messages = messagesResult.messages || messagesResult;
      const firstUserMsg = messages.find((m) => m.role === 'user');
      if (!firstUserMsg || !firstUserMsg.content) continue;

      // Try Express title generation
      let title;
      try {
        const titleResult = await expressPost('/api/v1/ai/generate-title', {
          message: firstUserMsg.content,
        });
        if (titleResult.title && titleResult.title.trim()) {
          title = titleResult.title.trim();
        }
      } catch {
        // Fallback to first 6 words
        const words = firstUserMsg.content.trim().split(/\s+/);
        title = words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '');
      }

      if (title) {
        await pythonPost('/api/v1/copilot/update-session-title', {
          session_id: s.id,
          title,
          ...ctx,
        });
        // Notify React of the updated title
        event.sender.send('copilot:stream-end-title', {
          session_id: s.id,
          session_title: title,
        });
      }
    } catch (err) {
      log.warn(`copilot: failed to regenerate title for session ${s.id}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Register all copilot IPC handlers
// ---------------------------------------------------------------------------

/**
 * Registers Copilot IPC handlers.
 *
 * Copilot orchestration:
 *   - Streaming chat with SSE + tool call loop (max 3 rounds)
 *   - Background indexing pipeline (7-step per file)
 *   - Audit, simulate, insights via 3-step flows
 *   - Passthrough handlers for session/suggestions/indexing CRUD
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {() => Electron.BrowserWindow | null} getMainWindow
 */
function registerCopilotHandlers(ipcMain, getMainWindow) {

  // ── copilot:send-message (streaming chat) ────────────────

  ipcMain.handle('copilot:send-message', async (event, data) => {
    try {
      activeStreamController = new AbortController();
      const ctx = getUserContext();
      const requestId = crypto.randomUUID();

      // Step 1: Embed the user query via Express
      const embedResult = await expressPost('/api/v1/ai/embed', {
        texts: [data.message],
      });
      const queryVector = embedResult.vectors[0];

      // Step 2: Hybrid search via Python
      const searchResults = await pythonPost('/api/v1/copilot/search', {
        query_text: data.message,
        query_vector: queryVector,
        scope_type: data.scope_type,
        scope_ids: data.scope_ids,
        session_id: data.session_id,
        scope_name: data.scope_name,
        ...ctx,
      });

      // Step 3: Stream with tool call loop (max 3 rounds)
      let messages = buildMessages(
        searchResults.formatted_chunks,
        searchResults.history,
        data.message,
      );
      let fullText = '';
      let allToolCalls = [];
      const maxRounds = 3;

      for (let round = 0; round < maxRounds; round++) {
        const isLastRound = round === maxRounds - 1;

        const streamResult = await streamFromExpress(event, {
          system_prompt: buildSystemPrompt(),
          messages,
          tool_round: round,
          tools: isLastRound ? undefined : COPILOT_TOOLS,
          tool_config: isLastRound ? undefined : { mode: 'AUTO' },
          // Only pass requestId on initial round for idempotent message counting
          ...(round === 0 ? { requestId } : {}),
        });

        fullText += streamResult.text;

        if (streamResult.toolCalls.length === 0) {
          // Gemini is done — send final event to React
          event.sender.send('copilot:stream-end', {
            sources: searchResults.sources,
            session_id: searchResults.session_id,
          });
          break;
        }

        // Tool call(s) — execute via Python, then loop
        for (const tc of streamResult.toolCalls) {
          allToolCalls.push(tc);
          event.sender.send('copilot:stream-reasoning', {
            step: `Using ${tc.name}...`,
          });

          const toolResult = await executeTool(tc.name, tc.args, data.scope_type, data.scope_ids);

          // Append tool call + result to message history for next round
          messages.push({
            role: 'model',
            parts: [{ functionCall: { name: tc.name, args: tc.args } }],
          });
          messages.push({
            role: 'user',
            parts: [{ functionResponse: { name: tc.name, response: toolResult } }],
          });
        }
        // Loop continues — next round makes a new Express call with updated messages
      }

      // Step 4: Save to SQLite via Python
      // NOTE: SaveMessageRequest only accepts these 5 fields — do NOT spread ctx here
      await pythonPost('/api/v1/copilot/save-message', {
        session_id: searchResults.session_id,
        user_message: data.message,
        assistant_response: fullText,
        sources: JSON.stringify(searchResults.sources || []),
        tool_calls: JSON.stringify(allToolCalls),
      });

      // Generate title if first message in session
      if (!searchResults.session_title) {
        // Smart fallback: first ~6 words of the user message
        const words = data.message.trim().split(/\s+/);
        const fallbackTitle = words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '');

        let generatedTitle = fallbackTitle;
        try {
          const titleResult = await expressPost('/api/v1/ai/generate-title', {
            message: data.message,
          });
          if (titleResult.title && titleResult.title.trim()) {
            generatedTitle = titleResult.title.trim();
          }
        } catch (err) {
          log.warn('copilot: title generation failed, using fallback:', err.message);
        }

        // Always save a title (generated or fallback)
        try {
          await pythonPost('/api/v1/copilot/update-session-title', {
            session_id: searchResults.session_id,
            title: generatedTitle,
            ...ctx,
          });
          // Send title update to React so the session list reflects it
          event.sender.send('copilot:stream-end-title', {
            session_id: searchResults.session_id,
            session_title: generatedTitle,
          });
        } catch (err) {
          log.warn('copilot: title save failed:', err.message);
        }
      }

      activeStreamController = null;
      return { success: true, session_id: searchResults.session_id };
    } catch (err) {
      activeStreamController = null;
      if (err.name === 'AbortError') {
        log.info('copilot: stream cancelled by user');
        return { success: false, error: 'Stream cancelled.' };
      }
      log.error('copilot:send-message failed:', err.message);
      event.sender.send('copilot:stream-error', { message: err.message });
      return { success: false, error: err.message };
    }
  });

  // ── copilot:cancel-stream ────────────────────────────────

  ipcMain.handle('copilot:cancel-stream', async () => {
    if (activeStreamController) {
      activeStreamController.abort();
      activeStreamController = null;
      log.info('copilot: stream aborted');
    }
    return { success: true };
  });

  // ── copilot:index-files (background indexing pipeline) ───

  ipcMain.handle('copilot:index-files', async (_event, { file_ids, dataroom_id }) => {
    // Auto-resolve file_ids from pending jobs when not explicitly provided
    if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
      if (dataroom_id) {
        try {
          const ctx = getUserContext();
          const pendingResult = await pythonGet('/api/v1/indexing/pending-files', {
            dataroom_id, ...ctx,
          });
          file_ids = (pendingResult.files || []).map(f => f.file_id);
          if (file_ids.length > 0) {
            log.info(`copilot:index-files: auto-resolved ${file_ids.length} pending file(s) for dataroom ${dataroom_id}`);
          }
        } catch (err) {
          log.warn('copilot:index-files: failed to auto-resolve pending files:', err.message);
        }
      }
      if (!file_ids || file_ids.length === 0) {
        log.warn('copilot:index-files: no pending files found, skipping');
        return { success: true, completed: 0, total: 0 };
      }
    }

    const ctx = getUserContext();
    const total = file_ids.length;
    let completed = 0;

    const win = getMainWindow();

    for (const fileId of file_ids) {
      try {
        // 1. Prepare index via Python
        const prepared = await pythonPost('/api/v1/copilot/prepare-index', {
          file_ids: [fileId],
          dataroom_id,
          ...ctx,
        });

        const fileData = prepared.files && prepared.files[0];
        if (!fileData) {
          log.warn(`copilot: prepare-index returned no data for file ${fileId}`);
          completed++;
          continue;
        }

        // NOTE: Duplicate detection removed — each file gets its own embeddings.

        // If skipped (no text / image-only): already marked complete by Python
        if (fileData.skipped) {
          log.info(`copilot: file ${fileId} skipped (no extractable text), marked complete`);
          completed++;
          if (win && !win.isDestroyed()) {
            win.webContents.send('copilot:index-progress', {
              completed, total, current_file: fileId, status: 'skipped',
            });
          }
          continue;
        }

        // If job was claimed by another concurrent worker: treat as done
        if (fileData.already_claimed) {
          log.info(`copilot: file ${fileId} job already claimed by another worker, skipping`);
          completed++;
          if (win && !win.isDestroyed()) {
            win.webContents.send('copilot:index-progress', {
              completed, total, current_file: fileId, status: 'duplicate',
            });
          }
          continue;
        }

        // 2. Embed chunk texts via Express
        const chunkTexts = fileData.chunks.map(c => c.text);
        const embedResult = await expressPost('/api/v1/ai/embed', {
          texts: chunkTexts,
        });

        // 3. Apply index via Python (store in ChromaDB + FTS5)
        await pythonPost('/api/v1/copilot/apply-index', {
          file_id: fileId,
          dataroom_id,
          chunks: fileData.chunks,
          vectors: embedResult.vectors,
          embedding_model: embedResult.model || 'gemini-embedding-001',
          file_size_bytes: fileData.file_size_bytes,
          file_mtime: fileData.file_mtime,
          content_checksum: fileData.checksum,
          preview_text: fileData.preview_text || null,
          ...ctx,
        });

        // 4. Extract entities via Express
        try {
          const entityText = fileData.first_2000_chars || '';
          if (entityText.length > 0) {
            const entities = await expressPost('/api/v1/ai/extract-entities', {
              text: entityText,
            });

            // 5. Apply entities via Python
            await pythonPost('/api/v1/copilot/apply-entities', {
              file_id: fileId,
              dataroom_id,
              entities,
              ...ctx,
            });
          }
        } catch (err) {
          log.warn(`copilot: entity extraction failed for file ${fileId} (non-fatal):`, err.message);
        }

        // 6. Summarize file via Express
        try {
          const summaryText = fileData.first_2000_chars || '';
          if (summaryText.length > 0) {
            const summaryResult = await expressPost('/api/v1/ai/summarize-file', {
              text: summaryText,
            });

            // 7. Apply summary via Python
            await pythonPost('/api/v1/copilot/apply-summary', {
              file_id: fileId,
              summary: summaryResult.summary,
              ...ctx,
            });
          }
        } catch (err) {
          log.warn(`copilot: summary generation failed for file ${fileId} (non-fatal):`, err.message);
        }

        completed++;
        if (win && !win.isDestroyed()) {
          win.webContents.send('copilot:index-progress', {
            completed, total, current_file: fileId, status: 'complete',
          });
        }
      } catch (err) {
        log.error(`copilot: indexing failed for file ${fileId}:`, err.message);

        // Mark the job as failed in Python so it doesn't stay stuck in 'processing'
        try {
          await pythonPost('/api/v1/indexing/mark-failed', {
            file_id: fileId,
            error_message: err.message,
            ...ctx,
          });
        } catch { /* best-effort */ }

        completed++;
        if (win && !win.isDestroyed()) {
          win.webContents.send('copilot:index-progress', {
            completed, total, current_file: fileId, status: 'failed',
          });
        }
        // Continue to next file
      }
    }

    return { success: true, completed, total };
  });

  // ── Passthrough handlers (Python direct) ─────────────────

  ipcMain.handle('copilot:get-sessions', async (event, data) => {
    try {
      const ctx = getUserContext();
      const params = { ...ctx };
      if (data && data.scope_type) params.scope_type = data.scope_type;
      if (data && data.scope_id) params.scope_id = data.scope_id;
      const result = await pythonGet('/api/v1/chat/sessions', params);
      const sessions = result.sessions || result;

      // Background: regenerate titles for sessions still named "New Chat" or untitled
      const needsTitle = sessions.filter((s) => !s.title || s.title === 'New Chat');
      if (needsTitle.length > 0) {
        regenerateMissingTitles(needsTitle, ctx, event).catch(() => {});
      }

      return { success: true, sessions };
    } catch (err) {
      log.error('copilot:get-sessions failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copilot:get-messages', async (_event, data) => {
    try {
      const ctx = getUserContext();
      const result = await pythonGet(
        `/api/v1/chat/sessions/${encodeURIComponent(data.session_id)}/messages`,
        ctx,
      );
      return { success: true, messages: result.messages || result };
    } catch (err) {
      log.error('copilot:get-messages failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copilot:delete-session', async (_event, data) => {
    try {
      const ctx = getUserContext();
      await pythonDelete(
        `/api/v1/chat/sessions/${encodeURIComponent(data.session_id)}?db_path=${encodeURIComponent(ctx.db_path)}`,
      );
      return { success: true };
    } catch (err) {
      log.error('copilot:delete-session failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copilot:get-index-status', async (_event, data) => {
    try {
      const ctx = getUserContext();
      const params = { ...ctx };
      if (data && data.dataroom_id) params.dataroom_id = data.dataroom_id;
      const result = await pythonGet('/api/v1/indexing/status', params);
      return { success: true, ...result };
    } catch (err) {
      log.error('copilot:get-index-status failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copilot:retry-indexing', async (_event, data) => {
    try {
      const ctx = getUserContext();
      const result = await pythonPost('/api/v1/indexing/retry-failed', {
        dataroom_id: data.dataroom_id,
        ...ctx,
      });
      return { success: true, ...result };
    } catch (err) {
      log.error('copilot:retry-indexing failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── copilot:compare-documents ─────────────────────────────

  ipcMain.handle('copilot:compare-documents', async (event, { file_ids }) => {
    try {
      activeStreamController = new AbortController();
      const ctx = getUserContext();

      // Step 1: Python fetches structured file content (3000 chars per file)
      const compareData = await pythonPost('/api/v1/copilot/prepare-compare', {
        file_ids,
        ...ctx,
      });

      if (!compareData.files || compareData.files.length === 0) {
        event.sender.send('copilot:stream-error', { message: 'No file content available for comparison.' });
        return { success: false };
      }

      // Step 2: Build compare message for Gemini
      const fileBlocks = compareData.files.map((f) =>
        `### ${f.file_name}\n\n${f.content || '[No extractable text]'}`
      ).join('\n\n---\n\n');

      const comparePrompt = `Compare the following documents and highlight:\n- Key similarities\n- Key differences\n- Any conflicts or inconsistencies\n\n${fileBlocks}`;

      const systemPrompt = `You are Orvyn Copilot, an expert document analyst. The user has selected specific documents for comparison. Your task is to provide a structured, actionable comparison that highlights similarities, differences, and any conflicts or inconsistencies between the documents. Be specific and cite the documents by name.`;

      const messages = [
        {
          role: 'user',
          parts: [{ text: comparePrompt }],
        },
      ];

      // Step 3: Stream the comparison result
      await streamFromExpress(event, {
        system_prompt: systemPrompt,
        messages,
        // Skip message counting — compare is an internal feature, not a user chat message
        tool_round: 1,
      });

      // Build source entries from compareData
      const sources = compareData.files.map((f) => ({
        file_id: f.file_id,
        file_name: f.file_name,
        dataroom_name: null,
        page: null,
      }));

      event.sender.send('copilot:stream-end', {
        sources,
        session_id: null,
        session_title: `Compare: ${compareData.files.map((f) => f.file_name).join(', ')}`,
      });

      return { success: true };
    } catch (err) {
      if (err.name === 'AbortError') {
        log.info('copilot: compare-documents stream cancelled');
        return { success: false, cancelled: true };
      }
      log.error('copilot:compare-documents failed:', err.message);
      event.sender.send('copilot:stream-error', { message: err.message });
      return { success: false, error: err.message };
    } finally {
      activeStreamController = null;
    }
  });

  // ── copilot:check-file-changed ────────────────────────────

  ipcMain.handle('copilot:check-file-changed', async (_event, { file_id }) => {

    try {
      const ctx = getUserContext();
      const result = await pythonPost('/api/v1/copilot/check-file-changed', {
        file_id,
        ...ctx,
      });
      return { success: true, changed: result.changed === true };
    } catch (err) {
      log.error('copilot:check-file-changed failed:', err.message);
      return { success: false, changed: false, error: err.message };
    }
  });
}

// ---------------------------------------------------------------------------
// Startup recovery — resume pending indexing jobs
// ---------------------------------------------------------------------------

/**
 * Called from main.js after /init-db completes.
 * Checks for pending indexing jobs and auto-resumes them in the background.
 *
 * @param {() => Electron.BrowserWindow | null} getMainWindow
 */
async function resumePendingIndexing(getMainWindow) {
  try {
    const ctx = getUserContext();
    const status = await pythonGet('/api/v1/indexing/status', ctx);

    const resumable = (status.pending || 0) + (status.processing || 0);
    if (resumable > 0) {
      log.info(`copilot: resuming ${resumable} indexing jobs from previous session (pending=${status.pending || 0}, processing=${status.processing || 0})`);

      // Get the pending file IDs
      const pendingResult = await pythonGet('/api/v1/indexing/pending-files', ctx);
      const pendingFiles = pendingResult.files || [];

      if (pendingFiles.length > 0) {
        // Group by dataroom_id and trigger indexing in background
        const grouped = {};
        for (const f of pendingFiles) {
          if (!grouped[f.dataroom_id]) grouped[f.dataroom_id] = [];
          grouped[f.dataroom_id].push(f.file_id);
        }

        for (const [dataroomId, fileIds] of Object.entries(grouped)) {
          // Fire and forget — runs in background, does not block startup
          const win = getMainWindow();
          const fakeEvent = {
            sender: win && !win.isDestroyed() ? win.webContents : { send: () => {} },
          };
          // Use a pseudo-event that mimics the IPC event shape
          registerCopilotHandlers._indexFilesInternal(fakeEvent, { file_ids: fileIds, dataroom_id: dataroomId })
            .catch(err => log.error('copilot: startup indexing recovery failed:', err.message));
        }
      }
    }
  } catch (err) {
    // Non-fatal — don't crash startup if indexing status check fails
    log.warn('copilot: startup indexing recovery check failed (non-fatal):', err.message);
  }
}

// Expose the index-files logic for startup recovery reuse
registerCopilotHandlers._indexFilesInternal = async function (event, { file_ids, dataroom_id }) {
  if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
    log.warn('copilot:_indexFilesInternal: no valid file_ids provided, skipping');
    return;
  }

  const ctx = getUserContext();
  const total = file_ids.length;
  let completed = 0;

  for (const fileId of file_ids) {
    try {
      const prepared = await pythonPost('/api/v1/copilot/prepare-index', {
        file_ids: [fileId], dataroom_id, ...ctx,
      });
      const fileData = prepared.files && prepared.files[0];
      if (!fileData) { completed++; continue; }
      if (fileData.is_duplicate) {
        log.info(`copilot: recovery - file ${fileId} is duplicate, skipping`);
        completed++;
        continue;
      }
      if (fileData.skipped) {
        log.info(`copilot: recovery - file ${fileId} skipped (no text), already marked complete`);
        completed++;
        continue;
      }
      if (fileData.already_claimed) {
        log.info(`copilot: recovery - file ${fileId} job already claimed by another worker`);
        completed++;
        continue;
      }

      const chunkTexts = fileData.chunks.map(c => c.text);
      const embedResult = await expressPost('/api/v1/ai/embed', { texts: chunkTexts });

      await pythonPost('/api/v1/copilot/apply-index', {
        file_id: fileId, dataroom_id, chunks: fileData.chunks,
        vectors: embedResult.vectors, embedding_model: embedResult.model || 'gemini-embedding-001',
        file_size_bytes: fileData.file_size_bytes, file_mtime: fileData.file_mtime,
        content_checksum: fileData.checksum, preview_text: fileData.preview_text || null,
        ...ctx,
      });

      // Entity extraction (best-effort)
      try {
        if (fileData.first_2000_chars) {
          const entities = await expressPost('/api/v1/ai/extract-entities', { text: fileData.first_2000_chars });
          await pythonPost('/api/v1/copilot/apply-entities', { file_id: fileId, dataroom_id, entities, ...ctx });
        }
      } catch { /* non-fatal */ }

      // Summary (best-effort)
      try {
        if (fileData.first_2000_chars) {
          const summary = await expressPost('/api/v1/ai/summarize-file', { text: fileData.first_2000_chars });
          await pythonPost('/api/v1/copilot/apply-summary', { file_id: fileId, summary: summary.summary, ...ctx });
        }
      } catch { /* non-fatal */ }

      completed++;
      if (event.sender && typeof event.sender.send === 'function') {
        event.sender.send('copilot:index-progress', { completed, total, current_file: fileId, status: 'complete' });
      }
    } catch (err) {
      log.error(`copilot: recovery indexing failed for file ${fileId}:`, err.message);

      // Mark the job as failed in Python so it doesn't stay stuck in 'processing'
      try {
        await pythonPost('/api/v1/indexing/mark-failed', {
          file_id: fileId,
          error_message: err.message,
          ...ctx,
        });
      } catch { /* best-effort */ }

      completed++;
      if (event.sender && typeof event.sender.send === 'function') {
        event.sender.send('copilot:index-progress', { completed, total, current_file: fileId, status: 'failed' });
      }
    }
  }
};

module.exports = { registerCopilotHandlers, resumePendingIndexing };
