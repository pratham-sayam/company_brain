import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  navigateToDataroom,
  navigateToFolder,
  navigateUp,
  navigateToPathIndex,
  navigateDirect,
  refreshCurrentView,
  setViewMode,
  setSortBy, 
  setSortOrder,
  setSearchQuery,
  setSelectedItems,
  toggleItemSelection,
  selectAll,
  clearSelection,
  markFileForMove,
  unmarkFileForMove,
  markFileContentChanged,
  clearFileContentChanged,
  resetExplorer,
  clearNavigatingToFile,
} from '../../store/fileExplorerSlice';
import {
  createFolder,
  renameFolder,
  deleteFolder,
  fetchFolderDeletePreview,
  updateFolderContext,
} from '../../store/folderSlice';
import { fetchDatarooms } from '../../store/dataroomSlice';
import {
  openFile,
  openFileWith,
  copyFilePath,
  copyFileToClipboard,
  renameFile,
  removeFromOrvyn,
  deleteFromSystem,
} from '../../store/fileSlice';
import { addToast } from '../../store/uiSlice';
import { toggleCopilot, indexFiles } from '../../store/copilotSlice';
import CopilotPanel from '../copilot/CopilotPanel';
import ContextMenu from '../common/ContextMenu';
import MoveMarkedFilesModal from './MoveMarkedFilesModal';
import styles from './FileExplorer.module.css';

/* ── File-type helpers ──────────────────────────────────── */

function getExtension(name) {
  if (!name) return '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function getFileTypeInfo(ext) {
  switch (ext) {
    case 'pdf':
      return { label: 'PDF', iconClass: 'iconBgPdf' };
    case 'doc':
    case 'docx':
      return { label: 'DOCX', iconClass: 'iconBgDocx' };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { label: 'XLSX', iconClass: 'iconBgXlsx' };
    case 'ppt':
    case 'pptx':
      return { label: 'PPTX', iconClass: 'iconBgPptx' };
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'bmp':
    case 'webp':
    case 'svg':
      return { label: 'IMG', iconClass: 'iconBgImage' };
    default:
      return { label: ext.toUpperCase() || 'FILE', iconClass: 'iconBgDefault' };
  }
}

function formatFileSize(bytes) {
  if (bytes == null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function confidenceColor(score) {
  if (score == null) return null;
  if (score >= 0.7) return '#16a34a';
  if (score >= 0.4) return '#eab308';
  return '#dc2626';
}

/* ── SVG Icons ──────────────────────────────────────────── */

const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IconForward = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconHome = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const IconGrid = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

const IconList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconFolderPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const IconFolder = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconFile = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconEmptyFolder = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    className={styles.emptyIcon}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconPencil = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

const IconOpen = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconMove = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <polyline points="12 11 12 17" /><polyline points="9 14 12 17 15 14" />
  </svg>
);

const IconFileText = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const IconCopilot = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
  </svg>
);

const IconDataRoom = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/* ── Component ──────────────────────────────────────────── */

function FileExplorer({ dataroomId, onClose, onOpenUpload, onSelectDataroom, onGoHome, onCreateDataroom }) {
  const dispatch = useDispatch();
  const {
    currentDataroomId,
    currentFolderId,
    currentPath,
    items,
    selectedItems,
    viewMode,
    sortBy,
    sortOrder,
    searchQuery,
    isLoading,
    error,
    pendingMoves,
    contentChangedIds,
    isNavigatingToFile,
  } = useSelector((s) => s.fileExplorer);

  // Copilot state
  const copilotOpen = useSelector((s) => s.copilot.isOpen);

  // DataRoom list for DataRoom-list mode
  const datarooms = useSelector((s) => s.dataroom.datarooms);
  const isDataroomListMode = !dataroomId;

  // Back / forward history — local state
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isNavigatingRef = useRef(false);

  // New folder modal
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderContext, setNewFolderContext] = useState('');
  const newFolderRef = useRef(null);

  // Rename inline
  const [renamingId, setRenamingId] = useState(null);
  const [renamingType, setRenamingType] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameOriginalName, setRenameOriginalName] = useState('');
  const renameRef = useRef(null);
  const renameSavingRef = useRef(false);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState(null);

  // Move marked files modal
  const [moveModal, setMoveModal] = useState(null);

  // Confirmation dialogs
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState(null);
  const [deleteFolderPreview, setDeleteFolderPreview] = useState(null); // {subfolder_count, file_count}
  const [deleteFolderStep, setDeleteFolderStep] = useState(1); // 1 = choose action, 2 = confirm system delete

  // Subfolder dialog
  const [subfolderDialog, setSubfolderDialog] = useState(null);
  const [subfolderName, setSubfolderName] = useState('');
  const [subfolderContext, setSubfolderContext] = useState('');
  const subfolderRef = useRef(null);

  // Edit description dialog
  const [editDescDialog, setEditDescDialog] = useState(null);
  const [editDescValue, setEditDescValue] = useState('');
  const editDescRef = useRef(null);

  // Drag-and-drop
  const [isDragOver, setIsDragOver] = useState(false);

  // Ref for keyboard shortcuts
  const explorerRef = useRef(null);

  // Click vs double-click timer
  const clickTimerRef = useRef(null);

  // Clean up click timer on unmount
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  // ── Navigate to DataRoom on mount / dataroomId change ──
  useEffect(() => {
    if (dataroomId && dataroomId !== currentDataroomId) {
      dispatch(navigateToDataroom(dataroomId));
    }
    // Clear the external navigation flag once the prop has synced
    if (dataroomId && dataroomId === currentDataroomId && isNavigatingToFile) {
      dispatch(clearNavigatingToFile());
    }
    // Only reset if not in the middle of an external navigation (e.g. Copilot source click)
    if (!dataroomId && currentDataroomId && !isNavigatingToFile) {
      dispatch(resetExplorer());
    }
  }, [dataroomId, currentDataroomId, dispatch, isNavigatingToFile]);

  // ── Push history entry after navigation ──
  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }
    if (!currentDataroomId) {
      setHistory([]);
      setHistoryIndex(-1);
      return;
    }
    if (currentDataroomId && currentPath.length > 0) {
      const entry = { folderId: currentFolderId, path: [...currentPath] };
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIndex + 1);
        return [...trimmed, entry];
      });
      setHistoryIndex((prev) => prev + 1);
    }
  }, [currentFolderId, currentPath, currentDataroomId]);

  // ── Focus inputs ──
  useEffect(() => {
    if (newFolderDialog) newFolderRef.current?.focus();
  }, [newFolderDialog]);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (subfolderDialog && subfolderRef.current) subfolderRef.current.focus();
  }, [subfolderDialog]);

  useEffect(() => {
    if (editDescDialog && editDescRef.current) editDescRef.current.focus();
  }, [editDescDialog]);

  // ── Proactive stale content detection ──
  // Runs when the file list changes; checks each indexed file without blocking rendering.
  const checkedFileIdsRef = useRef(new Set());
  useEffect(() => {
    if (!window.api?.copilot?.checkFileChanged) return;
    const fileItems = items.filter((it) => it.type === 'file');
    fileItems.forEach((file) => {
      // Skip files already checked in this session
      if (checkedFileIdsRef.current.has(file.id)) return;
      checkedFileIdsRef.current.add(file.id);
      // Fire and forget — do not block rendering
      window.api.copilot.checkFileChanged({ file_id: file.id }).then((res) => {
        if (res?.changed === true) {
          dispatch(markFileContentChanged(file.id));
        }
      }).catch(() => {
        // Network error or missing backend — ignore silently
      });
    });
  }, [items, dispatch]);

  // Reset checked set when navigating to a different folder/dataroom
  useEffect(() => {
    checkedFileIdsRef.current = new Set();
  }, [currentDataroomId, currentFolderId]);

  // ── Filtered items ──
  const filtered = searchQuery
    ? items.filter((i) => (i.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKeyDown(e) {
      // Don't handle if inside an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      // Don't handle if a modal is open
      if (moveModal || removeConfirm || deleteConfirm || deleteFolderConfirm || subfolderDialog || editDescDialog || newFolderDialog) return;

      const selected = selectedItems.length === 1
        ? items.find((it) => it.id === selectedItems[0].id)
        : null;

      if (e.key === 'Escape') {
        if (ctxMenu) { setCtxMenu(null); return; }
        dispatch(clearSelection());
        return;
      }

      if (e.key === 'Delete' && selected) {
        e.preventDefault();
        if (selected.type === 'file') {
          setRemoveConfirm(selected);
        } else {
          openDeleteFolderDialog(selected);
        }
        return;
      }

      if (e.key === 'F2' && selected) {
        e.preventDefault();
        startRename(selected);
        return;
      }

      if (e.key === 'Enter' && selected) {
        e.preventDefault();
        if (selected.type === 'folder') {
          dispatch(navigateToFolder({ folderId: selected.id, folderName: selected.name }));
        } else {
          dispatch(openFile(selected.original_path))
            .unwrap()
            .catch((err) => {
              dispatch(addToast({ message: err || 'File not found at its original location', type: 'error' }));
            });
        }
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (isDataroomListMode) return;
        if (currentPath.length <= 1) {
          // At DataRoom root → go back to DataRoom list
          goHome();
        } else {
          dispatch(navigateUp());
        }
        return;
      }

      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        dispatch(selectAll());
        return;
      }

      if (e.ctrlKey && e.key === 'c' && selected && selected.type === 'file') {
        e.preventDefault();
        dispatch(copyFileToClipboard(selected.original_path))
          .unwrap()
          .then((result) => dispatch(addToast({ message: result?.fallback ? 'File path copied to clipboard' : 'File copied to clipboard', type: 'success' })))
          .catch((err) => dispatch(addToast({ message: err || 'Failed to copy file', type: 'error' })));
        return;
      }
    }

    const el = explorerRef.current;
    if (el) {
      el.addEventListener('keydown', handleKeyDown);
      return () => el.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedItems, items, filtered, ctxMenu, moveModal, removeConfirm, deleteConfirm, deleteFolderConfirm, subfolderDialog, editDescDialog, newFolderDialog, dispatch]);

  // ── Navigation handlers ──

  function goBack() {
    if (historyIndex <= 0) return;
    const target = history[historyIndex - 1];
    isNavigatingRef.current = true;
    setHistoryIndex((i) => i - 1);
    dispatch(navigateDirect({ folderId: target.folderId, path: target.path }));
  }

  function goForward() {
    if (historyIndex >= history.length - 1) return;
    const target = history[historyIndex + 1];
    isNavigatingRef.current = true;
    setHistoryIndex((i) => i + 1);
    dispatch(navigateDirect({ folderId: target.folderId, path: target.path }));
  }

  function goHome() {
    // Always go back to DataRoom list view
    if (onGoHome) {
      onGoHome();
    }
  }

  function handleBreadcrumb(index) {
    if (index === currentPath.length - 1) return;
    dispatch(navigateToPathIndex(index));
  }

  function handleItemDoubleClick(e, item) {
    e.stopPropagation();
    // Cancel pending single-click selection
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    if (item.type === 'folder') {
      dispatch(navigateToFolder({ folderId: item.id, folderName: item.name }));
    } else {
      dispatch(openFile(item.original_path))
        .unwrap()
        .catch((err) => {
          dispatch(addToast({ message: err || 'File not found at its original location', type: 'error' }));
        });
    }
  }

  function handleItemClick(e, item) {
    e.stopPropagation();
    // Shift+click and Ctrl+click are immediate (no delay)
    if (e.shiftKey && selectedItems.length > 0) {
      const lastSelected = selectedItems[selectedItems.length - 1];
      const lastIndex = filtered.findIndex((i) => i.id === lastSelected.id);
      const currentIndex = filtered.findIndex((i) => i.id === item.id);
      if (lastIndex >= 0 && currentIndex >= 0) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeItems = filtered.slice(start, end + 1).map((i) => ({ id: i.id, type: i.type }));
        const existingIds = new Set(selectedItems.map((s) => s.id));
        const merged = [...selectedItems];
        for (const ri of rangeItems) {
          if (!existingIds.has(ri.id)) merged.push(ri);
        }
        dispatch(setSelectedItems(merged));
      }
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      dispatch(toggleItemSelection({ id: item.id, type: item.type }));
      return;
    }
    // Delay single-click selection to avoid conflict with double-click
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      dispatch(setSelectedItems([{ id: item.id, type: item.type }]));
    }, 200);
  }

  function handleBackgroundClick(e) {
    if (e.target === e.currentTarget) {
      dispatch(clearSelection());
    }
  }

  // ── Context menu ──

  function handleContextMenu(e, item) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, item });
  }

  function handleBackgroundContextMenu(e) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, item: null });
  }

  function buildFileContextMenuItems(item) {
    return [
      { type: 'action', label: 'Open', icon: <IconOpen />, shortcut: 'Enter', onClick: () => {
        dispatch(openFile(item.original_path)).unwrap().catch((err) => {
          dispatch(addToast({ message: err || 'File not found at its original location', type: 'error' }));
        });
      }},
      { type: 'action', label: 'Open With...', icon: <IconOpen />, onClick: () => {
        dispatch(openFileWith(item.original_path)).unwrap().catch((err) => {
          dispatch(addToast({ message: err || 'Failed to open file', type: 'error' }));
        });
      }},
      { type: 'separator' },
      { type: 'action', label: 'Copy', icon: <IconCopy />, shortcut: 'Ctrl+C', onClick: () => {
        dispatch(copyFileToClipboard(item.original_path)).unwrap()
          .then((result) => dispatch(addToast({ message: result?.fallback ? 'File path copied to clipboard' : 'File copied to clipboard', type: 'success' })))
          .catch((err) => dispatch(addToast({ message: err || 'Failed to copy file', type: 'error' })));
      }},
      { type: 'action', label: 'Copy Path', icon: <IconCopy />, onClick: () => {
        dispatch(copyFilePath(item.original_path)).unwrap()
          .then(() => dispatch(addToast({ message: 'Path copied to clipboard', type: 'success' })))
          .catch((err) => dispatch(addToast({ message: err || 'Failed to copy path', type: 'error' })));
      }},
      { type: 'separator' },
      pendingMoves.some((m) => m.id === item.id)
        ? { type: 'action', label: 'Unmark', icon: <IconX />, onClick: (e) => { e?.stopPropagation?.(); dispatch(unmarkFileForMove(item.id)); } }
        : { type: 'action', label: 'Mark for Move', icon: <IconMove />, onClick: (e) => {
            e?.stopPropagation?.();
            dispatch(markFileForMove({
              id: item.id,
              original_name: item.name,
              dataroomId: currentDataroomId,
              dataroomName: currentPath[0]?.name || 'DataRoom',
              folderId: currentFolderId,
              folderName: currentPath.length > 1 ? currentPath[currentPath.length - 1].name : null,
            }));
          }
        },
      { type: 'separator' },
      { type: 'action', label: 'Rename', icon: <IconPencil />, shortcut: 'F2', onClick: () => startRename(item) },
      { type: 'separator' },
      { type: 'action', label: 'Remove from Orvyn', icon: <IconTrash />, danger: true, shortcut: 'Del', onClick: () => setRemoveConfirm(item) },
      { type: 'action', label: 'Delete from System', icon: <IconTrash />, danger: true, onClick: () => setDeleteConfirm(item) },
    ];
  }

  function buildFolderContextMenuItems(item) {
    return [
      { type: 'action', label: 'Open', icon: <IconOpen />, shortcut: 'Enter', onClick: () => dispatch(navigateToFolder({ folderId: item.id, folderName: item.name })) },
      { type: 'separator' },
      { type: 'action', label: 'New Subfolder', icon: <IconFolderPlus />, onClick: () => { setSubfolderDialog(item); setSubfolderName(''); setSubfolderContext(''); } },
      {
        type: 'action',
        label: 'Move Marked Files Here',
        icon: <IconMove />,
        disabled: pendingMoves.length === 0,
        disabledTooltip: 'No files marked for move',
        onClick: () => {
          if (pendingMoves.length > 0) {
            setMoveModal({ folderId: item.id, folderName: item.name, dataroomId: currentDataroomId });
          }
        },
      },
      { type: 'separator' },
      { type: 'action', label: 'Rename', icon: <IconPencil />, shortcut: 'F2', onClick: () => startRename(item) },
      { type: 'action', label: 'Edit Description', icon: <IconFileText />, onClick: () => { setEditDescDialog(item); setEditDescValue(item.context || ''); } },
      { type: 'separator' },
      { type: 'action', label: 'Delete Folder', icon: <IconTrash />, danger: true, shortcut: 'Del', onClick: () => openDeleteFolderDialog(item) },
    ];
  }

  function buildBackgroundContextMenuItems() {
    return [
      { type: 'action', label: 'New Folder', icon: <IconFolderPlus />, onClick: openNewFolderDialog },
      { type: 'separator' },
      { type: 'label', text: 'View' },
      { type: 'action', label: viewMode === 'grid' ? 'Switch to List' : 'Switch to Grid', icon: viewMode === 'grid' ? <IconList /> : <IconGrid />, onClick: () => dispatch(setViewMode(viewMode === 'grid' ? 'list' : 'grid')) },
      { type: 'separator' },
      { type: 'action', label: 'Refresh', icon: <IconRefresh />, onClick: () => { dispatch(refreshCurrentView()); dispatch(fetchDatarooms()); } },
    ];
  }

  // ── New folder ──

  function openNewFolderDialog() {
    setNewFolderName('');
    setNewFolderContext('');
    setNewFolderDialog(true);
  }

  function submitNewFolder() {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    dispatch(createFolder({
      dataroomId: currentDataroomId,
      parentFolderId: currentFolderId,
      name: trimmed,
      context: newFolderContext.trim() || null,
    }))
      .unwrap()
      .then(() => {
        dispatch(addToast({ message: `Created folder "${trimmed}"`, type: 'success' }));
      })
      .catch((err) => {
        dispatch(addToast({ message: err || 'Failed to create folder', type: 'error' }));
      });
    setNewFolderDialog(false);
  }

  // ── Rename ──

  function startRename(item) {
    setRenamingId(item.id);
    setRenamingType(item.type);
    setRenameOriginalName(item.name);
    // For files, show name without extension
    if (item.type === 'file') {
      const dot = item.name.lastIndexOf('.');
      setRenameValue(dot > 0 ? item.name.slice(0, dot) : item.name);
    } else {
      setRenameValue(item.name);
    }
    setCtxMenu(null);
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      dispatch(addToast({ message: 'Name cannot be empty', type: 'error' }));
      return; // Stay in edit mode
    }
    const item = items.find((i) => i.id === renamingId);
    if (!item) { cancelRename(); return; }

    if (renamingType === 'file') {
      // Auto-append original extension
      const dot = item.name.lastIndexOf('.');
      const ext = dot > 0 ? item.name.slice(dot) : '';
      const fullName = trimmed + ext;
      if (fullName === item.name) { cancelRename(); return; }
      // Check for duplicate file names
      const duplicate = items.some(
        (i) => i.type === 'file' && i.id !== renamingId && (i.name || '').toLowerCase() === fullName.toLowerCase()
      );
      if (duplicate) {
        dispatch(addToast({ message: 'Name already exists', type: 'error' }));
        return; // Stay in edit mode
      }
      dispatch(renameFile({ fileId: renamingId, newName: fullName }))
        .unwrap()
        .then(() => {
          dispatch(addToast({ message: `Renamed to "${fullName}"`, type: 'success' }));
          cancelRename();
        })
        .catch((err) => {
          dispatch(addToast({ message: err || 'Failed to rename file', type: 'error' }));
          // Stay in edit mode on error
        });
    } else {
      if (trimmed === item.name) { cancelRename(); return; }
      // Check for duplicate folder names
      const duplicate = items.some(
        (i) => i.type === 'folder' && i.id !== renamingId && (i.name || '').toLowerCase() === trimmed.toLowerCase()
      );
      if (duplicate) {
        dispatch(addToast({ message: 'Name already exists', type: 'error' }));
        return; // Stay in edit mode
      }
      dispatch(renameFolder({ folderId: renamingId, newName: trimmed }))
        .unwrap()
        .then(() => {
          dispatch(addToast({ message: `Renamed to "${trimmed}"`, type: 'success' }));
          cancelRename();
        })
        .catch((err) => {
          dispatch(addToast({ message: err || 'Failed to rename folder', type: 'error' }));
          // Stay in edit mode on error
        });
    }
  }

  function cancelRename() {
    setRenamingId(null);
    setRenamingType(null);
    setRenameValue('');
    setRenameOriginalName('');
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
    if (renameSavingRef.current) return; // Enter already handled it
    cancelRename();
  }

  // ── Drag-and-drop ──

  function handleExplorerDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }

  function handleExplorerDragLeave(e) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  }

  async function handleExplorerDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const paths = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].path) paths.push(files[i].path);
    }
    if (paths.length > 0 && onOpenUpload) {
      onOpenUpload('drop', paths);
    }
  }

  // ── Confirmations ──

  function confirmRemove() {
    if (!removeConfirm) return;
    dispatch(removeFromOrvyn(removeConfirm.id))
      .unwrap()
      .then(() => {
        dispatch(addToast({ message: `'${removeConfirm.name}' removed from Orvyn`, type: 'success' }));
      })
      .catch((err) => {
        dispatch(addToast({ message: err || 'Failed to remove file', type: 'error' }));
      });
    setRemoveConfirm(null);
  }

  function confirmDeleteFromSystem() {
    if (!deleteConfirm) return;
    if (deleteConfirmName !== deleteConfirm.name) return;
    const name = deleteConfirm.name;
    dispatch(deleteFromSystem(deleteConfirm.id))
      .unwrap()
      .then(() => {
        dispatch(addToast({ message: `'${name}' permanently deleted`, type: 'success' }));
      })
      .catch((err) => {
        dispatch(addToast({ message: err || 'Failed to delete file', type: 'error' }));
      });
    setDeleteConfirm(null);
    setDeleteConfirmName('');
  }

  function openDeleteFolderDialog(folder) {
    setDeleteFolderConfirm(folder);
    setDeleteFolderPreview(null);
    setDeleteFolderStep(1);
    // Fetch preview counts
    dispatch(fetchFolderDeletePreview(folder.id))
      .unwrap()
      .then((data) => {
        setDeleteFolderPreview({ subfolder_count: data.subfolder_count, file_count: data.file_count });
      })
      .catch(() => {
        setDeleteFolderPreview({ subfolder_count: 0, file_count: 0 });
      });
  }

  function closeFolderDeleteDialog() {
    setDeleteFolderConfirm(null);
    setDeleteFolderPreview(null);
    setDeleteFolderStep(1);
  }

  function confirmDeleteFolder(fileAction) {
    if (!deleteFolderConfirm) return;
    const name = deleteFolderConfirm.name;
    dispatch(deleteFolder({ folderId: deleteFolderConfirm.id, fileAction }))
      .unwrap()
      .then((result) => {
        let msg = `Deleted folder "${name}"`;
        if (result.files_deleted) msg += ` and ${result.files_deleted} file(s) from system`;
        if (result.files_removed) msg += ` and ${result.files_removed} file record(s)`;
        if (result.disk_errors?.length) msg += ` (${result.disk_errors.length} file(s) could not be removed from disk)`;
        dispatch(addToast({ message: msg, type: 'success' }));
      })
      .catch((err) => {
        dispatch(addToast({ message: err || 'Failed to delete folder', type: 'error' }));
      });
    closeFolderDeleteDialog();
  }

  // ── Subfolder ──

  function submitSubfolder() {
    const trimmed = subfolderName.trim();
    if (!trimmed || !subfolderDialog) return;
    dispatch(createFolder({
      dataroomId: currentDataroomId,
      parentFolderId: subfolderDialog.id,
      name: trimmed,
      context: subfolderContext.trim() || null,
    }))
      .unwrap()
      .then(() => {
        dispatch(addToast({ message: `Created subfolder "${trimmed}"`, type: 'success' }));
      })
      .catch((err) => {
        dispatch(addToast({ message: err || 'Failed to create folder', type: 'error' }));
      });
    setSubfolderDialog(null);
  }

  // ── Edit description ──

  function submitEditDesc() {
    if (!editDescDialog) return;
    dispatch(updateFolderContext({ folderId: editDescDialog.id, context: editDescValue.trim() }));
    dispatch(addToast({ message: 'Description updated', type: 'success' }));
    setEditDescDialog(null);
  }

  // ── Sort column click (list view) ──

  function handleSortColumn(col) {
    if (sortBy === col) {
      dispatch(setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      dispatch(setSortBy(col));
      dispatch(setSortOrder('asc'));
    }
  }

  // ── Item icon ──

  function renderItemIcon(item, size) {
    const isGrid = size === 'grid';
    const cls = isGrid ? styles.gridCardIcon : styles.listIcon;

    if (item.type === 'folder') {
      return <div className={`${cls} ${styles.iconBgFolder}`}><IconFolder /></div>;
    }

    const ext = getExtension(item.name);
    const info = getFileTypeInfo(ext);
    return <div className={`${cls} ${styles[info.iconClass]}`}><IconFile /></div>;
  }

  // ── Render: navigation bar ──

  function renderNavBar() {
    return (
      <div className={styles.navBar}>
        <button className={styles.navBtn} onClick={goBack} disabled={historyIndex <= 0 || isDataroomListMode} title="Back" type="button"><IconBack /></button>
        <button className={styles.navBtn} onClick={goForward} disabled={historyIndex >= history.length - 1 || isDataroomListMode} title="Forward" type="button"><IconForward /></button>
        <button className={styles.navBtn} onClick={goHome} disabled={isDataroomListMode} title="Home" type="button"><IconHome /></button>
        <button className={styles.navBtn} onClick={() => { dispatch(refreshCurrentView()); dispatch(fetchDatarooms()); }} title="Refresh" type="button"><IconRefresh /></button>

        <div className={styles.navSep} />

        <div className={styles.breadcrumbs}>
          {isDataroomListMode ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span className={`${styles.crumb} ${styles.crumbActive}`}>DataRooms</span>
            </span>
          ) : (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  className={styles.crumb}
                  onClick={goHome}
                  type="button"
                  title="DataRooms"
                >
                  DataRooms
                </button>
              </span>
              {currentPath.map((seg, i) => (
                <span key={seg.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <span className={styles.crumbSep}>/</span>
                  <button
                    className={`${styles.crumb} ${i === currentPath.length - 1 ? styles.crumbActive : ''}`}
                    onClick={() => handleBreadcrumb(i)}
                    type="button"
                    title={seg.name}
                  >
                    {seg.name}
                  </button>
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Render: toolbar ──

  function renderToolbar() {
    return (
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {isDataroomListMode ? (
            <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={() => onCreateDataroom && onCreateDataroom()} type="button">
              <IconPlus /> New DataRoom
            </button>
          ) : (
            <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={openNewFolderDialog} type="button">
              <IconFolderPlus /> New Folder
            </button>
          )}
        </div>

        <div className={styles.toolbarRight}>
          <input
            className={styles.toolSearch}
            type="text"
            placeholder={isDataroomListMode ? 'Search data rooms...' : 'Search...'}
            value={searchQuery}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
          />

          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewToggleBtn} ${viewMode === 'grid' ? styles.viewToggleBtnActive : ''}`}
              onClick={() => dispatch(setViewMode('grid'))}
              title="Grid view"
              type="button"
            ><IconGrid /></button>
            <button
              className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.viewToggleBtnActive : ''}`}
              onClick={() => dispatch(setViewMode('list'))}
              title="List view"
              type="button"
            ><IconList /></button>
          </div>

          <div className={styles.toolbarSep} />

          <button
            className={`${styles.copilotToggle} ${copilotOpen ? styles.copilotToggleActive : ''}`}
            onClick={() => dispatch(toggleCopilot())}
            title={copilotOpen ? 'Close Copilot' : 'Open Copilot'}
            type="button"
          >
            <IconCopilot />
          </button>
        </div>
      </div>
    );
  }


  // ── Render: new folder modal ──
  // (rendered in the main return below)

  // ── Render inline rename ──

  function renderInlineRename(item) {
    if (renamingId !== item.id) return null;
    return (
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
    );
  }

  // ── Render: grid view ──

  function renderGridView() {
    return (
      <div className={styles.grid}>
        {filtered.map((item) => {
          const isSelected = selectedItems.some((s) => s.id === item.id);
          const confColor = item.type === 'file' ? confidenceColor(item.classification_score) : null;
          const isMarked = item.type === 'file' && pendingMoves.some((m) => m.id === item.id);

          return (
            <div
              key={item.id}
              className={`${styles.gridCard} ${isSelected ? styles.gridCardSelected : ''}`}
              onClick={(e) => handleItemClick(e, item)}
              onDoubleClick={(e) => handleItemDoubleClick(e, item)}
              onContextMenu={(e) => handleContextMenu(e, item)}
            >
              {isMarked && <span className={styles.scissorsIndicator} title="Marked for move">&#9986;</span>}
              {confColor && !isMarked && (
                <span
                  className={styles.confidenceDot}
                  style={{ backgroundColor: confColor }}
                  title={`Confidence: ${Math.round((item.classification_score || 0) * 100)}%`}
                />
              )}
              <div className={isMarked ? styles.markedIcon : undefined}>
                {renderItemIcon(item, 'grid')}
              </div>
              {renamingId === item.id ? renderInlineRename(item) : (
                <span className={styles.gridCardName} title={item.name}>
                  {item.name.length > 15 ? item.name.slice(0, 15) + '...' : item.name}
                </span>
              )}
              {item.type === 'file' && contentChangedIds.includes(item.id) && (
                <span className={styles.staleBadge}>Content changed</span>
              )}
              {item.type === 'file' && (
                <span className={styles.gridCardMeta}>{formatFileSize(item.size_bytes)}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Render: list view ──

  function renderListView() {
    return (
      <table className={styles.listTable}>
        <thead className={styles.listHeader}>
          <tr>
            <th onClick={() => handleSortColumn('name')}>
              Name
              {sortBy === 'name' && <span className={styles.sortIndicator}>{sortOrder === 'asc' ? '▲' : '▼'}</span>}
            </th>
            <th onClick={() => handleSortColumn('size')} style={{ width: 100 }}>
              Size
              {sortBy === 'size' && <span className={styles.sortIndicator}>{sortOrder === 'asc' ? '▲' : '▼'}</span>}
            </th>
            <th onClick={() => handleSortColumn('date')} style={{ width: 130 }}>
              Modified
              {sortBy === 'date' && <span className={styles.sortIndicator}>{sortOrder === 'asc' ? '▲' : '▼'}</span>}
            </th>
            <th style={{ width: 80 }}>Type</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => {
            const isSelected = selectedItems.some((s) => s.id === item.id);
            const ext = item.type === 'file' ? getExtension(item.name) : '';
            const typeInfo = item.type === 'file' ? getFileTypeInfo(ext) : null;
            const confColor = item.type === 'file' ? confidenceColor(item.classification_score) : null;
            const isMarked = item.type === 'file' && pendingMoves.some((m) => m.id === item.id);

            return (
              <tr
                key={item.id}
                className={`${styles.listRow} ${isSelected ? styles.listRowSelected : ''}`}
                onClick={(e) => handleItemClick(e, item)}
                onDoubleClick={(e) => handleItemDoubleClick(e, item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                <td>
                  <div className={styles.listNameCell}>
                    <div className={isMarked ? styles.markedIcon : undefined}>
                      {renderItemIcon(item, 'list')}
                    </div>
                    {renamingId === item.id ? (
                      <input
                        ref={renameRef}
                        className={styles.renameInput}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        style={{ textAlign: 'left' }}
                      />
                    ) : (
                      <span className={styles.listFileName} title={item.name}>{item.name}</span>
                    )}
                    {isMarked && <span className={styles.listMarkedIndicator} title="Marked for move">&#9986;</span>}
                    {confColor && !isMarked && (
                      <span
                        className={styles.confidenceDot}
                        style={{ backgroundColor: confColor, position: 'static', marginLeft: 6 }}
                        title={`Confidence: ${Math.round((item.classification_score || 0) * 100)}%`}
                      />
                    )}
                    {item.type === 'file' && contentChangedIds.includes(item.id) && (
                      <>
                        <span className={styles.staleBadge}>Content changed</span>
                        <button
                          className={styles.reindexBtn}
                          title="Re-index this file"
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch(indexFiles({ fileId: item.id, dataroomId: currentDataroomId }));
                            dispatch(clearFileContentChanged(item.id));
                          }}
                          type="button"
                        >
                          Re-index
                        </button>
                      </>
                    )}
                  </div>
                </td>
                <td className={styles.listMuted}>{item.type === 'file' ? formatFileSize(item.size_bytes) : '—'}</td>
                <td className={styles.listMuted}>{formatDate(item.updated_at || item.created_at)}</td>
                <td className={styles.listMuted}>{item.type === 'folder' ? 'Folder' : typeInfo?.label || 'File'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // ── Render: empty state ──

  function renderEmptyState() {
    if (searchQuery) {
      return (
        <div className={styles.emptyState}>
          <IconEmptyFolder />
          <span className={styles.emptyTitle}>No results found</span>
          <span className={styles.emptyHint}>
            No files or folders match &quot;{searchQuery}&quot;
          </span>
          <div className={styles.emptyAction}>
            <button className={styles.toolBtn} onClick={() => dispatch(setSearchQuery(''))} type="button">
              Clear Search
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.emptyStateCentered}>
        <IconEmptyFolder />
        <span className={styles.emptyTitle}>This folder is empty</span>
        <span className={styles.emptyHint}>
          Create a new folder to get started.
        </span>
        <div className={styles.emptyAction}>
          <button className={styles.toolBtn} onClick={openNewFolderDialog} type="button">
            <IconFolderPlus /> New Folder
          </button>
        </div>
      </div>
    );
  }

  // ── Render: DataRoom grid (when at DataRoom list level) ──

  function renderDataroomGrid() {
    const filteredDR = searchQuery
      ? datarooms.filter((dr) => (dr.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
      : datarooms;

    const sortedDR = [...filteredDR].sort((a, b) => {
      if (b.is_starred !== a.is_starred) return (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0);
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

    if (sortedDR.length === 0 && searchQuery) {
      return (
        <div className={styles.emptyState}>
          <IconEmptyFolder />
          <span className={styles.emptyTitle}>No results found</span>
          <span className={styles.emptyHint}>No data rooms match &quot;{searchQuery}&quot;</span>
          <div className={styles.emptyAction}>
            <button className={styles.toolBtn} onClick={() => dispatch(setSearchQuery(''))} type="button">
              Clear Search
            </button>
          </div>
        </div>
      );
    }

    if (sortedDR.length === 0) {
      return (
        <div className={styles.emptyStateCentered}>
          <IconDataRoom />
          <span className={styles.emptyTitle}>No DataRooms yet</span>
          <span className={styles.emptyHint}>Create your first DataRoom to start organizing documents.</span>
          {/* <div className={styles.emptyAction}>
            <button className={styles.toolBtn} onClick={() => onCreateDataroom && onCreateDataroom()} type="button">
              <IconPlus /> New DataRoom
            </button>
          </div> */}
        </div>
      );
    }

    if (viewMode === 'grid') {
      return (
        <div className={styles.grid}>
          {sortedDR.map((dr) => (
            <div
              key={dr.id}
              className={styles.gridCard}
              onDoubleClick={() => onSelectDataroom && onSelectDataroom(dr.id)}
            >
              <div className={`${styles.gridCardIcon} ${styles.iconBgDataroom}`}>
                <IconDataRoom />
              </div>
              <div className={styles.gridCardName} title={dr.name}>
                {dr.name.length > 15 ? dr.name.slice(0, 15) + '...' : dr.name}
              </div>
              <div className={styles.gridCardMeta}>
                {`${dr.folder_count ?? 0} folders`} &middot; {`${dr.file_count ?? 0} files`}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // List view
    return (
      <table className={styles.listTable}>
        <thead className={styles.listHeader}>
          <tr>
            <th>Name</th>
            <th style={{ width: 80 }}>Folders</th>
            <th style={{ width: 80 }}>Files</th>
            <th style={{ width: 130 }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {sortedDR.map((dr) => (
            <tr
              key={dr.id}
              className={styles.listRow}
              onDoubleClick={() => onSelectDataroom && onSelectDataroom(dr.id)}
            >
              <td>
                <div className={styles.listNameCell}>
                  <div className={`${styles.listIcon} ${styles.iconBgDataroom}`}>
                    <IconDataRoom />
                  </div>
                  <span className={styles.listFileName} title={dr.name}>{dr.name}</span>
                </div>
              </td>
              <td className={styles.listMuted}>{dr.folder_count ?? 0}</td>
              <td className={styles.listMuted}>{dr.file_count ?? 0}</td>
              <td className={styles.listMuted}>{formatDate(dr.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // ── Main render ──

  return (
    <div
      ref={explorerRef}
      className={styles.explorer}
      tabIndex={-1}
      onDragOver={!isDataroomListMode ? handleExplorerDragOver : undefined}
      onDragLeave={!isDataroomListMode ? handleExplorerDragLeave : undefined}
      onDrop={!isDataroomListMode ? handleExplorerDrop : undefined}
    >
      {renderNavBar()}
      {renderToolbar()}

      <div className={styles.explorerContentRow}>
        <div className={styles.explorerMain}>
          {isDataroomListMode ? (
            <div className={styles.content}>
              {renderDataroomGrid()}
            </div>
          ) : isLoading ? (
            <div className={styles.loadingOverlay}>
              <div className={styles.spinner} />
            </div>
          ) : filtered.length === 0 ? (
            renderEmptyState()
          ) : (
            <div
              className={styles.content}
              onClick={handleBackgroundClick}
              onContextMenu={handleBackgroundContextMenu}
            >
              {viewMode === 'grid' ? renderGridView() : renderListView()}
            </div>
          )}
        </div>

        <CopilotPanel />
      </div>

      {error && (
        <div style={{
          padding: '8px 16px',
          fontSize: '0.8125rem',
          color: 'var(--danger-color)',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div className={styles.dropOverlay}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 16 12 12 8 16" />
            <line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
          </svg>
          <span>Drop files here to upload &amp; classify</span>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={
            ctxMenu.item === null
              ? buildBackgroundContextMenuItems()
              : ctxMenu.item.type === 'file'
                ? buildFileContextMenuItems(ctxMenu.item)
                : buildFolderContextMenuItems(ctxMenu.item)
          }
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Move marked files modal */}
      {moveModal && (
        <MoveMarkedFilesModal
          targetFolderId={moveModal.folderId}
          targetFolderName={moveModal.folderName}
          targetDataroomId={moveModal.dataroomId}
          onClose={() => setMoveModal(null)}
        />
      )}

      {/* Remove from Orvyn confirmation */}
      {removeConfirm && (
        <div className={styles.confirmBackdrop} onClick={() => setRemoveConfirm(null)} onKeyDown={(e) => { if (e.key === 'Escape') setRemoveConfirm(null); if (e.key === 'Enter') confirmRemove(); }}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Remove from Orvyn</h3>
            <p className={styles.confirmText}>
              Remove &quot;{removeConfirm.name}&quot; from Orvyn? The file will remain on your computer.
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmBtnSecondary} onClick={() => setRemoveConfirm(null)} type="button">Cancel</button>
              <button className={styles.confirmBtnDanger} onClick={confirmRemove} type="button" autoFocus>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete from System — double confirmation */}
      {deleteConfirm && (
        <div className={styles.confirmBackdrop} onClick={() => { setDeleteConfirm(null); setDeleteConfirmName(''); }} onKeyDown={(e) => { if (e.key === 'Escape') { setDeleteConfirm(null); setDeleteConfirmName(''); } }}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Delete from System</h3>
            <p className={styles.confirmText}>
              This will permanently delete &quot;{deleteConfirm.name}&quot; from your computer. This cannot be undone.
            </p>
            <p className={styles.confirmText} style={{ marginTop: 12 }}>
              Type the filename to confirm:
            </p>
            <input
              className={styles.confirmInput}
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={deleteConfirm.name}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && deleteConfirmName === deleteConfirm.name) confirmDeleteFromSystem(); }}
            />
            <div className={styles.confirmActions}>
              <button className={styles.confirmBtnSecondary} onClick={() => { setDeleteConfirm(null); setDeleteConfirmName(''); }} type="button">Cancel</button>
              <button
                className={styles.confirmBtnDanger}
                onClick={confirmDeleteFromSystem}
                disabled={deleteConfirmName !== deleteConfirm.name}
                type="button"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete folder confirmation — step 1: choose file action */}
      {deleteFolderConfirm && deleteFolderStep === 1 && (
        <div className={styles.confirmBackdrop} onClick={closeFolderDeleteDialog} onKeyDown={(e) => { if (e.key === 'Escape') closeFolderDeleteDialog(); }}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Delete Folder</h3>
            <p className={styles.confirmText}>
              Delete &quot;{deleteFolderConfirm.name}&quot;?
            </p>
            {deleteFolderPreview ? (
              <p className={styles.confirmText} style={{ marginTop: 8 }}>
                This folder contains: <strong>{deleteFolderPreview.subfolder_count}</strong> subfolder{deleteFolderPreview.subfolder_count !== 1 ? 's' : ''}, <strong>{deleteFolderPreview.file_count}</strong> file{deleteFolderPreview.file_count !== 1 ? 's' : ''}.
                {deleteFolderPreview.file_count > 0
                  ? ' What should happen to the files?'
                  : ''}
              </p>
            ) : (
              <p className={styles.confirmText} style={{ marginTop: 8, opacity: 0.6 }}>Loading folder contents...</p>
            )}
            <div className={styles.confirmActions}>
              <button className={styles.confirmBtnSecondary} onClick={closeFolderDeleteDialog} type="button">Cancel</button>
              {deleteFolderPreview && deleteFolderPreview.file_count > 0 && (
                <button
                  className={styles.confirmBtnDanger}
                  onClick={() => confirmDeleteFolder('remove')}
                  type="button"
                >
                  Remove from Orvyn
                </button>
              )}
              {deleteFolderPreview && deleteFolderPreview.file_count > 0 && (
                <button
                  className={styles.confirmBtnDanger}
                  onClick={() => setDeleteFolderStep(2)}
                  type="button"
                >
                  Delete from System
                </button>
              )}
              {deleteFolderPreview && deleteFolderPreview.file_count === 0 && (
                <button
                  className={styles.confirmBtnDanger}
                  onClick={() => confirmDeleteFolder('remove')}
                  type="button"
                  autoFocus
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete folder confirmation — step 2: confirm system delete */}
      {deleteFolderConfirm && deleteFolderStep === 2 && (
        <div className={styles.confirmBackdrop} onClick={closeFolderDeleteDialog} onKeyDown={(e) => { if (e.key === 'Escape') closeFolderDeleteDialog(); }}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Permanently Delete Files</h3>
            <p className={styles.confirmText}>
              This will permanently delete <strong>{deleteFolderPreview?.file_count || 0}</strong> file{(deleteFolderPreview?.file_count || 0) !== 1 ? 's' : ''} from your computer. This cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmBtnSecondary} onClick={closeFolderDeleteDialog} type="button">Cancel</button>
              <button className={styles.confirmBtnDanger} onClick={() => confirmDeleteFolder('delete_system')} type="button" autoFocus>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}

      {/* New subfolder dialog */}
      {subfolderDialog && (
        <div className={styles.confirmBackdrop} onClick={() => setSubfolderDialog(null)}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>New Subfolder in &quot;{subfolderDialog.name}&quot;</h3>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Name</label>
              <input
                ref={subfolderRef}
                className={styles.confirmInput}
                type="text"
                value={subfolderName}
                onChange={(e) => setSubfolderName(e.target.value)}
                placeholder="Folder name..."
                onKeyDown={(e) => { if (e.key === 'Enter') submitSubfolder(); if (e.key === 'Escape') setSubfolderDialog(null); }}
              />
            </div>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
              <textarea
                className={styles.confirmTextarea}
                value={subfolderContext}
                onChange={(e) => setSubfolderContext(e.target.value)}
                placeholder="What kind of files go here..."
                rows={2}
              />
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.confirmBtnSecondary} onClick={() => setSubfolderDialog(null)} type="button">Cancel</button>
              <button className={styles.confirmBtnPrimary} onClick={submitSubfolder} disabled={!subfolderName.trim()} type="button">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit description dialog */}
      {editDescDialog && (
        <div className={styles.confirmBackdrop} onClick={() => setEditDescDialog(null)}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Edit Description — &quot;{editDescDialog.name}&quot;</h3>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Description</label>
              <textarea
                ref={editDescRef}
                className={styles.confirmTextarea}
                value={editDescValue}
                onChange={(e) => setEditDescValue(e.target.value)}
                placeholder="Describe what kind of files belong in this folder..."
                rows={3}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) submitEditDesc(); if (e.key === 'Escape') setEditDescDialog(null); }}
              />
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.confirmBtnSecondary} onClick={() => setEditDescDialog(null)} type="button">Cancel</button>
              <button className={styles.confirmBtnPrimary} onClick={submitEditDesc} type="button">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* New folder modal */}
      {newFolderDialog && (
        <div className={styles.confirmBackdrop} onClick={() => setNewFolderDialog(false)}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>New Folder</h3>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Name</label>
              <input
                ref={newFolderRef}
                className={styles.confirmInput}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                maxLength={40}
                onKeyDown={(e) => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') setNewFolderDialog(false); }}
              />
            </div>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
              <textarea
                className={styles.confirmTextarea}
                value={newFolderContext}
                onChange={(e) => setNewFolderContext(e.target.value)}
                placeholder="What kind of files go here..."
                rows={2}
              />
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.confirmBtnSecondary} onClick={() => setNewFolderDialog(false)} type="button">Cancel</button>
              <button className={styles.confirmBtnPrimary} onClick={submitNewFolder} disabled={!newFolderName.trim()} type="button">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileExplorer;
