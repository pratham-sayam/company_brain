import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// ── Helpers ──────────────────────────────────────────────────

/**
 * Merge folder and file arrays into a single items array.
 * Each item gets a `type` field ('folder' or 'file') and a normalised `name`.
 */
function normalizeItems(folders, files) {
  const folderItems = folders.map((f) => ({
    ...f,
    type: 'folder',
  }));

  const fileItems = files.map((f) => ({
    ...f,
    type: 'file',
    name: f.original_name,
  }));

  return [...folderItems, ...fileItems];
}

/**
 * Sort items: folders always before files (like Windows Explorer).
 * Within each group, sort by the selected field.
 */
function sortItems(items, sortBy, sortOrder) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    // Folders always first
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }

    let cmp = 0;
    switch (sortBy) {
      case 'name':
        cmp = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
        break;
      case 'size':
        cmp = (a.size_bytes || 0) - (b.size_bytes || 0);
        break;
      case 'date':
        cmp = (a.updated_at || a.created_at || '').localeCompare(
          b.updated_at || b.created_at || ''
        );
        break;
      default:
        cmp = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    }

    return sortOrder === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

/**
 * Fetch children (folders + files) at a given level and return normalised items.
 */
async function fetchChildren(dataroomId, folderId) {
  const result = await window.api.folder.getChildren(dataroomId, folderId);
  if (!result.success) throw new Error(result.error);
  return normalizeItems(result.folders, result.files);
}

// ── Thunks ───────────────────────────────────────────────────

export const navigateToDataroom = createAsyncThunk(
  'fileExplorer/navigateToDataroom',
  async (dataroomId, { getState, rejectWithValue }) => {
    try {
      // Look up DataRoom name from dataroomSlice if available
      const { dataroom } = getState();
      const dr = dataroom.datarooms.find((d) => d.id === dataroomId);
      const dataroomName = dr?.name || 'DataRoom';

      const items = await fetchChildren(dataroomId, null);

      return {
        dataroomId,
        dataroomName,
        items,
      };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const navigateToFolder = createAsyncThunk(
  'fileExplorer/navigateToFolder',
  async ({ folderId, folderName }, { getState, rejectWithValue }) => {
    try {
      const { fileExplorer } = getState();
      const items = await fetchChildren(fileExplorer.currentDataroomId, folderId);

      return {
        folderId,
        folderName,
        items,
      };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const navigateUp = createAsyncThunk(
  'fileExplorer/navigateUp',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { fileExplorer } = getState();
      const { currentPath, currentDataroomId } = fileExplorer;

      // Can't go above the DataRoom root
      if (currentPath.length <= 1) return null;

      // Pop the last segment — new target is the second-to-last item
      const newPath = currentPath.slice(0, -1);
      const target = newPath[newPath.length - 1];
      const targetFolderId = target.type === 'dataroom' ? null : target.id;

      const items = await fetchChildren(currentDataroomId, targetFolderId);

      return {
        newPath,
        targetFolderId,
        items,
      };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const navigateToPathIndex = createAsyncThunk(
  'fileExplorer/navigateToPathIndex',
  async (index, { getState, rejectWithValue }) => {
    try {
      const { fileExplorer } = getState();
      const { currentPath, currentDataroomId } = fileExplorer;

      if (index < 0 || index >= currentPath.length) return null;

      const newPath = currentPath.slice(0, index + 1);
      const target = newPath[newPath.length - 1];
      const targetFolderId = target.type === 'dataroom' ? null : target.id;

      const items = await fetchChildren(currentDataroomId, targetFolderId);

      return {
        newPath,
        targetFolderId,
        items,
      };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const navigateDirect = createAsyncThunk(
  'fileExplorer/navigateDirect',
  async ({ folderId, path }, { getState, rejectWithValue }) => {
    try {
      const { fileExplorer } = getState();
      const items = await fetchChildren(fileExplorer.currentDataroomId, folderId);
      return { folderId, path, items };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const refreshCurrentView = createAsyncThunk(
  'fileExplorer/refreshCurrentView',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { fileExplorer } = getState();
      const { currentDataroomId, currentFolderId } = fileExplorer;

      if (!currentDataroomId) return null;

      const items = await fetchChildren(currentDataroomId, currentFolderId);
      return { items };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const navigateToFile = createAsyncThunk(
  'fileExplorer/navigateToFile',
  async ({ dataroomId, folderId, fileId }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(navigateToDataroom(dataroomId)).unwrap();
      if (folderId) {
        await dispatch(navigateToFolder({ folderId, folderName: '' })).unwrap();
      }
      return { fileId };
    } catch (err) {
      return rejectWithValue(err.message || err);
    }
  }
);

// ── Slice ────────────────────────────────────────────────────

const fileExplorerSlice = createSlice({
  name: 'fileExplorer',
  initialState: {
    currentDataroomId: null,
    currentFolderId: null,
    currentPath: [],
    items: [],
    selectedItems: [],
    viewMode: 'grid',
    sortBy: 'name',
    sortOrder: 'asc',
    searchQuery: '',
    isLoading: false,
    error: null,
    pendingMoves: [],
    contentChangedIds: [],
    isNavigatingToFile: false,
  },
  reducers: {
    setViewMode(state, action) {
      state.viewMode = action.payload;
    },
    setSortBy(state, action) {
      state.sortBy = action.payload;
      state.items = sortItems(state.items, state.sortBy, state.sortOrder);
    },
    setSortOrder(state, action) {
      state.sortOrder = action.payload;
      state.items = sortItems(state.items, state.sortBy, state.sortOrder);
    },
    setSearchQuery(state, action) {
      state.searchQuery = action.payload;
    },
    setSelectedItems(state, action) {
      state.selectedItems = action.payload;
    },
    selectItem(state, action) {
      const { id, type } = action.payload;
      if (!state.selectedItems.some((s) => s.id === id)) {
        state.selectedItems.push({ id, type });
      }
    },
    deselectItem(state, action) {
      state.selectedItems = state.selectedItems.filter((s) => s.id !== action.payload);
    },
    toggleItemSelection(state, action) {
      const { id, type } = action.payload;
      const idx = state.selectedItems.findIndex((s) => s.id === id);
      if (idx >= 0) {
        state.selectedItems.splice(idx, 1);
      } else {
        state.selectedItems.push({ id, type });
      }
    },
    selectAll(state) {
      state.selectedItems = state.items.map((item) => ({
        id: item.id,
        type: item.type,
      }));
    },
    clearSelection(state) {
      state.selectedItems = [];
    },
    markFileForMove(state, action) {
      const file = action.payload;
      if (!state.pendingMoves.some((m) => m.id === file.id)) {
        state.pendingMoves.push(file);
      }
    },
    unmarkFileForMove(state, action) {
      state.pendingMoves = state.pendingMoves.filter((m) => m.id !== action.payload);
    },
    clearPendingMoves(state) {
      state.pendingMoves = [];
    },
    markFileContentChanged(state, action) {
      const fileId = action.payload;
      if (!state.contentChangedIds.includes(fileId)) {
        state.contentChangedIds.push(fileId);
      }
    },
    clearFileContentChanged(state, action) {
      state.contentChangedIds = state.contentChangedIds.filter(
        (id) => id !== action.payload
      );
    },
    removePendingMoveById(state, action) {
      state.pendingMoves = state.pendingMoves.filter((m) => m.id !== action.payload);
    },
    updatePathSegmentName(state, action) {
      const { id, name } = action.payload;
      const seg = state.currentPath.find((s) => s.id === id);
      if (seg) seg.name = name;
    },
    resetExplorer(state) {
      state.currentDataroomId = null;
      state.currentFolderId = null;
      state.currentPath = [];
      state.items = [];
      state.selectedItems = [];
      state.searchQuery = '';
      state.error = null;
      state.isNavigatingToFile = false;
    },
    clearNavigatingToFile(state) {
      state.isNavigatingToFile = false;
    },
  },
  extraReducers: (builder) => {
    // navigateToDataroom
    builder
      .addCase(navigateToDataroom.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.selectedItems = [];
      })
      .addCase(navigateToDataroom.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentDataroomId = action.payload.dataroomId;
        state.currentFolderId = null;
        state.currentPath = [
          { id: action.payload.dataroomId, name: action.payload.dataroomName, type: 'dataroom' },
        ];
        state.items = sortItems(action.payload.items, state.sortBy, state.sortOrder);
        state.searchQuery = '';
      })
      .addCase(navigateToDataroom.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // navigateToFolder
    builder
      .addCase(navigateToFolder.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.selectedItems = [];
      })
      .addCase(navigateToFolder.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentFolderId = action.payload.folderId;
        state.currentPath.push({
          id: action.payload.folderId,
          name: action.payload.folderName,
          type: 'folder',
        });
        state.items = sortItems(action.payload.items, state.sortBy, state.sortOrder);
        state.searchQuery = '';
      })
      .addCase(navigateToFolder.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // navigateUp
    builder
      .addCase(navigateUp.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.selectedItems = [];
      })
      .addCase(navigateUp.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload === null) return; // Already at root
        state.currentPath = action.payload.newPath;
        state.currentFolderId = action.payload.targetFolderId;
        state.items = sortItems(action.payload.items, state.sortBy, state.sortOrder);
      })
      .addCase(navigateUp.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // navigateToPathIndex
    builder
      .addCase(navigateToPathIndex.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.selectedItems = [];
      })
      .addCase(navigateToPathIndex.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload === null) return;
        state.currentPath = action.payload.newPath;
        state.currentFolderId = action.payload.targetFolderId;
        state.items = sortItems(action.payload.items, state.sortBy, state.sortOrder);
      })
      .addCase(navigateToPathIndex.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // navigateDirect (back/forward history)
    builder
      .addCase(navigateDirect.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.selectedItems = [];
      })
      .addCase(navigateDirect.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentFolderId = action.payload.folderId;
        state.currentPath = action.payload.path;
        state.items = sortItems(action.payload.items, state.sortBy, state.sortOrder);
        state.searchQuery = '';
      })
      .addCase(navigateDirect.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // refreshCurrentView
    builder
      .addCase(refreshCurrentView.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(refreshCurrentView.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload === null) return;
        state.items = sortItems(action.payload.items, state.sortBy, state.sortOrder);
        // Prune selection — keep only items that still exist
        const currentIds = new Set(state.items.map((i) => i.id));
        state.selectedItems = state.selectedItems.filter((s) => currentIds.has(s.id));
      })
      .addCase(refreshCurrentView.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // navigateToFile
    builder
      .addCase(navigateToFile.pending, (state) => {
        state.isNavigatingToFile = true;
      })
      .addCase(navigateToFile.fulfilled, (state, action) => {
        // Keep isNavigatingToFile=true until DataRoomList syncs selectedId prop
        // FileExplorer clears it via clearNavigatingToFile once prop matches
        if (action.payload?.fileId) {
          state.selectedItems = [{ id: action.payload.fileId, type: 'file' }];
        }
      })
      .addCase(navigateToFile.rejected, (state) => {
        state.isNavigatingToFile = false;
      });
  },
});

export const {
  setViewMode,
  setSortBy,
  setSortOrder,
  setSearchQuery,
  setSelectedItems,
  selectItem,
  deselectItem,
  toggleItemSelection,
  selectAll,
  clearSelection,
  markFileForMove,
  unmarkFileForMove,
  clearPendingMoves,
  removePendingMoveById,
  updatePathSegmentName,
  resetExplorer,
  clearNavigatingToFile,
  markFileContentChanged,
  clearFileContentChanged,
} = fileExplorerSlice.actions;

export default fileExplorerSlice.reducer;
