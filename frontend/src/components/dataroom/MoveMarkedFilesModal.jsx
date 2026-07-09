import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { removePendingMoveById } from '../../store/fileExplorerSlice';
import { moveFileToFolder } from '../../store/fileSlice';
import { addToast } from '../../store/uiSlice';
import { refreshCurrentView } from '../../store/fileExplorerSlice';
import { fetchDatarooms } from '../../store/dataroomSlice';
import styles from './MoveMarkedFilesModal.module.css';

function MoveMarkedFilesModal({ targetFolderId, targetFolderName, targetDataroomId, onClose }) {
  const dispatch = useDispatch();
  const pendingMoves = useSelector((s) => s.fileExplorer.pendingMoves);
  const [checked, setChecked] = useState(() => new Set(pendingMoves.map((m) => m.id)));
  const [isMoving, setIsMoving] = useState(false);
  const [moveProgress, setMoveProgress] = useState({ current: 0, total: 0 });

  function toggleCheck(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checked.size === pendingMoves.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(pendingMoves.map((m) => m.id)));
    }
  }

  async function handleMove() {
    const selected = pendingMoves.filter((m) => checked.has(m.id));
    if (selected.length === 0) return;

    setIsMoving(true);
    setMoveProgress({ current: 0, total: selected.length });

    let successCount = 0;
    for (let i = 0; i < selected.length; i++) {
      setMoveProgress({ current: i + 1, total: selected.length });
      try {
        await dispatch(moveFileToFolder({
          fileId: selected[i].id,
          folderId: targetFolderId,
          dataroomId: targetDataroomId,
        })).unwrap();
        dispatch(removePendingMoveById(selected[i].id));
        successCount++;
      } catch {
        // Continue with remaining files
      }
    }

    setIsMoving(false);
    if (successCount > 0) {
      dispatch(addToast({
        message: `${successCount} file${successCount > 1 ? 's' : ''} moved to '${targetFolderName}'`,
        type: 'success',
      }));
      dispatch(refreshCurrentView());
      dispatch(fetchDatarooms());
    }
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose();
  }

  const selectedCount = checked.size;

  return (
    <div className={styles.backdrop} onClick={onClose} onKeyDown={handleKeyDown}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>Move Files Here</h3>
            <p className={styles.subtitle}>Select which marked files to move into &lsquo;{targetFolderName}&rsquo;</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {pendingMoves.length > 1 && (
            <label className={styles.selectAllRow}>
              <input
                type="checkbox"
                checked={checked.size === pendingMoves.length}
                onChange={toggleAll}
              />
              <span>Select All ({pendingMoves.length})</span>
            </label>
          )}
          {pendingMoves.map((file) => (
            <label key={file.id} className={styles.fileRow}>
              <input
                type="checkbox"
                checked={checked.has(file.id)}
                onChange={() => toggleCheck(file.id)}
              />
              <span className={styles.fileName}>{file.original_name}</span>
              <span className={styles.fileSource}>
                {file.dataroomName}{file.folderName ? ` / ${file.folderName}` : ''}
              </span>
            </label>
          ))}
        </div>

        <div className={styles.footer}>
          {isMoving && (
            <span className={styles.progressText}>
              Moving {moveProgress.current} of {moveProgress.total}...
            </span>
          )}
          <button className={styles.btnSecondary} onClick={onClose} type="button" disabled={isMoving}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleMove}
            disabled={selectedCount === 0 || isMoving}
            type="button"
          >
            Move {selectedCount > 0 ? `${selectedCount} File${selectedCount > 1 ? 's' : ''}` : 'Selected'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MoveMarkedFilesModal;
