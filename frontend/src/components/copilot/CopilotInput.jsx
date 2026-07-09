import { useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { sendMessage, startStreaming } from '../../store/copilotSlice';
import { useRequireOnline } from '../../hooks/useRequireOnline';
import styles from './CopilotPanel.module.css';

/* ── Send icon ───────────────────────────────────────────── */

const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

/* ── CopilotInput ────────────────────────────────────────── */

function CopilotInput({ onSend, disabled: externalDisabled }) {
  const dispatch = useDispatch();
  const isStreaming = useSelector((s) => s.copilot.isStreaming);
  const isLoading = useSelector((s) => s.copilot.isLoading);
  const indexStatus = useSelector((s) => s.copilot.indexStatus);
  const { isOnline, requireOnline } = useRequireOnline();
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const scopeType = useSelector((s) => s.copilot.scopeType);
  const activelyIndexing = (indexStatus?.pending ?? 0) + (indexStatus?.processing ?? 0);
  // In global scope, don't block input for indexing — search only returns indexed chunks.
  // User can still query datarooms that are already indexed.
  const notFullyIndexed = scopeType !== 'global' && activelyIndexing > 0;
  const disabled = isStreaming || isLoading || notFullyIndexed || externalDisabled;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    if (!requireOnline('use Copilot')) return;

    if (onSend) {
      // Let the parent intercept (e.g. multi-DR detection)
      onSend(trimmed);
    } else {
      // Default: dispatch directly
      dispatch(startStreaming());
      dispatch(sendMessage({ message: trimmed }));
    }
    setText('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, dispatch, onSend, requireOnline]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInput = (e) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  };

  return (
    <div className={styles.inputArea}>
      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={externalDisabled ? 'Add files to use Copilot…' : notFullyIndexed ? 'Waiting for files to finish indexing…' : 'Ask about your documents…'}
          rows={1}
          disabled={disabled}
          aria-label="Message input"
        />
      </div>
      <button
        className={styles.sendBtn}
        onClick={handleSend}
        disabled={disabled || !text.trim() || !isOnline}
        title="Send message (Enter)"
        aria-label="Send message"
      >
        <IconSend />
      </button>
    </div>
  );
}

export default CopilotInput;
