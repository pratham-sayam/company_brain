import { useSelector, useDispatch } from 'react-redux';
import { addToast } from '../store/uiSlice';

/**
 * Returns `{ isOnline, requireOnline }`.
 *
 * Call `requireOnline(contextLabel?)` at the top of any event handler
 * that requires Express connectivity.
 *
 * - Returns `true` if online (proceed with the action).
 * - Returns `false` if offline (shows a toast and aborts).
 *
 * @example
 * const { isOnline, requireOnline } = useRequireOnline();
 *
 * function handleClassify() {
 *   if (!requireOnline('classify files')) return;
 *   // … safe to call Express-dependent APIs
 * }
 */
export function useRequireOnline() {
  const isOnline = useSelector((s) => s.ui.isOnline);
  const dispatch = useDispatch();

  function requireOnline(contextLabel) {
    if (isOnline) return true;
    const msg = contextLabel
      ? `You're offline. Connect to ${contextLabel}.`
      : 'No internet connection.';
    dispatch(addToast({ message: msg, type: 'error' }));
    return false;
  }

  return { isOnline, requireOnline };
}
