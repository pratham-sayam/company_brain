import { useState, useEffect, useCallback } from 'react';
import styles from './FolderPicker.module.css';

/**
 * Folder picker modal — shows a DataRoom's folder tree for selecting a destination.
 *
 * Props:
 *   dataroomId      — DataRoom to browse
 *   dataroomName    — Display name for root
 *   currentFolderId — Currently selected folder (to exclude or highlight)
 *   onSelect        — Called with folderId (null = root/unclassified)
 *   onClose         — Close the modal
 */

/* ── Icons ──────────────────────────────────────────────── */

const IconChevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconInbox = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

/* ── FolderNode ──────────────────────────────────────────── */

function FolderNode({ dataroomId, folder, selectedId, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const isSelected = selectedId === folder.id;

  async function toggleExpand() {
    if (!expanded && children === null) {
      setLoading(true);
      const result = await window.api.folder.getChildren(dataroomId, folder.id);
      if (result.success) {
        setChildren(result.folders || []);
      }
      setLoading(false);
    }
    setExpanded((prev) => !prev);
  }

  const hasChildren = folder.subfolder_count > 0 || (children && children.length > 0);

  return (
    <div>
      <div
        className={`${styles.treeItem} ${isSelected ? styles.treeItemSelected : ''}`}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren ? (
          <span
            className={`${styles.treeToggle} ${expanded ? styles.treeToggleOpen : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
          >
            <IconChevron />
          </span>
        ) : (
          <span className={styles.treePlaceholder} />
        )}
        <span className={styles.treeIcon}><IconFolder /></span>
        <span className={styles.treeName}>{folder.name}</span>
      </div>

      {expanded && (
        <div className={styles.treeChildren}>
          {loading && (
            <div className={styles.loadingRow}><div className={styles.spinner} /></div>
          )}
          {children && children.map((child) => (
            <FolderNode
              key={child.id}
              dataroomId={dataroomId}
              folder={child}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
          {children && children.length === 0 && !loading && (
            <div className={styles.treeItem} style={{ opacity: 0.5, cursor: 'default' }}>
              <span className={styles.treePlaceholder} />
              <span style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>No subfolders</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── FolderPicker ──────────────────────────────────────── */

function FolderPicker({ dataroomId, dataroomName, currentFolderId, onSelect, onClose }) {
  const [topFolders, setTopFolders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null); // null = Unclassified (root)

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await window.api.folder.getChildren(dataroomId, null);
      if (result.success) {
        setTopFolders(result.folders || []);
      }
      setLoading(false);
    }
    load();
  }, [dataroomId]);

  function handleConfirm() {
    onSelect(selectedId);
    onClose();
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Move to Folder</h3>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <IconClose />
          </button>
        </div>

        <div className={styles.body}>
          {/* Unclassified / Root option */}
          <div
            className={`${styles.treeItem} ${styles.treeItemSpecial} ${selectedId === null ? styles.treeItemSelected : ''}`}
            onClick={() => setSelectedId(null)}
          >
            <span className={styles.treePlaceholder} />
            <span className={styles.treeIcon}><IconInbox /></span>
            <span className={styles.treeName}>Unclassified (Root)</span>
          </div>

          {loading ? (
            <div className={styles.loadingRow}><div className={styles.spinner} /></div>
          ) : (
            topFolders && topFolders.map((folder) => (
              <FolderNode
                key={folder.id}
                dataroomId={dataroomId}
                folder={folder}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={styles.btnPrimary} onClick={handleConfirm} type="button">
            Move Here
          </button>
        </div>
      </div>
    </div>
  );
}

export default FolderPicker;
