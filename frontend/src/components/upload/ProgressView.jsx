import { IconAlertCircle } from './icons';
import styles from './ProgressView.module.css';

function ProgressView({ progressStep, mode, validCount, error, onRetry }) {
    const steps = [
        { key: 'registering', label: 'Registering' },
        { key: 'classifying', label: mode === 'ai' ? 'Organizing' : 'Classifying' },
        { key: 'complete', label: 'Complete' },
    ];

    const currentIndex = steps.findIndex((s) => s.key === progressStep);

    return (
        <div className={styles.wrap}>
            {/* Step indicator */}
            <div className={styles.stepIndicator}>
                {steps.map((s, i) => (
                    <span key={s.key} style={{ display: 'contents' }}>
                        <div className={styles.stepNode}>
                            <div className={`${styles.stepDot} ${i < currentIndex ? styles.stepDotDone
                                    : i === currentIndex ? styles.stepDotActive : ''
                                }`}>
                                {i < currentIndex ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
                                    i + 1
                                )}
                            </div>
                            <span className={`${styles.stepLabel} ${i < currentIndex ? styles.stepLabelDone
                                    : i === currentIndex ? styles.stepLabelActive : ''
                                }`}>
                                {s.label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={`${styles.stepLine} ${i < currentIndex ? styles.stepLineDone : ''
                                }`} />
                        )}
                    </span>
                ))}
            </div>

            {/* Spinner or error */}
            {error ? (
                <div className={styles.errorBox}>
                    <div className={styles.errorIcon}><IconAlertCircle /></div>
                    <div className={styles.errorText}>{error}</div>
                    <button className={styles.retryBtn} onClick={onRetry} type="button">
                        Try Again
                    </button>
                </div>
            ) : (
                <div className={styles.progressInfo}>
                    <div className={styles.spinner} role="status" aria-label="Processing" />
                    <span className={styles.progressText}>
                        {progressStep === 'registering' && `Registering ${validCount} files...`}
                        {progressStep === 'classifying' && (mode === 'ai'
                            ? 'AI is organizing your files...'
                            : 'Classifying files into folders...'
                        )}
                    </span>
                </div>
            )}
        </div>
    );
}

export default ProgressView;
