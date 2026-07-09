import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { indexFiles, retryIndexing } from '../../store/copilotSlice';
import { useRequireOnline } from '../../hooks/useRequireOnline';
import CopilotMessage from './CopilotMessage';
import CopilotReasoningSteps from './CopilotReasoningSteps';
import styles from './CopilotPanel.module.css';

/* ── Sparkle icon for empty state ────────────────────────── */

const IconSparkle = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
  </svg>
);

/* ── CopilotChat ─────────────────────────────────────────── */

function CopilotChat() {
  const dispatch = useDispatch();
  const { requireOnline } = useRequireOnline();
  const messages = useSelector((s) => s.copilot.messages);
  const isStreaming = useSelector((s) => s.copilot.isStreaming);
  const isLoading = useSelector((s) => s.copilot.isLoading);
  const streamingMessage = useSelector((s) => s.copilot.streamingMessage);
  const scopeIds = useSelector((s) => s.copilot.scopeIds);
  const scopeType = useSelector((s) => s.copilot.scopeType);
  const indexStatus = useSelector((s) => s.copilot.indexStatus);
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const isEmpty = messages.length === 0 && !isStreaming;

  // Index-based empty states
  const totalFiles = indexStatus?.total ?? 0;
  const completeFiles = indexStatus?.complete ?? 0;
  const pendingFiles = indexStatus?.pending ?? 0;
  const processingFiles = indexStatus?.processing ?? 0;
  const failedFiles = indexStatus?.failed ?? 0;
  const activelyIndexing = pendingFiles + processingFiles;
  const hasNoFiles = totalFiles === 0 && isEmpty;
  const isNotFullyIndexed = scopeType !== 'global' && totalFiles > 0 && activelyIndexing > 0 && isEmpty;

  return (
    <div className={styles.chatArea}>
      {isEmpty ? (
        /* ── Empty state ────────────────────────────────── */
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <IconSparkle />
          </div>
          <h2 className={styles.emptyTitle}>Orvyn Copilot</h2>

          {hasNoFiles ? (
            <p className={styles.emptySubtitle}>
              Add files to your DataRoom to get started with Copilot.
            </p>
          ) : isNotFullyIndexed ? (
            <>
              <p className={styles.emptySubtitle}>
                {completeFiles}/{totalFiles} files indexed.
                {processingFiles > 0 ? ` ${processingFiles} processing.` : ''}
                {pendingFiles > 0 ? ` ${pendingFiles} pending.` : ''}
                {failedFiles > 0 ? ` ${failedFiles} failed.` : ''}
                {' '}Copilot will be ready once all files are indexed.
              </p>
              <div className={styles.indexBarWrapper}>
                <div className={styles.indexBar}>
                  <div
                    className={styles.indexBarFill}
                    style={{ width: `${totalFiles > 0 ? Math.round((completeFiles / totalFiles) * 100) : 0}%` }}
                  />
                </div>
              </div>
              {(failedFiles > 0 || pendingFiles > 0) && (
                <button
                  className={styles.indexActionBtn}
                  onClick={() => failedFiles > 0
                    ? dispatch(retryIndexing(scopeIds?.[0]))
                    : dispatch(indexFiles({ dataroomId: scopeIds?.[0] }))
                  }
                >
                  {failedFiles > 0 ? 'Retry Failed' : 'Index Now'}
                </button>
              )}
            </>
          ) : (
            <p className={styles.emptySubtitle}>
              Ask anything about your documents.
            </p>
          )}
        </div>
      ) : (
        /* ── Messages list ──────────────────────────────── */
        <>
          {messages.map((msg, idx) => (
            <CopilotMessage key={idx} message={msg} />
          ))}

          {/* Reasoning steps — shown while loading before stream starts */}
          {isLoading && !streamingMessage && <CopilotReasoningSteps />}

          {/* Streaming message */}
          {isStreaming && streamingMessage && (
            <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
              <div className={`${styles.messageBubble} ${styles.assistantBubble}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingMessage}
                </ReactMarkdown>
                <span className={styles.streamCursor} />
              </div>
            </div>
          )}
        </>
      )}

      <div ref={chatEndRef} />
    </div>
  );
}

export default CopilotChat;
