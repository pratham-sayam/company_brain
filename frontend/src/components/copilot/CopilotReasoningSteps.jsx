import { useState, useEffect } from 'react';
import styles from './CopilotPanel.module.css';

const STEPS = [
  'Searching documents…',
  'Analyzing…',
  'Generating…',
];

function CopilotReasoningSteps() {
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    if (visibleCount >= STEPS.length) return;
    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  return (
    <div className={styles.reasoning}>
      {STEPS.slice(0, visibleCount).map((step, idx) => (
        <div
          key={idx}
          className={styles.reasoningStep}
          style={{ animationDelay: `${idx * 100}ms` }}
        >
          <span className={styles.reasoningDot} />
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

export default CopilotReasoningSteps;
