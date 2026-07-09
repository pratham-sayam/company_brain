import { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { sendMessage, startStreaming } from '../../store/copilotSlice';
import styles from './CopilotPanel.module.css';

/* ── Icons ───────────────────────────────────────────────── */

const IconSummary = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const IconCompare = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="8" height="16" rx="1" />
    <rect x="14" y="4" width="8" height="16" rx="1" />
  </svg>
);

const IconCheck = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ── CopilotQuickActions ─────────────────────────────────── */

function CopilotQuickActions() {
  const dispatch = useDispatch();
  const selectedItems = useSelector((s) => s.fileExplorer.selectedItems);
  const explorerItems = useSelector((s) => s.fileExplorer.items);
  const [showPicker, setShowPicker] = useState(false);
  const [pickedIds, setPickedIds] = useState([]);
  const pickerRef = useRef(null);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const quickSend = (message) => {
    dispatch(startStreaming());
    dispatch(sendMessage({ message }));
  };

  /* ── Compare logic ─────────────────────────────────────── */

  const handleCompareClick = () => {
    // If 2+ files already selected in explorer, use them directly
    const selectedFiles = selectedItems.filter((s) => s.type === 'file');
    if (selectedFiles.length >= 2) {
      const names = selectedFiles.map((s) => {
        const item = explorerItems.find((i) => i.id === s.id);
        return item?.original_name || item?.name || s.id;
      });
      const prompt = `Compare the following documents and highlight key differences:\n${names.map((n) => `- ${n}`).join('\n')}`;
      quickSend(prompt);
      return;
    }

    // Otherwise open the file picker
    setPickedIds([]);
    setShowPicker(true);
  };

  const togglePick = (fileId) => {
    setPickedIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleCompareSubmit = () => {
    if (pickedIds.length < 2) return;
    const names = pickedIds.map((id) => {
      const item = explorerItems.find((i) => i.id === id);
      return item?.original_name || item?.name || id;
    });
    const prompt = `Compare the following documents and highlight key differences:\n${names.map((n) => `- ${n}`).join('\n')}`;
    quickSend(prompt);
    setShowPicker(false);
  };

  // Files available in the current explorer view
  const availableFiles = explorerItems.filter((item) => item.type === 'file');

  return (
    <div className={styles.quickActions}>
      <button
        className={styles.quickBtn}
        onClick={() => quickSend('Summarize this DataRoom')}
        title="Summarize DataRoom"
      >
        <span className={styles.quickBtnIcon}><IconSummary /></span>
        Summary
      </button>

      <div style={{ position: 'relative' }} ref={pickerRef}>
        <button
          className={styles.quickBtn}
          onClick={handleCompareClick}
          title="Compare documents"
        >
          <span className={styles.quickBtnIcon}><IconCompare /></span>
          Compare
        </button>

        {showPicker && (
          <div className={styles.comparePicker}>
            <div className={styles.comparePickerTitle}>
              Select 2+ files to compare
            </div>
            <div className={styles.comparePickerList}>
              {availableFiles.length === 0 ? (
                <div className={styles.noSessions}>No files in view</div>
              ) : (
                availableFiles.map((file) => {
                  const checked = pickedIds.includes(file.id);
                  return (
                    <button
                      key={file.id}
                      className={`${styles.comparePickerItem} ${checked ? styles.comparePickerItemSelected : ''}`}
                      onClick={() => togglePick(file.id)}
                    >
                      <span className={styles.comparePickerCheck}>
                        {checked && <IconCheck />}
                      </span>
                      <span className={styles.comparePickerName}>
                        {file.original_name || file.name}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <button
              className={styles.runBtn}
              disabled={pickedIds.length < 2}
              onClick={handleCompareSubmit}
              style={{ fontSize: '11px', padding: '6px 14px', marginTop: '6px' }}
            >
              Compare {pickedIds.length >= 2 ? `(${pickedIds.length})` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CopilotQuickActions;
