import { IconSparkle, IconFolderTree } from './icons';
import styles from './ClassificationModeSelector.module.css';

function ClassificationModeSelector({
    mode,
    onModeChange,
    targetDataroomId,
    onTargetChange,
    aiName,
    onAiNameChange,
    aiDescription,
    onAiDescriptionChange,
    datarooms,
}) {
    return (
        <div className={styles.section}>
            <div className={styles.sectionTitle}>Organization Method</div>
            <div className={styles.sectionSubtitle}>
                Choose how you want to organize your uploaded files
            </div>

            {/* Mode cards */}
            <div className={styles.modeCards}>
                <button
                    className={`${styles.modeCard} ${mode === 'ai' ? styles.modeCardActive : ''}`}
                    onClick={() => onModeChange('ai')}
                    type="button"
                >
                    <span className={styles.modeIcon}><IconSparkle /></span>
                    <span className={styles.modeContent}>
                        <span className={styles.modeTitle}>AI Organization</span>
                        <span className={styles.modeDesc}>
                            Let AI automatically organize your files intelligently
                        </span>
                    </span>
                </button>
                <button
                    className={`${styles.modeCard} ${mode === 'custom' ? styles.modeCardActive : ''}`}
                    onClick={() => onModeChange('custom')}
                    type="button"
                >
                    <span className={styles.modeIcon}><IconFolderTree /></span>
                    <span className={styles.modeContent}>
                        <span className={styles.modeTitle}>Custom Categories</span>
                        <span className={styles.modeDesc}>
                            Choose from existing data rooms or create new ones
                        </span>
                    </span>
                </button>
            </div>

            {/* Config area */}
            <div className={styles.configArea}>
                {mode === 'ai' && (
                    <>
                        <div className={styles.configHeader}>
                            <span className={styles.configIcon}><IconSparkle /></span>
                            <span className={styles.configTitle}>AI-Powered Organization</span>
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="ai-name">Data Room Name</label>
                            <input
                                id="ai-name"
                                className={styles.input}
                                type="text"
                                placeholder="Enter a name for your new data room"
                                value={aiName}
                                onChange={(e) => onAiNameChange(e.target.value)}
                                maxLength={40}
                            />
                            <span className={styles.fieldHint}>
                                The AI will create this data room and organize all files inside it
                            </span>
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="ai-desc">
                                Description <span className={styles.labelHint}>(optional)</span>
                            </label>
                            <textarea
                                id="ai-desc"
                                className={styles.textarea}
                                placeholder="Describe the purpose of this DataRoom..."
                                value={aiDescription}
                                onChange={(e) => onAiDescriptionChange(e.target.value)}
                            />
                        </div>
                    </>
                )}

                {mode === 'custom' && (
                    <>
                        <div className={styles.configHeader}>
                            <span className={styles.configIcon}><IconFolderTree /></span>
                            <span className={styles.configTitle}>Custom Classification</span>
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="target-dataroom">Target DataRoom</label>
                            <select
                                id="target-dataroom"
                                className={styles.select}
                                value={targetDataroomId}
                                onChange={(e) => onTargetChange(e.target.value)}
                            >
                                <option value="">Select a DataRoom...</option>
                                {datarooms.map((dr) => (
                                    <option key={dr.id} value={dr.id}>{dr.name}</option>
                                ))}
                            </select>
                            <span className={styles.fieldHint}>
                                Files will be classified into the existing folder structure
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default ClassificationModeSelector;
