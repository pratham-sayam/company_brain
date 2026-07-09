import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// ── Thunks ───────────────────────────────────────────────────

export const sendMessage = createAsyncThunk(
  'copilot/sendMessage',
  async ({ message, sessionId }, { getState, rejectWithValue }) => {
    const { isOnline } = getState().ui;
    if (!isOnline) {
      return rejectWithValue('No internet connection.');
    }
    const { copilot } = getState();
    const result = await window.api.copilot.sendMessage({
      message,
      session_id: sessionId || copilot.activeSessionId,
      scope_type: copilot.scopeType,
      scope_ids: copilot.scopeIds,
      scope_name: copilot.scopeName,
    });
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

export const fetchSessions = createAsyncThunk(
  'copilot/fetchSessions',
  async ({ scopeType, scopeId } = {}, { rejectWithValue }) => {
    const result = await window.api.copilot.getSessions({ scope_type: scopeType, scope_id: scopeId });
    if (!result.success) return rejectWithValue(result.error);
    return result.sessions;
  }
);

export const loadSession = createAsyncThunk(
  'copilot/loadSession',
  async (sessionId, { rejectWithValue }) => {
    const result = await window.api.copilot.getMessages({ session_id: sessionId });
    if (!result.success) return rejectWithValue(result.error);
    return { sessionId, messages: result.messages };
  }
);

export const deleteSession = createAsyncThunk(
  'copilot/deleteSession',
  async (sessionId, { dispatch, rejectWithValue }) => {
    const result = await window.api.copilot.deleteSession({ session_id: sessionId });
    if (!result.success) return rejectWithValue(result.error);
    dispatch(fetchSessions());
    return sessionId;
  }
);

export const indexFiles = createAsyncThunk(
  'copilot/indexFiles',
  async ({ fileIds, dataroomId }, { dispatch, rejectWithValue }) => {
    const result = await window.api.copilot.indexFiles({
      file_ids: fileIds,
      dataroom_id: dataroomId,
    });
    if (!result.success) return rejectWithValue(result.error);
    // Refresh index status so UI updates immediately after indexing completes
    dispatch(getIndexStatus(dataroomId));
    return result;
  }
);

export const getIndexStatus = createAsyncThunk(
  'copilot/getIndexStatus',
  async (dataroomId, { rejectWithValue }) => {
    const result = await window.api.copilot.getIndexStatus({ dataroom_id: dataroomId });
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

export const retryIndexing = createAsyncThunk(
  'copilot/retryIndexing',
  async (dataroomId, { rejectWithValue }) => {
    const result = await window.api.copilot.retryIndexing({ dataroom_id: dataroomId });
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

// ── Slice ────────────────────────────────────────────────────

const copilotSlice = createSlice({
  name: 'copilot',
  initialState: {
    isOpen: false,
    panelWidth: 380,
    sessions: [],
    activeSessionId: null,
    messages: [],
    scopeType: 'dataroom',
    scopeIds: [],
    scopeName: '',
    selectedFileIds: [],
    isLoading: false,
    isSessionsLoading: false,
    isStreaming: false,
    streamingMessage: '',
    isIndexing: false,
    indexStatus: null,
    indexProgress: null,
    error: null,
  },
  reducers: {
    toggleCopilot(state) {
      state.isOpen = !state.isOpen;
    },
    openCopilot(state) {
      state.isOpen = true;
    },
    closeCopilot(state) {
      state.isOpen = false;
    },
    setPanelWidth(state, action) {
      state.panelWidth = action.payload;
    },
    clearMessages(state) {
      state.messages = [];
      state.activeSessionId = null;
      state.streamingMessage = '';
      state.isStreaming = false;
    },
    clearError(state) {
      state.error = null;
    },
    setCopilotScope(state, action) {
      const { scopeType, scopeIds, scopeName } = action.payload;
      state.scopeType = scopeType;
      state.scopeIds = scopeIds;
      state.scopeName = scopeName;
    },
    setSelectedFiles(state, action) {
      state.selectedFileIds = action.payload;
    },
    startStreaming(state) {
      state.isStreaming = true;
      state.streamingMessage = '';
      state.error = null;
    },
    appendStreamChunk(state, action) {
      const chunk = action.payload;
      const text = typeof chunk === 'string' ? chunk : (chunk?.text || chunk?.content || '');
      state.streamingMessage += text;
    },
    finalizeStreamMessage(state, action) {
      const { sources, session_id, session_title } = action.payload;
      // Push the accumulated streaming message as a real assistant message
      state.messages.push({
        role: 'assistant',
        content: state.streamingMessage,
        sources: sources || [],
      });
      state.isStreaming = false;
      state.isLoading = false; // Safety net: ensure input re-enables after stream ends
      state.streamingMessage = '';
      if (session_id) state.activeSessionId = session_id;
      if (session_title) {
        // Update session title in the sessions list if present
        const session = state.sessions.find(s => s.id === session_id);
        if (session) session.title = session_title;
      }
    },
    updateIndexProgress(state, action) {
      state.indexProgress = action.payload;
    },
    updateSessionTitle(state, action) {
      const { session_id, session_title } = action.payload;
      if (session_id) state.activeSessionId = session_id;
      if (session_title) {
        const session = state.sessions.find((s) => s.id === session_id);
        if (session) {
          session.title = session_title;
        } else {
          state.sessions.unshift({ id: session_id, title: session_title });
        }
      }
    },
    startNewSession(state, action) {
      const { scopeType, scopeIds, scopeName } = action.payload;
      state.messages = [];
      state.activeSessionId = null;
      state.streamingMessage = '';
      state.isStreaming = false;
      state.scopeType = scopeType;
      state.scopeIds = scopeIds;
      state.scopeName = scopeName;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // sendMessage
    builder
      .addCase(sendMessage.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        // Add user message to messages array immediately
        state.messages.push({ role: 'user', content: action.meta.arg.message });
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload && action.payload.session_id) {
          state.activeSessionId = action.payload.session_id;
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.isLoading = false;
        state.isStreaming = false;
        state.error = action.payload;
      });

    // fetchSessions — uses isSessionsLoading to avoid blocking chat input
    builder
      .addCase(fetchSessions.pending, (state) => {
        state.isSessionsLoading = true;
      })
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.isSessionsLoading = false;
        state.sessions = action.payload || [];
      })
      .addCase(fetchSessions.rejected, (state, action) => {
        state.isSessionsLoading = false;
        state.error = action.payload;
      });

    // loadSession — uses isSessionsLoading to avoid blocking chat input
    builder
      .addCase(loadSession.pending, (state) => {
        state.isSessionsLoading = true;
      })
      .addCase(loadSession.fulfilled, (state, action) => {
        state.isSessionsLoading = false;
        state.activeSessionId = action.payload.sessionId;
        state.messages = action.payload.messages || [];
      })
      .addCase(loadSession.rejected, (state, action) => {
        state.isSessionsLoading = false;
        state.error = action.payload;
      });

    // deleteSession
    builder
      .addCase(deleteSession.fulfilled, (state, action) => {
        state.sessions = state.sessions.filter(s => s.id !== action.payload);
        if (state.activeSessionId === action.payload) {
          state.activeSessionId = null;
          state.messages = [];
        }
      })
      .addCase(deleteSession.rejected, (state, action) => {
        state.error = action.payload;
      });

    // indexFiles
    builder
      .addCase(indexFiles.pending, (state) => {
        state.isIndexing = true;
        state.indexProgress = null;
      })
      .addCase(indexFiles.fulfilled, (state) => {
        state.isIndexing = false;
      })
      .addCase(indexFiles.rejected, (state, action) => {
        state.isIndexing = false;
        state.error = action.payload;
      });

    // getIndexStatus
    builder
      .addCase(getIndexStatus.fulfilled, (state, action) => {
        state.indexStatus = action.payload;
      })
      .addCase(getIndexStatus.rejected, (state, action) => {
        state.error = action.payload;
      });

    // retryIndexing
    builder
      .addCase(retryIndexing.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export const {
  toggleCopilot,
  openCopilot,
  closeCopilot,
  clearMessages,
  clearError,
  setCopilotScope,
  setSelectedFiles,
  startStreaming,
  appendStreamChunk,
  finalizeStreamMessage,
  updateIndexProgress,
  updateSessionTitle,
  startNewSession,
  setPanelWidth,
} = copilotSlice.actions;

export default copilotSlice.reducer;
