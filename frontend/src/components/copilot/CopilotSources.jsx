import { useDispatch } from 'react-redux';
import { navigateToFile } from '../../store/fileExplorerSlice';
import { setActivePage } from '../../store/uiSlice';
import styles from './CopilotPanel.module.css';

function CopilotSources({ sources: rawSources }) {
  const sources = typeof rawSources === 'string' ? JSON.parse(rawSources) : rawSources;
  if (!sources || !Array.isArray(sources) || sources.length === 0) return null;

  const dispatch = useDispatch();

  const handleClick = (source) => {
    if (source.file_id && source.dataroom_id) {
      dispatch(setActivePage('dataroom'));
      dispatch(navigateToFile({
        dataroomId: source.dataroom_id,
        folderId: source.folder_id,
        fileId: source.file_id,
      }));
    }
  };

  const handleDoubleClick = async (source) => {
    if (source.file_id && window.api?.file?.getDetails) {
      try {
        const details = await window.api.file.getDetails(source.file_id);
        if (details?.original_path && window.api?.file?.open) {
          window.api.file.open(details.original_path);
        }
      } catch { /* ignore */ }
    }
  };

  return (
    <div className={styles.sources}>
      <span className={styles.sourcesLabel}>Sources</span>
      {sources.map((source, idx) => {
        const num = source.source_number || (idx + 1);

        // Cross-DR display: show "📁 [DataRoom] > filename" when dataroom_name is present
        const displayName = source.dataroom_name
          ? `📁 ${source.dataroom_name} > ${source.file_name || 'Document'}`
          : (source.file_name || 'Document');

        return (
          <button
            key={`${source.file_name || source.file_id}-${idx}`}
            id={`copilot-source-${num}`}
            className={styles.sourceItem}
            onClick={() => handleClick(source)}
            onDoubleClick={() => handleDoubleClick(source)}
            title={displayName}
          >
            <span className={styles.sourceIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <span>
              [{num}] {displayName}
              {source.page_number && ` (Page ${source.page_number})`}
              {source.section_number && ` (${source.section_number})`}
              {source.section_name && ` (${source.section_name})`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default CopilotSources;
