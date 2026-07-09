import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { refreshCurrentView } from './fileExplorerSlice';

// ── Thunks ───────────────────────────────────────────────────

export const selectAndRegisterFiles = createAsyncThunk(
  'file/selectAndRegisterFiles',
  async (dataroomId, { dispatch, rejectWithValue }) => {
    const selection = await window.api.file.selectFiles();
    if (!selection.success) return rejectWithValue(selection.error);
    if (selection.filePaths.length === 0) return null; // User cancelled

    const result = await window.api.file.register(dataroomId, selection.filePaths);
    if (!result.success) return rejectWithValue(result.error);

    dispatch(refreshCurrentView());
    return result;
  }
);

export const selectAndRegisterFolder = createAsyncThunk(
  'file/selectAndRegisterFolder',
  async (dataroomId, { dispatch, rejectWithValue }) => {
    const selection = await window.api.file.selectFolder();
    if (!selection.success) return rejectWithValue(selection.error);
    if (selection.filePaths.length === 0) return null; // User cancelled

    const result = await window.api.file.register(dataroomId, selection.filePaths);
    if (!result.success) return rejectWithValue(result.error);

    dispatch(refreshCurrentView());
    return result;
  }
);

export const classifyFiles = createAsyncThunk(
  'file/classifyFiles',
  async ({ dataroomId, fileIds }, { dispatch, rejectWithValue }) => {
    const result = await window.api.ai.classify(dataroomId, fileIds);
    if (!result.success) return rejectWithValue(result.error);

    dispatch(refreshCurrentView());
    return result;
  }
);

export const generateDataroom = createAsyncThunk(
  'file/generateDataroom',
  async ({ name, description, fileIds }, { rejectWithValue }) => {
    const result = await window.api.ai.generateDataroom(name, description, fileIds);
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

// ── Upload Modal thunks (decoupled flow) ────────────────

export const registerFiles = createAsyncThunk(
  'file/registerFiles',
  async ({ dataroomId, filePaths }, { rejectWithValue }) => {
    const result = await window.api.file.register(dataroomId, filePaths);
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

export const classifyRegisteredFiles = createAsyncThunk(
  'file/classifyRegisteredFiles',
  async ({ dataroomId, fileIds }, { rejectWithValue }) => {
    const result = await window.api.ai.classify(dataroomId, fileIds);
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

export const generateNewDataroom = createAsyncThunk(
  'file/generateNewDataroom',
  async ({ name, description, fileIds, dataroomId }, { rejectWithValue }) => {
    const result = await window.api.ai.generateDataroom(name, description, fileIds, dataroomId);
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

export const moveFileToFolder = createAsyncThunk(
  'file/moveFileToFolder',
  async ({ fileId, folderId, dataroomId }, { dispatch, rejectWithValue }) => {
    const result = await window.api.file.moveToFolder(fileId, folderId, dataroomId);
    if (!result.success) return rejectWithValue(result.error);
    dispatch(refreshCurrentView());
    return result.file;
  }
);

export const removeFromOrvyn = createAsyncThunk(
  'file/removeFromOrvyn',
  async (fileId, { dispatch, rejectWithValue }) => {
    const result = await window.api.file.removeFromOrvyn(fileId);
    if (!result.success) return rejectWithValue(result.error);
    dispatch(refreshCurrentView());
    return result;
  }
);

export const deleteFromSystem = createAsyncThunk(
  'file/deleteFromSystem',
  async (fileId, { dispatch, rejectWithValue }) => {
    const result = await window.api.file.deleteFromSystem(fileId);
    if (!result.success) return rejectWithValue(result.error);
    dispatch(refreshCurrentView());
    return result;
  }
);

export const openFile = createAsyncThunk(
  'file/openFile',
  async (filePath, { rejectWithValue }) => {
    const result = await window.api.file.open(filePath);
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

export const openFileWith = createAsyncThunk(
  'file/openFileWith',
  async (filePath, { rejectWithValue }) => {
    const result = await window.api.file.openWith(filePath);
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

export const copyFilePath = createAsyncThunk(
  'file/copyFilePath',
  async (filePath, { rejectWithValue }) => {
    const result = await window.api.file.copyPath(filePath);
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

export const copyFileToClipboard = createAsyncThunk(
  'file/copyFileToClipboard',
  async (filePath, { rejectWithValue }) => {
    const result = await window.api.file.copyToClipboard(filePath);
    if (!result.success) return rejectWithValue(result.error);
    return result;
  }
);

export const relocateFile = createAsyncThunk(
  'file/relocateFile',
  async (fileId, { dispatch, rejectWithValue }) => {
    const result = await window.api.file.relocate(fileId);
    if (!result.success) return rejectWithValue(result.error);
    if (result.canceled) return null;
    dispatch(refreshCurrentView());
    return result.file;
  }
);

export const renameFile = createAsyncThunk(
  'file/renameFile',
  async ({ fileId, newName }, { dispatch, rejectWithValue }) => {
    const result = await window.api.file.rename(fileId, newName);
    if (!result.success) return rejectWithValue(result.error);
    dispatch(refreshCurrentView());
    return result.file;
  }
);

// ── Slice ────────────────────────────────────────────────────

const fileSlice = createSlice({
  name: 'file',
  initialState: {
    isRegistering: false,
    isClassifying: false,
    classificationResults: null,
    error: null,
    // Upload modal state
    uploadModal: {
      registrationResult: null,
      classificationResult: null,
      generationResult: null,
      isRegistering: false,
      isClassifying: false,
      isGenerating: false,
      error: null,
    },
  },
  reducers: {
    clearFileError(state) {
      state.error = null;
    },
    clearClassificationResults(state) {
      state.classificationResults = null;
    },
    resetUploadState(state) {
      state.uploadModal = {
        registrationResult: null,
        classificationResult: null,
        generationResult: null,
        isRegistering: false,
        isClassifying: false,
        isGenerating: false,
        error: null,
      };
    },
  },
  extraReducers: (builder) => {
    // selectAndRegisterFiles
    builder
      .addCase(selectAndRegisterFiles.pending, (state) => {
        state.isRegistering = true;
        state.error = null;
      })
      .addCase(selectAndRegisterFiles.fulfilled, (state) => {
        state.isRegistering = false;
      })
      .addCase(selectAndRegisterFiles.rejected, (state, action) => {
        state.isRegistering = false;
        state.error = action.payload;
      });

    // selectAndRegisterFolder
    builder
      .addCase(selectAndRegisterFolder.pending, (state) => {
        state.isRegistering = true;
        state.error = null;
      })
      .addCase(selectAndRegisterFolder.fulfilled, (state) => {
        state.isRegistering = false;
      })
      .addCase(selectAndRegisterFolder.rejected, (state, action) => {
        state.isRegistering = false;
        state.error = action.payload;
      });

    // classifyFiles
    builder
      .addCase(classifyFiles.pending, (state) => {
        state.isClassifying = true;
        state.error = null;
        state.classificationResults = null;
      })
      .addCase(classifyFiles.fulfilled, (state, action) => {
        state.isClassifying = false;
        state.classificationResults = action.payload;
      })
      .addCase(classifyFiles.rejected, (state, action) => {
        state.isClassifying = false;
        state.error = action.payload;
      });

    // generateDataroom
    builder
      .addCase(generateDataroom.rejected, (state, action) => {
        state.error = action.payload;
      });

    // registerFiles (upload modal)
    builder
      .addCase(registerFiles.pending, (state) => {
        state.uploadModal.isRegistering = true;
        state.uploadModal.error = null;
      })
      .addCase(registerFiles.fulfilled, (state, action) => {
        state.uploadModal.isRegistering = false;
        state.uploadModal.registrationResult = action.payload;
      })
      .addCase(registerFiles.rejected, (state, action) => {
        state.uploadModal.isRegistering = false;
        state.uploadModal.error = action.payload;
      });

    // classifyRegisteredFiles (upload modal)
    builder
      .addCase(classifyRegisteredFiles.pending, (state) => {
        state.uploadModal.isClassifying = true;
        state.uploadModal.error = null;
      })
      .addCase(classifyRegisteredFiles.fulfilled, (state, action) => {
        state.uploadModal.isClassifying = false;
        state.uploadModal.classificationResult = action.payload;
      })
      .addCase(classifyRegisteredFiles.rejected, (state, action) => {
        state.uploadModal.isClassifying = false;
        state.uploadModal.error = action.payload;
      });

    // generateNewDataroom (upload modal)
    builder
      .addCase(generateNewDataroom.pending, (state) => {
        state.uploadModal.isGenerating = true;
        state.uploadModal.error = null;
      })
      .addCase(generateNewDataroom.fulfilled, (state, action) => {
        state.uploadModal.isGenerating = false;
        state.uploadModal.generationResult = action.payload;
      })
      .addCase(generateNewDataroom.rejected, (state, action) => {
        state.uploadModal.isGenerating = false;
        state.uploadModal.error = action.payload;
      });

    // Mutation thunks — only track errors
    const mutationThunks = [
      moveFileToFolder,
      removeFromOrvyn,
      deleteFromSystem,
      renameFile,
      relocateFile,
    ];
    for (const thunk of mutationThunks) {
      builder.addCase(thunk.rejected, (state, action) => {
        state.error = action.payload;
      });
    }

    // Shell/clipboard actions — only track errors
    const shellThunks = [openFile, openFileWith, copyFilePath, copyFileToClipboard];
    for (const thunk of shellThunks) {
      builder.addCase(thunk.rejected, (state, action) => {
        state.error = action.payload;
      });
    }
  },
});

export const { clearFileError, clearClassificationResults, resetUploadState } = fileSlice.actions;
export default fileSlice.reducer;
