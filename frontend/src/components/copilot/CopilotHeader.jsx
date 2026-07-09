import { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  closeCopilot,
  fetchSessions,
} from '../../store/copilotSlice';
import CopilotSessionList from './CopilotSessionList';
import styles from './CopilotPanel.module.css';

/* ── Icons ───────────────────────────────────────────────── */

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconChevronDown = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/* ── CopilotHeader ───────────────────────────────────────── */

function CopilotHeader() {
  const dispatch = useDispatch();
  const scopeName = useSelector((s) => s.copilot.scopeName);
  const scopeType = useSelector((s) => s.copilot.scopeType);
  const scopeIds = useSelector((s) => s.copilot.scopeIds);

  const [showSessions, setShowSessions] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSessions) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowSessions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSessions]);

  const [showAllSessions, setShowAllSessions] = useState(true);

  const handleToggleSessions = () => {
    if (!showSessions) {
      if (showAllSessions) {
        dispatch(fetchSessions({}));
      } else {
        dispatch(fetchSessions({ scopeType, scopeId: scopeIds?.[0] }));
      }
    }
    setShowSessions((v) => !v);
  };

  const handleToggleFilter = (showAll) => {
    setShowAllSessions(showAll);
    if (showAll) {
      dispatch(fetchSessions({}));
    } else {
      dispatch(fetchSessions({ scopeType, scopeId: scopeIds?.[0] }));
    }
  };

  // Scope label
  let scopeLabel = scopeName || 'Orvyn Copilot';
  if (scopeType === 'global') {
    scopeLabel = 'All DataRooms';
  } else if (scopeType === 'multi_dataroom') {
    scopeLabel = `Comparing: ${scopeName || 'Multiple DataRooms'}`;
  }

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.scopeLabel}>
          {scopeLabel.length > 25 ? scopeLabel.slice(0, 25) + '...' : scopeLabel}
        </span>
      </div>

      <div className={styles.headerActions} ref={dropdownRef} style={{ position: 'relative' }}>
        {/* New Chat + session dropdown */}
        <button
          className={`${styles.headerBtn} ${styles.newChatBtn}`}
          onClick={handleToggleSessions}
          title="Chat sessions"
          aria-label="Chat sessions"
        >
          <IconPlus />
          <span>New Chat</span>
          <IconChevronDown />
        </button>

        {showSessions && (
          <CopilotSessionList
            onClose={() => setShowSessions(false)}
            showAll={showAllSessions}
            onToggleFilter={handleToggleFilter}
          />
        )}

        {/* Close button */}
        <button
          className={styles.headerBtn}
          onClick={() => dispatch(closeCopilot())}
          title="Close Copilot (Esc)"
          aria-label="Close Copilot"
        >
          <IconClose />
        </button>
      </div>
    </div>
  );
}

export default CopilotHeader;
