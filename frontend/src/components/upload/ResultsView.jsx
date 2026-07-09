import { IconCheck, IconFolder } from './icons';
import styles from './ResultsView.module.css';

function ResultsView({ mode, uploadModal }) {
    const classResult = uploadModal.classificationResult;
    const genResult = uploadModal.generationResult;
    const regResult = uploadModal.registrationResult;

    return (
        <div className={styles.wrap}>
            {/* Success header */}
            <div className={styles.successHeader}>
                <div className={styles.successIcon}><IconCheck /></div>
                <span className={styles.successTitle}>
                    {mode === 'ai' ? 'DataRoom Created & Organized' : 'Classification Complete'}
                </span>
            </div>

            {/* Stats */}
            <div className={styles.statsGrid}>
                {regResult && (
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>
                            {regResult.total_registered ?? regResult.registered?.length ?? 0}
                        </span>
                        <span className={styles.statLabel}>Registered</span>
                    </div>
                )}
                {regResult?.total_rejected > 0 && (
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{regResult.total_rejected}</span>
                        <span className={styles.statLabel}>Rejected</span>
                    </div>
                )}

                {mode === 'custom' && classResult && (
                    <>
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{classResult.classified ?? 0}</span>
                            <span className={styles.statLabel}>Classified</span>
                        </div>
                        {classResult.low_confidence_skipped > 0 && (
                            <div className={styles.statCard}>
                                <span className={styles.statValue}>{classResult.low_confidence_skipped}</span>
                                <span className={styles.statLabel}>Low Confidence</span>
                            </div>
                        )}
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{classResult.time_seconds?.toFixed(1) ?? '\u2014'}s</span>
                            <span className={styles.statLabel}>Time</span>
                        </div>
                    </>
                )}

                {mode === 'ai' && genResult && (
                    <>
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{genResult.folders_created ?? 0}</span>
                            <span className={styles.statLabel}>Folders Created</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{genResult.files_assigned ?? 0}</span>
                            <span className={styles.statLabel}>Files Assigned</span>
                        </div>
                        {genResult.files_unassigned > 0 && (
                            <div className={styles.statCard}>
                                <span className={styles.statValue}>{genResult.files_unassigned}</span>
                                <span className={styles.statLabel}>Unassigned</span>
                            </div>
                        )}
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{genResult.time_seconds?.toFixed(1) ?? '\u2014'}s</span>
                            <span className={styles.statLabel}>Time</span>
                        </div>
                    </>
                )}
            </div>

            {/* Classification summary breakdown */}
            {mode === 'custom' && classResult && (classResult.classified > 0 || classResult.low_confidence_skipped > 0) && (
                <>
                    <div className={styles.sectionLabel}>Summary</div>
                    <div className={styles.folders}>
                        {classResult.classified > 0 && (
                            <div key="classified" className={styles.folderItem}>
                                <IconFolder />
                                <span>Classified</span>
                                <span className={styles.folderCount}>{classResult.classified} file{classResult.classified !== 1 ? 's' : ''}</span>
                            </div>
                        )}
                        {classResult.low_confidence_skipped > 0 && (
                            <div key="unassigned" className={styles.folderItem}>
                                <IconFolder />
                                <span>Unassigned</span>
                                <span className={styles.folderCount}>{classResult.low_confidence_skipped} file{classResult.low_confidence_skipped !== 1 ? 's' : ''}</span>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default ResultsView;
