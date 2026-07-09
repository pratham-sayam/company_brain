import { useState, useRef, useEffect, useMemo } from 'react';
import {
    IconX, IconEmptyFiles, IconFileSmall,
    IconSearch, IconGrid, IconList, IconFilter, IconSort, IconHardDrive,
} from './icons';
import styles from './FileList.module.css';

/* ── Helpers ──────────────────────────────────────────── */

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sortSizeNumeric(a, b) {
    return (a.size || 0) - (b.size || 0);
}

function getIconClass(ext) {
    switch (ext) {
        case '.pdf': return 'iconPdf';
        case '.doc': case '.docx': return 'iconDocx';
        case '.xls': case '.xlsx': case '.csv': return 'iconXlsx';
        case '.ppt': case '.pptx': return 'iconPptx';
        case '.png': case '.jpg': case '.jpeg': return 'iconImage';
        default: return 'iconDefault';
    }
}

function getExtLabel(ext) {
    const map = {
        '.pdf': 'PDF', '.docx': 'DOC', '.doc': 'DOC',
        '.xlsx': 'XLS', '.xls': 'XLS', '.csv': 'CSV',
        '.pptx': 'PPT', '.ppt': 'PPT',
        '.png': 'PNG', '.jpg': 'JPG', '.jpeg': 'JPG',
        '.txt': 'TXT',
    };
    return map[ext] || ext.replace('.', '').toUpperCase() || 'FILE';
}

/* ── Component ────────────────────────────────────────── */

const SORT_OPTIONS = [
    { value: 'name-asc', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
    { value: 'size-asc', label: 'Size (smallest)' },
    { value: 'size-desc', label: 'Size (largest)' },
    { value: 'type-asc', label: 'Type (A-Z)' },
    { value: 'type-desc', label: 'Type (Z-A)' },
];

const FILE_TYPE_GROUPS = [
    { value: '', label: 'All types' },
    { value: 'document', label: 'Documents', exts: ['.pdf', '.docx', '.doc', '.txt'] },
    { value: 'spreadsheet', label: 'Spreadsheets', exts: ['.xlsx', '.xls', '.csv'] },
    { value: 'presentation', label: 'Presentations', exts: ['.pptx', '.ppt'] },
    { value: 'image', label: 'Images', exts: ['.png', '.jpg', '.jpeg'] },
];

function FileList({ files, onRemoveFile, validCount, invalidCount, totalSize, maxFiles }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('list');
    const [sortKey, setSortKey] = useState('name-asc');
    const [filterType, setFilterType] = useState('');
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const sortRef = useRef(null);
    const filterRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(e) {
            if (sortRef.current && !sortRef.current.contains(e.target)) {
                setShowSortMenu(false);
            }
            if (filterRef.current && !filterRef.current.contains(e.target)) {
                setShowFilterMenu(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter and sort files (local UI only)
    const displayFiles = useMemo(() => {
        let result = files;

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((f) => f.name.toLowerCase().includes(q));
        }

        // Type filter
        if (filterType) {
            const group = FILE_TYPE_GROUPS.find((g) => g.value === filterType);
            if (group && group.exts) {
                result = result.filter((f) => group.exts.includes(f.extension));
            }
        }

        // Sort
        const [field, order] = sortKey.split('-');
        const sorted = [...result].sort((a, b) => {
            if (field === 'name') {
                return a.name.localeCompare(b.name);
            } else if (field === 'size') {
                return sortSizeNumeric(a, b);
            } else if (field === 'type') {
                return (a.extension || '').localeCompare(b.extension || '');
            }
            return 0;
        });

        if (order === 'desc') sorted.reverse();
        return sorted;
    }, [files, searchQuery, filterType, sortKey]);

    return (
        <>
            {/* Search bar + view toggles */}
            <div className={styles.searchBar}>
                <div className={styles.searchInputWrap}>
                    <span className={styles.searchIcon}><IconSearch /></span>
                    <input
                        className={styles.searchInput}
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className={styles.viewToggles}>
                    <button
                        className={`${styles.viewToggle} ${viewMode === 'grid' ? styles.viewToggleActive : ''}`}
                        onClick={() => setViewMode('grid')}
                        type="button"
                        aria-label="Grid view"
                    >
                        <IconGrid />
                    </button>
                    <button
                        className={`${styles.viewToggle} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
                        onClick={() => setViewMode('list')}
                        type="button"
                        aria-label="List view"
                    >
                        <IconList />
                    </button>
                </div>
            </div>

            {/* Toolbar: file stats + filter/sort */}
            <div className={styles.toolbar}>
                <div className={styles.toolbarStats}>
                    <span className={styles.stat}>
                        <IconFileSmall /> {files.length} / {maxFiles} files
                    </span>
                    <span className={styles.stat}>
                        <IconHardDrive /> {formatSize(totalSize)}
                    </span>
                </div>
                <div className={styles.toolbarActions}>
                    <div className={styles.dropdownWrap} ref={filterRef}>
                        <button
                            className={`${styles.toolbarBtn} ${filterType ? styles.toolbarBtnActive : ''}`}
                            type="button"
                            onClick={() => { setShowFilterMenu((v) => !v); setShowSortMenu(false); }}
                            aria-expanded={showFilterMenu}
                            aria-haspopup="listbox"
                        >
                            <IconFilter /> Filter
                        </button>
                        {showFilterMenu && (
                            <div className={styles.dropdown} role="listbox">
                                {FILE_TYPE_GROUPS.map((g) => (
                                    <button
                                        key={g.value}
                                        className={`${styles.dropdownItem} ${filterType === g.value ? styles.dropdownItemActive : ''}`}
                                        type="button"
                                        role="option"
                                        aria-selected={filterType === g.value}
                                        onClick={() => { setFilterType(g.value); setShowFilterMenu(false); }}
                                    >
                                        {g.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className={styles.dropdownWrap} ref={sortRef}>
                        <button
                            className={styles.toolbarBtn}
                            type="button"
                            onClick={() => { setShowSortMenu((v) => !v); setShowFilterMenu(false); }}
                            aria-expanded={showSortMenu}
                            aria-haspopup="listbox"
                        >
                            <IconSort /> Sort
                        </button>
                        {showSortMenu && (
                            <div className={styles.dropdown} role="listbox">
                                {SORT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        className={`${styles.dropdownItem} ${sortKey === opt.value ? styles.dropdownItemActive : ''}`}
                                        type="button"
                                        role="option"
                                        aria-selected={sortKey === opt.value}
                                        onClick={() => { setSortKey(opt.value); setShowSortMenu(false); }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* File list or empty state */}
            {displayFiles.length > 0 ? (
                <div className={viewMode === 'grid' ? styles.grid : styles.list}>
                    {displayFiles.map((f) => (
                        viewMode === 'grid' ? (
                            <div
                                key={f.path}
                                className={`${styles.gridItem} ${!f.valid ? styles.itemInvalid : ''}`}
                            >
                                <button
                                    className={styles.gridItemRemove}
                                    onClick={() => onRemoveFile(f.path)}
                                    title="Remove"
                                    type="button"
                                    aria-label={`Remove ${f.name}`}
                                >
                                    <IconX />
                                </button>
                                <div className={`${styles.gridItemIcon} ${styles[getIconClass(f.extension)]}`}>
                                    {getExtLabel(f.extension).slice(0, 3)}
                                </div>
                                <span className={styles.gridItemName} title={f.path}>{f.name}</span>
                                <span className={styles.gridItemSize}>{formatSize(f.size)}</span>
                                {!f.valid && <span className={styles.itemBadge}>Unsupported</span>}
                            </div>
                        ) : (
                            <div
                                key={f.path}
                                className={`${styles.item} ${!f.valid ? styles.itemInvalid : ''}`}
                            >
                                <div className={`${styles.itemIcon} ${styles[getIconClass(f.extension)]}`}>
                                    {getExtLabel(f.extension).slice(0, 3)}
                                </div>
                                <span className={styles.itemName} title={f.path}>{f.name}</span>
                                <span className={styles.itemSize}>{formatSize(f.size)}</span>
                                {!f.valid && <span className={styles.itemBadge}>Unsupported</span>}
                                <button
                                    className={styles.itemRemove}
                                    onClick={() => onRemoveFile(f.path)}
                                    title="Remove"
                                    type="button"
                                    aria-label={`Remove ${f.name}`}
                                >
                                    <IconX />
                                </button>
                            </div>
                        )
                    ))}
                </div>
            ) : (
                <div className={styles.empty}>
                    <span className={styles.emptyIcon}><IconEmptyFiles /></span>
                    <span className={styles.emptyTitle}>No files found</span>
                    <span className={styles.emptyHint}>Upload some files to get started</span>
                </div>
            )}
        </>
    );
}

export default FileList;
