/**
 * Redux middleware — offline safety net for backend-dependent thunks.
 *
 * Intercepts `createAsyncThunk` pending actions for guarded thunks.
 * When offline, it:
 *   1. Dispatches an error toast.
 *   2. Synthesizes a rejected action so reducers clean up loading state.
 *   3. Blocks the thunk from executing (no IPC / network calls).
 *
 * This is a safety net — the primary guard is the `useRequireOnline` hook
 * at the UI level. The middleware catches programmatic dispatches that
 * bypass the hook (e.g., dispatches from other thunks).
 */

const GUARDED_THUNKS = new Set([
  'file/classifyFiles',
  'file/classifyRegisteredFiles',
  'file/generateDataroom',
  'file/generateNewDataroom',
  'copilot/sendMessage',
  'copilot/indexFiles',
]);

const OFFLINE_MSG = 'No internet connection.';

export const offlineGuardMiddleware = (store) => (next) => (action) => {
  const type = action.type;
  if (typeof type !== 'string') return next(action);

  const parts = type.split('/');
  if (parts.length === 3 && parts[2] === 'pending') {
    const thunkPrefix = `${parts[0]}/${parts[1]}`;
    if (GUARDED_THUNKS.has(thunkPrefix)) {
      const { isOnline } = store.getState().ui;
      if (!isOnline) {
        store.dispatch({
          type: 'ui/addToast',
          payload: { message: OFFLINE_MSG, type: 'error' },
        });
        return next({
          type: `${thunkPrefix}/rejected`,
          payload: OFFLINE_MSG,
          meta: action.meta,
          error: { message: OFFLINE_MSG },
        });
      }
    }
  }

  return next(action);
};
