# Orvyn — Project Context

## Company
Orbicle Labs (startup). Orvyn is our primary product.

## What is Orvyn?
A privacy-first Windows desktop application for intelligent document management.
Users import documents, and AI classifies them into Smart DataRooms automatically.
Files are never copied — only paths are stored (virtual file system).

## Target Market
Enterprise / financial sector document management.
Users who need to organize large volumes of documents with AI assistance
while keeping files local (privacy-first approach).

## Current Phase
Core V1 features are complete. Currently focused on:
- Enterprise-grade UI polish (design system, light/dark themes)
- Visual consistency across all screens
- [Add your current sprint priorities here]

## What's Been Built (Completed)
- Authentication flow (Express backend + Electron token management)
- File upload system (native file picker, folder scanning, drag-and-drop)
- Smart DataRooms with AI classification (Gemini 2.0 Flash)
- Virtual file system (path storage, file existence checks, relocate)
- File Explorer with grid/list views, context menus, keyboard shortcuts
- Redux state management (5 slices: dataroom, fileExplorer, file, folder, ui)
- Light/dark theme architecture (CSS variables, data-theme attribute)

## What's Not Built Yet
- [List planned features: e.g., search, export, sharing, activity logs]
- Theme persistence via SQLite (currently resets to light on launch)
- [Add your roadmap items]

## Business Context
- Competitor reference: [Add if you have any]
- Launch target: [before march 14 for version 1.0]
