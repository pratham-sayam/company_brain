import { createSlice } from '@reduxjs/toolkit';
import { setTheme } from './uiSlice';

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    isAuthenticated: false,
    user: null,
    loading: false,
    error: null,
    // True on every launch until the session restore attempt completes.
    // App.jsx renders a blank shell while this is true.
    isRestoring: true,
  },
  reducers: {
    loginStart(state) {
      state.loading = true;
      state.error = null;
    },
    loginSuccess(state, action) {
      state.isAuthenticated = true;
      state.user = action.payload;
      state.loading = false;
      state.error = null;
    },
    loginFailure(state, action) {
      state.isAuthenticated = false;
      state.user = null;
      state.loading = false;
      state.error = action.payload;
    },
    logout(state) {
      state.isAuthenticated = false;
      state.user = null;
      state.loading = false;
      state.error = null;
    },
    // Dispatched after the restore attempt finishes (success or failure).
    // Transitions the app from the loading shell to the real UI.
    restoreComplete(state) {
      state.isRestoring = false;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  restoreComplete,
} = authSlice.actions;
export default authSlice.reducer;

/**
 * Thunk: performs the full login flow and hydrates theme on success.
 *
 * Electron returns { success, user, theme } from the login IPC handler.
 * Theme is sourced from SQLite via Python — no localStorage involved.
 *
 * @param {{ email: string, password: string }} credentials
 */
export const loginThunk = (credentials) => async (dispatch) => {
  dispatch(loginStart());
  try {
    const result = await window.api.auth.login(credentials);
    if (result.success) {
      dispatch(loginSuccess(result.user));
      dispatch(setTheme(result.theme ?? 'light'));
    } else {
      dispatch(loginFailure(result.error));
    }
  } catch (err) {
    dispatch(loginFailure(err.message));
  }
};
