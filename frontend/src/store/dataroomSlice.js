import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { updatePathSegmentName } from './fileExplorerSlice';

// ── Thunks ───────────────────────────────────────────────────

export const fetchDatarooms = createAsyncThunk(
  'dataroom/fetchDatarooms',
  async (_, { rejectWithValue }) => {
    const result = await window.api.dataroom.list();
    if (!result.success) return rejectWithValue(result.error);
    return result.datarooms;
  }
);

export const fetchDataroom = createAsyncThunk(
  'dataroom/fetchDataroom',
  async (id, { rejectWithValue }) => {
    const result = await window.api.dataroom.get(id);
    if (!result.success) return rejectWithValue(result.error);
    return result.dataroom;
  }
);

export const createDataroom = createAsyncThunk(
  'dataroom/createDataroom',
  async ({ name, description }, { getState, dispatch, rejectWithValue }) => {
    const trimmed = name.trim();
    const { dataroom } = getState();
    const duplicate = dataroom.datarooms.some(
      (dr) => dr.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      return rejectWithValue(`A DataRoom named '${trimmed}' already exists.`);
    }

    const result = await window.api.dataroom.create({ name: trimmed, description });
    if (!result.success) return rejectWithValue(result.error);
    // Refresh the list so it includes the new DataRoom
    dispatch(fetchDatarooms());
    return result.dataroom;
  }
);

export const updateDataroom = createAsyncThunk(
  'dataroom/updateDataroom',
  async ({ id, updates }, { getState, dispatch, rejectWithValue }) => {
    if (updates.name) {
      const trimmed = updates.name.trim();
      const { dataroom } = getState();
      const duplicate = dataroom.datarooms.some(
        (dr) => dr.id !== id && dr.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (duplicate) {
        return rejectWithValue(`A DataRoom named '${trimmed}' already exists.`);
      }
    }

    const result = await window.api.dataroom.update(id, updates);
    if (!result.success) return rejectWithValue(result.error);
    if (updates.name) {
      dispatch(updatePathSegmentName({ id, name: updates.name.trim() }));
    }
    dispatch(fetchDatarooms());
    return result.dataroom;
  }
);

export const toggleStarDataroom = createAsyncThunk(
  'dataroom/toggleStarDataroom',
  async (id, { getState, dispatch, rejectWithValue }) => {
    const { dataroom } = getState();
    const dr = dataroom.datarooms.find((d) => d.id === id);
    if (!dr) return rejectWithValue('DataRoom not found');

    const result = await window.api.dataroom.update(id, { is_starred: !dr.is_starred });
    if (!result.success) return rejectWithValue(result.error);
    dispatch(fetchDatarooms());
    return result.dataroom;
  }
);

export const deleteDataroom = createAsyncThunk(
  'dataroom/deleteDataroom',
  async (id, { dispatch, rejectWithValue }) => {
    const result = await window.api.dataroom.delete(id);
    if (!result.success) return rejectWithValue(result.error);
    dispatch(fetchDatarooms());
    return id;
  }
);

// ── Slice ────────────────────────────────────────────────────

const dataroomSlice = createSlice({
  name: 'dataroom',
  initialState: {
    datarooms: [],
    activeDataroom: null,
    isLoading: false,
    isCreating: false,
    error: null,
  },
  reducers: {
    clearError(state) {
      state.error = null;
    },
    clearActiveDataroom(state) {
      state.activeDataroom = null;
    },
  },
  extraReducers: (builder) => {
    // fetchDatarooms
    builder
      .addCase(fetchDatarooms.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDatarooms.fulfilled, (state, action) => {
        state.isLoading = false;
        state.datarooms = action.payload;
      })
      .addCase(fetchDatarooms.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // fetchDataroom
    builder
      .addCase(fetchDataroom.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDataroom.fulfilled, (state, action) => {
        state.isLoading = false;
        state.activeDataroom = action.payload;
      })
      .addCase(fetchDataroom.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // createDataroom
    builder
      .addCase(createDataroom.pending, (state) => {
        state.isCreating = true;
        state.error = null;
      })
      .addCase(createDataroom.fulfilled, (state) => {
        state.isCreating = false;
      })
      .addCase(createDataroom.rejected, (state, action) => {
        state.isCreating = false;
        state.error = action.payload;
      });

    // updateDataroom
    builder
      .addCase(updateDataroom.rejected, (state, action) => {
        state.error = action.payload;
      });

    // deleteDataroom
    builder
      .addCase(deleteDataroom.fulfilled, (state, action) => {
        // Clear activeDataroom if the deleted one was active
        if (state.activeDataroom?.id === action.payload) {
          state.activeDataroom = null;
        }
      })
      .addCase(deleteDataroom.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export const { clearError, clearActiveDataroom } = dataroomSlice.actions;
export default dataroomSlice.reducer;
