import { useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CopilotSources from './CopilotSources';
import styles from './CopilotPanel.module.css';

/* ── Icons ───────────────────────────────────────────────── */

const IconCopy = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ── Constants ───────────────────────────────────────────── */

const TRUNCATE_THRESHOLD = 3000;
const TRUNCATE_SHOW = 2000;

/* ── CopilotMessage ──────────────────────────────────────── */

function CopilotMessage({ message }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may not be available
    }
  }, [message.content]);

  const isUser = message.role === 'user';
  const content = message.content || '';

  // Truncate long assistant responses
  const isLong = !isUser && content.length > TRUNCATE_THRESHOLD;
  const displayContent = isLong && !expanded
    ? content.slice(0, TRUNCATE_SHOW) + '…'
    : content;

  // Filter sources to only those actually cited in the response text
  const filteredSources = useMemo(() => {
    if (isUser || !message.sources || message.sources.length === 0) return [];
    const refs = new Set();
    let m;
    const re = /\[(\d+)\]/g;
    while ((m = re.exec(content)) !== null) refs.add(parseInt(m[1], 10));
    if (refs.size === 0) return message.sources; // fallback: show all if no citations
    return message.sources.filter((s, i) => refs.has(s.source_number || (i + 1)));
  }, [isUser, content, message.sources]);

  // Custom paragraph renderer that parses [N] citation markers
  const CitationText = useCallback(({ children, node, ...props }) => {
    if (typeof children !== 'string') return <p {...props}>{children}</p>;
    const parts = children.split(/(\[\d+\])/g);
    if (parts.length === 1) return <p {...props}>{children}</p>;
    return (
      <p {...props}>
        {parts.map((part, i) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match) {
            const num = match[1];
            return (
              <sup
                key={i}
                className={styles.citationMarker}
                onClick={() => {
                  const el = document.getElementById(`copilot-source-${num}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add(styles.sourceHighlighted);
                    setTimeout(() => el.classList.remove(styles.sourceHighlighted), 1500);
                  }
                }}
                role="button"
                tabIndex={0}
                title={`Go to source ${num}`}
              >{num}</sup>
            );
          }
          return part;
        })}
      </p>
    );
  }, []);

  const markdownComponents = { p: CitationText };

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAssistant}`}>
      <div className={`${styles.messageBubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
        {isUser ? (
          content
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {displayContent}
          </ReactMarkdown>
        )}

        {/* Show more / Show less toggle for long responses */}
        {isLong && (
          <button
            className={styles.showMoreBtn}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}

        {/* Copy button — shows on hover */}
        <button
          className={styles.copyBtn}
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy message'}
          aria-label="Copy message"
        >
          {copied ? <IconCheck /> : <IconCopy />}
        </button>
      </div>

      {/* Source citations for assistant messages — filtered to only referenced sources */}
      {filteredSources.length > 0 && (
        <CopilotSources sources={filteredSources} />
      )}
    </div>
  );
}

export default CopilotMessage;
