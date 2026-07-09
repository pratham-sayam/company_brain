import { useSelector, useDispatch } from 'react-redux';
import { startNewSession, loadSession, deleteSession } from '../../store/copilotSlice';
import styles from './CopilotPanel.module.css';

/* ── Icons ───────────────────────────────────────────────── */

const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

/* ── Scope type display labels ──────────────────────────── */

const SCOPE_LABELS = {
  dataroom: 'DataRoom',
  file: 'File',
  files: 'Files',
  folder: 'Folder',
  multi_dataroom: 'Multi-DataRoom',
  global: 'Global',
};

/* ── CopilotSessionList ──────────────────────────────────── */

function CopilotSessionList({ onClose, showAll = true, onToggleFilter }) {
  const dispatch = useDispatch();
  const sessions = useSelector((s) => s.copilot.sessions);
  const activeSessionId = useSelector((s) => s.copilot.activeSessionId);
  const scopeType = useSelector((s) => s.copilot.scopeType);
  const scopeIds = useSelector((s) => s.copilot.scopeIds);
  const scopeName = useSelector((s) => s.copilot.scopeName);

  const handleNewChat = () => {
    dispatch(startNewSession({ scopeType, scopeIds, scopeName }));
    onClose();
  };

  const handleLoad = (sessionId) => {
    dispatch(loadSession(sessionId));
    onClose();
  };

  const handleDelete = (e, sessionId) => {
    e.stopPropagation();
    dispatch(deleteSession(sessionId));
  };

  // Group sessions by scope_type
  const grouped = {};
  sessions.forEach((session) => {
    const key = session.scope_type || 'global';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(session);
  });

  const groupKeys = Object.keys(grouped);

  return (
    <div className={styles.sessionDropdown}>
      {/* New Chat button */}
      <button className={styles.sessionItem} onClick={handleNewChat}>
        <IconPlus />
        <span className={styles.sessionTitle}>New Chat</span>
      </button>

      {onToggleFilter && (
        <div className={styles.sessionFilterRow}>
          <button
            className={`${styles.sessionFilterBtn} ${showAll ? styles.sessionFilterBtnActive : ''}`}
            onClick={() => onToggleFilter(true)}
          >All</button>
          <button
            className={`${styles.sessionFilterBtn} ${!showAll ? styles.sessionFilterBtnActive : ''}`}
            onClick={() => onToggleFilter(false)}
          >Current Scope</button>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className={styles.noSessions}>No past sessions</div>
      ) : (
        groupKeys.map((scopeKey) => (
          <div key={scopeKey} className={styles.sessionGroup}>
            <div className={styles.sessionGroupLabel}>
              {SCOPE_LABELS[scopeKey] || scopeKey}
            </div>
            {grouped[scopeKey].map((session) => (
              <div
                key={session.id}
                className={`${styles.sessionItem} ${session.id === activeSessionId ? styles.sessionItemActive : ''}`}
                onClick={() => handleLoad(session.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLoad(session.id); }}
              >
                <span className={styles.sessionTitle}>
                  {session.title || 'Untitled Chat'}
                </span>
                <button
                  className={styles.sessionDeleteBtn}
                  onClick={(e) => handleDelete(e, session.id)}
                  title="Delete session"
                  aria-label="Delete session"
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export default CopilotSessionList;
