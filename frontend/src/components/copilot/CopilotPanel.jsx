import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  toggleCopilot,
  closeCopilot,
  openCopilot,
  sendMessage,
  startStreaming,
  appendStreamChunk,
  finalizeStreamMessage,
  updateIndexProgress,
  updateSessionTitle,
  setCopilotScope,
  setSelectedFiles,
  getIndexStatus,
  setPanelWidth,
} from '../../store/copilotSlice';
import { addToast } from '../../store/uiSlice';
import CopilotHeader from './CopilotHeader';
import CopilotChat from './CopilotChat';
import CopilotQuickActions from './CopilotQuickActions';
import CopilotInput from './CopilotInput';
import styles from './CopilotPanel.module.css';

/* ── CopilotPanel ────────────────────────────────────────── */

function CopilotPanel() {
  const dispatch = useDispatch();
  const isOpen = useSelector((s) => s.copilot.isOpen);
  const panelWidth = useSelector((s) => s.copilot.panelWidth);

  /* ── Resize (drag left edge) ────────────────────────── */

  const panelRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const [isResizing, setIsResizing] = useState(false);

  const theme = useSelector((s) => s.ui.theme);

  const getThemedCursor = useCallback(() => {
    const fill = theme === 'dark' ? '%23ffffff' : '%23111111';
    const stroke = theme === 'dark' ? '%23111111' : '%23ffffff';
    return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M8 2 L4 6 L7 6 L7 18 L4 18 L8 22 L12 18 L9 18 L9 6 L12 6 Z' fill='${fill}' stroke='${stroke}' stroke-width='1'/%3E%3Cpath d='M16 2 L20 6 L17 6 L17 18 L20 18 L16 22 L12 18 L15 18 L15 6 L12 6 Z' fill='${fill}' stroke='${stroke}' stroke-width='1'/%3E%3C/svg%3E") 12 12, col-resize`;
  }, [theme]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelRef.current?.offsetWidth || panelWidth;
    setIsResizing(true);
    document.body.style.cursor = getThemedCursor();
    document.body.style.userSelect = 'none';
  }, [panelWidth, getThemedCursor]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const vw = window.innerWidth;
      const minW = Math.max(280, Math.round(vw * 0.2));
      const maxW = Math.min(900, Math.round(vw * 0.45));
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(maxW, Math.max(minW, startWidth.current + delta));
      if (panelRef.current) {
        panelRef.current.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalWidth = panelRef.current?.offsetWidth || panelWidth;
      dispatch(setPanelWidth(finalWidth));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, dispatch, panelWidth]);

  // File explorer state for context auto-switch
  const currentDataroomId = useSelector((s) => s.fileExplorer.currentDataroomId);
  const currentFolderId = useSelector((s) => s.fileExplorer.currentFolderId);
  const currentPath = useSelector((s) => s.fileExplorer.currentPath);
  const selectedItems = useSelector((s) => s.fileExplorer.selectedItems);

  // DataRoom list — for deleted-DR detection AND multi-DR auto-detection
  const datarooms = useSelector((s) => s.dataroom.datarooms);

  /* ── IPC stream listeners ────────────────────────────── */

  useEffect(() => {
    if (!window.api?.copilot) return;

    const cleanups = [];

    // Stream chunk listener
    if (window.api.copilot.onStreamChunk) {
      cleanups.push(
        window.api.copilot.onStreamChunk((chunk) => {
          dispatch(appendStreamChunk(chunk));
        })
      );
    }

    // Stream end listener
    if (window.api.copilot.onStreamEnd) {
      cleanups.push(
        window.api.copilot.onStreamEnd((data) => {
          dispatch(finalizeStreamMessage({
            sources: data?.sources || [],
            session_id: data?.session_id,
            session_title: data?.session_title,
          }));
        })
      );
    }

    // Stream error listener
    if (window.api.copilot.onStreamError) {
      cleanups.push(
        window.api.copilot.onStreamError((data) => {
          dispatch(finalizeStreamMessage({ sources: [] }));
          dispatch(addToast({
            message: data?.message || 'AI service unavailable',
            type: 'error',
          }));
        })
      );
    }

    // Index progress listener
    if (window.api.copilot.onIndexProgress) {
      cleanups.push(
        window.api.copilot.onIndexProgress((progress) => {
          dispatch(updateIndexProgress(progress));
        })
      );
    }

    // Title update listener (fires after title generation completes)
    if (window.api.copilot.onTitleUpdate) {
      cleanups.push(
        window.api.copilot.onTitleUpdate((data) => {
          dispatch(updateSessionTitle(data));
        })
      );
    }

    return () => {
      cleanups.forEach((fn) => { if (typeof fn === 'function') fn(); });
    };
  }, [dispatch]);

  /* ── Keyboard shortcuts ──────────────────────────────── */

  useEffect(() => {
    const handler = (e) => {
      // Ctrl+J → toggle
      if (e.ctrlKey && e.key === 'j') {
        e.preventDefault();
        dispatch(toggleCopilot());
        return;
      }
      // Escape → close (only if open)
      if (e.key === 'Escape' && isOpen) {
        dispatch(closeCopilot());
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, isOpen]);

  /* ── Context auto-switch ─────────────────────────────── */

  useEffect(() => {
    // When no DataRoom is selected → global scope (multi-dataroom)
    if (!currentDataroomId) {
      dispatch(setSelectedFiles([]));
      dispatch(setCopilotScope({
        scopeType: 'global',
        scopeIds: [],
        scopeName: 'All DataRooms',
      }));
      // Fetch global index status (no dataroom_id = all DataRooms)
      dispatch(getIndexStatus());
      return;
    }

    const dataroomName = currentPath?.[0]?.name || '';

    if (selectedItems.length > 0) {
      // File(s) selected → scope to files
      const fileIds = selectedItems
        .filter((s) => s.type === 'file')
        .map((s) => s.id);
      if (fileIds.length > 0) {
        dispatch(setSelectedFiles(fileIds));
        dispatch(setCopilotScope({
          scopeType: fileIds.length === 1 ? 'file' : 'files',
          scopeIds: fileIds,
          scopeName: `${fileIds.length} file${fileIds.length > 1 ? 's' : ''} in ${dataroomName}`,
        }));
        return;
      }
    }

    // No files selected — check if inside a folder
    dispatch(setSelectedFiles([]));

    if (currentFolderId && currentPath.length > 1) {
      // Inside a folder → scope to folder
      const folderSegment = currentPath[currentPath.length - 1];
      const folderName = folderSegment?.name || 'Folder';
      dispatch(setCopilotScope({
        scopeType: 'folder',
        scopeIds: [currentFolderId],
        scopeName: `${folderName} (in ${dataroomName})`,
      }));
    } else {
      // At DataRoom root → scope to DataRoom
      dispatch(setCopilotScope({
        scopeType: 'dataroom',
        scopeIds: [currentDataroomId],
        scopeName: dataroomName,
      }));
    }
    dispatch(getIndexStatus(currentDataroomId));
  }, [currentDataroomId, currentFolderId, currentPath, selectedItems, dispatch]);

  /* ── Refresh index status during indexing (debounced) ── */

  const indexProgress = useSelector((s) => s.copilot.indexProgress);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!indexProgress || indexProgress.total === 0) return;

    if (indexProgress.completed === indexProgress.total) {
      // Completed — dispatch immediately
      clearTimeout(debounceRef.current);
      dispatch(getIndexStatus(currentDataroomId || undefined));
    } else {
      // Still in progress — debounce at 2s
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        dispatch(getIndexStatus(currentDataroomId || undefined));
      }, 2000);
    }

    return () => clearTimeout(debounceRef.current);
  }, [indexProgress, currentDataroomId, dispatch]);

  /* ── Auto-prompt on file upload ──────────────────────── */

  useEffect(() => {
    if (!window.api?.copilot?.onFilesAdded) return;
    const cleanup = window.api.copilot.onFilesAdded((data) => {
      const count = data?.count || 0;
      const drName = data?.dataroom_name || '';
      if (count > 0) {
        dispatch(openCopilot());
        // Add a system-style prompt as if the assistant said it
        dispatch(finalizeStreamMessage({
          sources: [],
          content: `${count} file${count > 1 ? 's' : ''} added to ${drName}. Would you like me to analyze them?`,
        }));
      }
    });
    return cleanup;
  }, [dispatch]);

  /* ── Multi-DataRoom auto-detection ──────────────────────── */

  const handleSendWithMultiDRDetection = useCallback((messageText) => {
    if (datarooms && datarooms.length >= 2) {
      const lowerText = messageText.toLowerCase();
      const matched = datarooms.filter(
        (dr) => dr.name && lowerText.includes(dr.name.toLowerCase())
      );
      if (matched.length >= 2) {
        dispatch(setCopilotScope({
          scopeType: 'multi_dataroom',
          scopeIds: matched.map((dr) => dr.id),
          scopeName: matched.map((dr) => dr.name).join(', '),
        }));
      }
    }
    dispatch(startStreaming());
    dispatch(sendMessage({ message: messageText }));
  }, [datarooms, dispatch]);

  /* ── Deleted DataRoom check ──────────────────────────── */

  const scopeIds = useSelector((s) => s.copilot.scopeIds);
  const scopeType = useSelector((s) => s.copilot.scopeType);
  const indexStatus = useSelector((s) => s.copilot.indexStatus);
  const dataroomDeleted =
    scopeType === 'dataroom' &&
    scopeIds?.length > 0 &&
    datarooms.length > 0 &&
    !datarooms.some((dr) => dr.id === scopeIds[0]);

  // Block Copilot only while files are actively being indexed (pending/processing).
  const activelyIndexing = (indexStatus?.pending ?? 0) + (indexStatus?.processing ?? 0);
  const notFullyIndexed = scopeType !== 'global' && activelyIndexing > 0;

  // Global scope — chat only, no quick actions
  const isGlobalScope = scopeType === 'global';

  // Copilot is unusable when there are no datarooms, or the current dataroom has no files
  const items = useSelector((s) => s.fileExplorer.items);
  const activeDataroom = useSelector((s) => s.dataroom.activeDataroom);
  const hasNoDatarooms = datarooms.length === 0;
  const dataroomFileCount = activeDataroom?.files?.length ?? activeDataroom?.file_count ?? 0;
  const hasFilesInItems = items.some((item) => item.type === 'file');
  const hasIndexedFiles = (indexStatus?.total ?? 0) > 0;
  const isDataroomEmpty = !!currentDataroomId && !hasFilesInItems && !hasIndexedFiles && dataroomFileCount === 0;
  const allDataroomsEmpty = !currentDataroomId && datarooms.length > 0 && datarooms.every((dr) => (dr.file_count ?? 0) === 0);
  const copilotUnavailable = hasNoDatarooms || isDataroomEmpty || allDataroomsEmpty;

  const globalChatDisabled = isGlobalScope && allDataroomsEmpty;

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div
      ref={panelRef}
      className={`${styles.panel} ${!isOpen ? styles.panelHidden : ''} ${isResizing ? styles.noTransition : ''}`}
      style={isOpen ? { width: panelWidth } : undefined}
    >
      {isOpen && (
        <div
          className={styles.resizeHandle}
          onMouseDown={handleResizeStart}
        />
      )}
      <CopilotHeader />

      <div className={styles.content}>
        {copilotUnavailable ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>Orvyn Copilot</h2>
            <p className={styles.emptySubtitle}>
              {hasNoDatarooms
                ? 'Create a DataRoom and add files to start using Copilot.'
                : 'Add files to your DataRoom to start using Copilot.'}
            </p>
          </div>
        ) : dataroomDeleted ? (
          <div className={styles.emptyState}>
            <p className={styles.emptySubtitle}>DataRoom no longer exists</p>
          </div>
        ) : (
          <CopilotChat />
        )}
      </div>

      {!copilotUnavailable && !notFullyIndexed && !isGlobalScope && <CopilotQuickActions />}
      <CopilotInput onSend={handleSendWithMultiDRDetection} disabled={copilotUnavailable || globalChatDisabled} />
    </div>
  );
}

export default CopilotPanel;
