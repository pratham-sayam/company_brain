# Orvyn — Feature Status

## COMPLETED

### Authentication
- Login/Register via Express backend (cloud-hosted)
- Token management in Electron (tokenVault, tokenRefreshScheduler)
- Secure token storage — never in Redux or localStorage
- User context management (userContextService)

### Smart DataRooms
- Create/edit/delete DataRooms
- Custom Classification — user selects DataRoom, AI classifies into existing folders
- AI Auto-Organize — AI generates folder structure and classifies files
- Nested folder structure with unlimited depth
- Folder context descriptions that guide AI classification

### File Management
- Native file picker (files and folders)
- Drag-and-drop upload with recursive folder scanning
- Virtual file system — stores paths only, files stay on disk
- File registration with text extraction (PDF, DOCX, XLSX, PPTX, TXT, CSV, images)
- Max 100 files per classification batch
- File operations: open, open with, copy path, copy to clipboard, rename, relocate
- Remove from Orvyn (DB only) and Delete from System (DB + disk)
- Confidence scoring with color indicators (green/yellow/orange)

### AI Classification Engine
- Google Gemini 2.0 Flash with temperature 0.1
- Batched parallel processing (10 files/batch, 5 concurrent batches)
- Text fingerprinting (filename + extension + first 1000 chars)
- Confidence threshold 0.4 for folder assignment

### File Explorer
- Grid and list view modes
- Breadcrumb navigation
- Right-click context menus (file, folder, background)
- Keyboard shortcuts (Delete, F2, Enter, Backspace, Escape, Ctrl+A, Ctrl+C)
- Multi-selection with batch actions
- Sortable columns (name, size, date, confidence)

### UI Framework
- React + Vite + SWC
- Redux with 5 slices (dataroom, fileExplorer, file, folder, ui)
- Light/dark theme via CSS variables and data-theme attribute
- Responsive layout (Flexbox/Grid, relative units)

## IN PROGRESS
- Design system implementation (enterprise-grade visual polish)
- [Add what you're actively working on]

## PLANNED
- Theme persistence via SQLite
- [Search across DataRooms]
- [Activity/audit logs]
- [Sharing and permissions]
- [Export functionality]
- [Auto-updater]
- [Add your roadmap items]