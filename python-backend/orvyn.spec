# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Orvyn Python Backend.

Builds a one-dir executable that bundles the FastAPI server, all dependencies,
and the app/ source tree into a self-contained folder.

Usage:
  cd python-backend
  venv\Scripts\pyinstaller orvyn.spec --clean

Output:
  dist/orvyn-backend/orvyn-backend.exe
"""

import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ── Collect full packages that have complex internal imports ──────────
chromadb_datas, chromadb_binaries, chromadb_hiddenimports = collect_all('chromadb')
pydantic_hiddenimports = collect_submodules('pydantic')
sqlalchemy_hiddenimports = collect_submodules('sqlalchemy')

a = Analysis(
    ['run.py'],
    pathex=['.'],
    binaries=chromadb_binaries,
    datas=[
        # Include the entire app/ package as source (FastAPI loads it by import path)
        ('app', 'app'),
        *chromadb_datas,
    ],
    hiddenimports=[
        # ── FastAPI / Uvicorn ──────────────────────────────────
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'fastapi',
        'starlette',
        'starlette.routing',
        'starlette.responses',
        'starlette.middleware',
        'starlette.middleware.cors',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',

        # ── Pydantic ──────────────────────────────────────────
        *pydantic_hiddenimports,
        'pydantic_core',

        # ── SQLAlchemy ────────────────────────────────────────
        *sqlalchemy_hiddenimports,

        # ── Document extraction libs ──────────────────────────
        'fitz',             # PyMuPDF
        'docx',             # python-docx
        'openpyxl',
        'pptx',             # python-pptx
        'pptx.util',
        'pptx.enum',

        # ── ChromaDB ──────────────────────────────────────────
        *chromadb_hiddenimports,
        'onnxruntime',
        'tokenizers',
        'tqdm',

        # ── Misc ──────────────────────────────────────────────
        'dotenv',
        'multipart',
        'python_multipart',
        'json',
        'hashlib',
        'mimetypes',
        'logging.handlers',
        'typing_extensions',
        'typing_inspection',
        'annotated_types',
        'colorama',
        'google.genai',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'scipy',
        'pandas',
        'numpy.testing',
        'pytest',
        'setuptools',
        'pip',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='orvyn-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,      # Keep console for --port arg parsing; Electron hides the window
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='orvyn-backend',
)
