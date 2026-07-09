import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    sidebarCollapsed: true,
    theme: 'light',
    activePage: 'dataroom',
    toasts: [],
    toastCounter: 0,
    // Reflects the background token-refresh scheduler's view of connectivity.
    // true  = access tokens can be silently renewed (online)
    // false = Express unreachable; app operates in local read-only mode
    isOnline: true,
    // Upload page pre-population state
    uploadInitialFiles: null,
    uploadPreselectedDataroomId: null,
    // After classification, navigate back to DataRoomList and auto-select this dataroom
    pendingViewDataroomId: null,
  },
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    toggleTheme(state) {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
    },
    setTheme(state, action) {
      state.theme = action.payload;
    },
    setActivePage(state, action) {
      state.activePage = action.payload;
    },
    setOnline(state, action) {
      state.isOnline = action.payload;
    },
    setUploadInitialFiles(state, action) {
      state.uploadInitialFiles = action.payload;
    },
    setUploadPreselectedDataroomId(state, action) {
      state.uploadPreselectedDataroomId = action.payload;
    },
    clearUploadPageState(state) {
      state.uploadInitialFiles = null;
      state.uploadPreselectedDataroomId = null;
    },
    setPendingViewDataroomId(state, action) {
      state.pendingViewDataroomId = action.payload;
    },
    clearPendingViewDataroomId(state) {
      state.pendingViewDataroomId = null;
    },
    addToast(state, action) {
      const { message, type } = action.payload;

      // Deduplicate: skip if the most recent toast has the same message
      const last = state.toasts[state.toasts.length - 1];
      if (last && last.message === message) return;

      state.toastCounter += 1;
      state.toasts.push({
        id: state.toastCounter,
        message,
        type: type || 'info',
      });
      // Max 3 visible — remove oldest when exceeding
      while (state.toasts.length > 3) {
        state.toasts.shift();
      }
    },
    removeToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const {
  toggleSidebar,
  toggleTheme,
  setTheme,
  setActivePage,
  setOnline,
  setUploadInitialFiles,
  setUploadPreselectedDataroomId,
  clearUploadPageState,
  setPendingViewDataroomId,
  clearPendingViewDataroomId,
  addToast,
  removeToast,
} = uiSlice.actions;

export default uiSlice.reducer;
