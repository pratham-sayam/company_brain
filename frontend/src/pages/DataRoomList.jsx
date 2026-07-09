import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  fetchDatarooms,
  updateDataroom,
  deleteDataroom,
  toggleStarDataroom,
} from '../store/dataroomSlice';
import {
  setActivePage,
  setUploadInitialFiles,
  setUploadPreselectedDataroomId,
  clearPendingViewDataroomId,
  addToast,
} from '../store/uiSlice';
import CreateDataRoomModal from '../components/dataroom/CreateDataRoomModal';
import FileExplorer from '../components/dataroom/FileExplorer';
import styles from './DataRoomList.module.css';

/* ── Icons ───────────────────────────────────────────────── */

const IconDataRoom = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const IconDots = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

const IconStar = ({ filled }) => (
  <svg width="14" height="14" viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconPencil = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconEmptyBox = () => (
  <svg className={styles.emptyIcon} width="48" height="48" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

/* ── Component ───────────────────────────────────────────── */

function DataRoomList() {
  const dispatch = useDispatch();
  const { datarooms, isLoading } = useSelector((s) => s.dataroom);
  const pendingViewDataroomId = useSelector((s) => s.ui.pendingViewDataroomId);

  const currentDataroomId = useSelector((s) => s.fileExplorer.currentDataroomId);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);


  // Inline rename
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameOriginalName, setRenameOriginalName] = useState('');
  const renameRef = useRef(null);
  const renameSavingRef = useRef(false);

  // Dropdown menu
  const [menuOpenId, setMenuOpenId] = useState(null);
  const menuRef = useRef(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Fetch DataRooms on mount
  useEffect(() => {
    dispatch(fetchDatarooms());
  }, [dispatch]);

  // Auto-select dataroom when returning from upload page
  useEffect(() => {
    if (pendingViewDataroomId) {
      setSelectedId(pendingViewDataroomId);
      dispatch(clearPendingViewDataroomId());
    }
  }, [pendingViewDataroomId, dispatch]);

  // Sync selectedId when navigateToFile changes currentDataroomId externally
  useEffect(() => {
    if (currentDataroomId && currentDataroomId !== selectedId) {
      setSelectedId(currentDataroomId);
    }
  }, [currentDataroomId]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpenId(null);
      }
    }
    if (menuOpenId) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpenId]);

  // ── Filtered list ──────────────────────────────────────

  const filtered = [...datarooms]
    .sort((a, b) => {
      if (b.is_starred !== a.is_starred) return (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0);
      return new Date(b.updated_at) - new Date(a.updated_at);
    })
    .filter((dr) => dr.name.toLowerCase().includes(search.toLowerCase()));

  // ── Handlers ───────────────────────────────────────────

  function handleSelect(id) {
    setSelectedId(id);
    setMenuOpenId(null);
  }

  function handleToggleStar(e, id) {
    e.stopPropagation();
    dispatch(toggleStarDataroom(id));
  }

  function handleMenuToggle(e, id) {
    e.stopPropagation();
    setMenuOpenId((prev) => (prev === id ? null : id));
  }

  function startRename(dr) {
    setRenamingId(dr.id);
    setRenameValue(dr.name);
    setRenameOriginalName(dr.name);
    setMenuOpenId(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
    setRenameOriginalName('');
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      dispatch(addToast({ message: 'Name cannot be empty', type: 'error' }));
      return; // Stay in edit mode
    }
    const original = datarooms.find((d) => d.id === renamingId);
    if (!original) { cancelRename(); return; }
    if (trimmed === original.name) { cancelRename(); return; }
    // Check for duplicate names
    const duplicate = datarooms.some(
      (d) => d.id !== renamingId && d.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      dispatch(addToast({ message: 'Name already exists', type: 'error' }));
      return; // Stay in edit mode
    }
    dispatch(updateDataroom({ id: renamingId, updates: { name: trimmed } }))
      .unwrap()
      .then(() => {
        dispatch(addToast({ message: `Renamed to "${trimmed}"`, type: 'success' }));
        cancelRename();
      })
      .catch((err) => {
        dispatch(addToast({ message: err || 'Failed to rename DataRoom', type: 'error' }));
        // Stay in edit mode on error
      });
  }

  function handleRenameKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      renameSavingRef.current = true;
      submitRename();
      setTimeout(() => { renameSavingRef.current = false; }, 100);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  }

  function handleRenameBlur() {
    if (renameSavingRef.current) return;
    cancelRename();
  }

  function startDelete(dr) {
    setDeleteTarget(dr);
    setMenuOpenId(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    dispatch(deleteDataroom(deleteTarget.id));
    if (selectedId === deleteTarget.id) setSelectedId(null);
    setDeleteTarget(null);
  }

  function handleCreated(dataroomId) {
    setSelectedId(dataroomId);
  }

  // ── Navigate to Upload Page ────────────────────────────

  function handleOpenUpload(mode, filePaths) {
    if (mode === 'drop' && filePaths) {
      dispatch(setUploadInitialFiles(filePaths));
    }
    if (selectedId) {
      dispatch(setUploadPreselectedDataroomId(selectedId));
    }
    dispatch(setActivePage('upload'));
  }

  // ── Render ─────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* ── Left panel ─────────────────────────────────── */}
      <div className={styles.listPanel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Data Rooms</span>
          <span className={styles.panelCount}>{datarooms.length}</span>
        </div>

        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search data rooms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className={styles.loadingList}>
            <div className={styles.loadingDots}>
              <span className={styles.loadingDot} />
              <span className={styles.loadingDot} />
              <span className={styles.loadingDot} />
            </div>
          </div>
        ) : (
          <div className={styles.dataroomList}>
            {filtered.map((dr) => (
              <div
                key={dr.id}
                className={`${styles.dataroomItem} ${
                  selectedId === dr.id ? styles.dataroomItemActive : ''
                }`}
                onClick={() => handleSelect(dr.id)}
              >
                <div className={styles.drIcon}>
                  <IconDataRoom />
                </div>

                <div className={styles.drInfo}>
                  {renamingId === dr.id ? (
                    <input
                      ref={renameRef}
                      className={styles.renameInput}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={handleRenameBlur}
                      onKeyDown={handleRenameKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      maxLength={40}
                    />
                  ) : (
                    <span className={styles.drName} title={dr.name}>
                      {dr.name.length > 15 ? dr.name.slice(0, 15) + '...' : dr.name}
                    </span>
                  )}

                  <div className={styles.drMeta}>
                    <span>{`${dr.folder_count ?? 0} folders `}</span>
                    <span>{`${dr.file_count ?? 0} files`}</span>
                  </div>
                </div>

                <div className={`${styles.itemActions} ${dr.is_starred ? styles.itemActionsStarred : ''}`}>
                  <button
                    className={`${styles.starBtn} ${
                      dr.is_starred ? styles.starBtnActive : ''
                    }`}
                    onClick={(e) => handleToggleStar(e, dr.id)}
                    title={dr.is_starred ? 'Unfavorite' : 'Favorite'}
                    type="button"
                  >
                    <IconStar filled={dr.is_starred} />
                  </button>

                  <button
                    className={`${styles.menuBtn} ${
                      menuOpenId === dr.id ? styles.menuBtnOpen : ''
                    }`}
                    onClick={(e) => handleMenuToggle(e, dr.id)}
                    title="Options"
                    type="button"
                  >
                    <IconDots />
                  </button>
                </div>

                {menuOpenId === dr.id && (
                  <div
                    className={styles.dropdown}
                    ref={menuRef}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className={styles.dropdownItem}
                      onClick={() => startRename(dr)}
                      type="button"
                    >
                      <IconPencil /> Rename
                    </button>
                    <button
                      className={`${styles.dropdownItem} ${styles.dropdownDanger}`}
                      onClick={() => startDelete(dr)}
                      type="button"
                    >
                      <IconTrash /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}

            {!isLoading && filtered.length === 0 && datarooms.length > 0 && (
              <div className={styles.emptyState} style={{ padding: '24px 16px' }}>
                <span className={styles.emptyHint}>No data rooms match your search.</span>
                <button
                  className={styles.clearSearchBtn}
                  onClick={() => setSearch('')}
                  type="button"
                >
                  Clear Search
                </button>
              </div>
            )}

            {!isLoading && datarooms.length === 0 && (
              <div className={styles.emptyState} style={{ padding: '32px 16px' }}>
                <span className={styles.emptyTitle}>No DataRooms yet</span>
                <span className={styles.emptyHint}>Create your first DataRoom to start organizing documents.</span>
              </div>
            )}
          </div>
        )}

        <div className={styles.newBtnWrap}>
          <button
            className={styles.newBtn}
            onClick={() => setShowCreateModal(true)}
            type="button"
          >
            <IconPlus /> New Data Room
          </button>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────── */}
      <div className={styles.mainPanel}>
        <FileExplorer
          dataroomId={selectedId}
          onClose={() => setSelectedId(null)}
          onOpenUpload={handleOpenUpload}
          onSelectDataroom={(id) => handleSelect(id)}
          onGoHome={() => setSelectedId(null)}
          onCreateDataroom={() => setShowCreateModal(true)}
        />
      </div>

      {/* ── Create modal ───────────────────────────────── */}
      {showCreateModal && (
        <CreateDataRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* ── Delete confirmation ────────────────────────── */}
      {deleteTarget && (
        <div className={styles.confirmBackdrop} onClick={() => setDeleteTarget(null)} onKeyDown={(e) => { if (e.key === 'Escape') setDeleteTarget(null); if (e.key === 'Enter') confirmDelete(); }}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Delete DataRoom</h3>
            <p className={styles.confirmText}>
              Are you sure you want to delete &quot;{deleteTarget.name}&quot;?
              This will remove all folders, files, and classifications within it.
              This action cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.btnSecondary}
                onClick={() => setDeleteTarget(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.btnDanger}
                onClick={confirmDelete}
                type="button"
                autoFocus
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default DataRoomList;
