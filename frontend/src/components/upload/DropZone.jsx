import { IconUploadCloud, IconFile, IconFolder } from './icons';
import styles from './DropZone.module.css';

function DropZone({ onSelectFiles, onSelectFolder, isDragOver, onDragOver, onDragLeave, onDrop }) {
    return (
        <div
            className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <span className={styles.iconWrap}><IconUploadCloud /></span>
            <span className={styles.title}>Upload Files &amp; Folders</span>
            <span className={styles.text}>
                Click to browse or drag files anywhere on the page
            </span>
            <div className={styles.buttons}>
                <button className={styles.btnFiles} onClick={onSelectFiles} type="button">
                    <IconFile /> Select Files
                </button>
                <button className={styles.btnFolder} onClick={onSelectFolder} type="button">
                    <IconFolder /> Select Folder
                </button>
            </div>
        </div>
    );
}

export default DropZone;
