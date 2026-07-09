# Orvyn V1 with new feature — Copilot Feature: Complete Architecture & Build Guide

---

## ALREADY COMPLETED (Context Only — Do NOT Rebuild)

The following was shipped in V1. The V1-new feature build phases below assume all of this is working.

**Phase 1 — Security Hardening:**
- Command injection fixed — `exec()` replaced with `execFile()` everywhere
- Gemini API key moved to Express — Python and Electron no longer hold the key
- Register rate limiting — 5 per 15 min on POST /register
- 3-step AI orchestration — Python prepares → Express calls Gemini → Python applies
- New files: `expressService.js`, `geminiService.js`, `aiController.js`

**Phase 2 — Infrastructure:**
- Structured logging — electron-log, winston, Python RotatingFileHandler
- Dynamic port allocation — Python gets a free port at startup via `net.createServer()`
- API versioning — All routes under `/api/v1/`, backward-compat aliases temporary

**Critical Rule for V1- new feature:**
The Gemini API key lives in `express-backend/.env` ONLY. Python never calls Gemini directly.
Every Gemini call (embeddings, chat, entity extraction, summaries, title generation) routes
through Express. This is the established 3-step orchestration from V1 and it extends to
ALL new AI operations in V1-new feature.

---

## Ideas Taken vs Rejected

### TAKEN:
- Capability-based agents (Retrieval, Analysis, Comparison, Generation) — NOT vertical
- Hybrid search (vector + keyword/BM25) — 30-50% better retrieval vs vector-only
- Background indexing via SQLite job queue — reliable, with status tracking and retries
- Auto-analyze DataRoom on creation/upload — generate instant insights
- Entity extraction (organizations, people, amounts, dates) — high value, low cost
- Workspace-wide search across all DataRooms — killer feature
- Suggested questions generated per DataRoom — great UX
- Document similarity detection — find duplicates
- Role simulation (VC, Legal Counsel, Board Member, Critical Reviewer, Custom, etc.)
- File integrity via triple-check (size + mtime + checksum) — detect externally modified files
- Embedding status tracking — prevent searching partially indexed files
- Embedding model versioning — safe future model migrations
- Duplicate document detection via content hashing — skip re-embedding identical content

### REJECTED (and why):

**LangGraph / LangChain** — Gemini function calling gives 90% of agent behavior natively.
You have ONE reasoning model with tools. Add LangGraph in V3 when you have 4+ agents.

**Multiple LLM models** — Model routing adds latency, 3 API keys, 3 billing setups.
Gemini 2.0 Flash handles everything. Add model routing in V3 if specific tasks fail.

**Qdrant instead of ChromaDB** — Qdrant requires a separate server process or Docker.
ChromaDB runs embedded in Python, zero config, stores on disk alongside SQLite.
Switch to Qdrant only if you move to cloud/SaaS.

**Redis / Celery** — Desktop app. SQLite + in-memory dicts handle caching.
SQLite job queue + FastAPI BackgroundTasks replace Celery without extra processes.

**Unstructured library** — Already have PyMuPDF, python-docx, openpyxl, python-pptx.
Unstructured is 1GB+ and does the same thing.

**Knowledge graphs** — 2-3 weeks of work. Entity extraction + vector search gives 80% of value.

**OpenAI embeddings** — Stay on one provider. Gemini embeddings are high quality and cheap.

---

## Final Architecture

```
USER QUERY: "Are there inconsistencies across my documents?"
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ELECTRON (Orchestrator)                        │
│                                                                   │
│  STEP 1: Ask Python for hybrid search results                    │
│  ┌──────────────────────────────────────────────┐                │
│  │ IPC → Python: POST /api/v1/copilot/search    │                │
│  │ Python runs: Vector (ChromaDB) + Keyword (FTS5)│               │
│  │ Scope filter: dataroom / folder / file / global│               │
│  │ Only queries files with embedding_status=complete│             │
│  │ Returns: Top 8 relevant chunks + chat history │                │
│  └──────────────────────┬───────────────────────┘                │
│                          │                                        │
│  STEP 2: Send chunks + query to Express for Gemini               │
│  ┌──────────────────────────────────────────────┐                │
│  │ HTTP → Express: POST /api/v1/ai/chat/stream  │                │
│  │ Express calls Gemini 2.0 Flash (owns API key) │               │
│  │ Streams tokens back via SSE                   │                │
│  │                                               │                │
│  │ If Gemini requests tools:                     │                │
│  │  Express returns tool_call → Electron routes  │                │
│  │  to Python for data → sends result to Express │                │
│  │  Max 3 tool call rounds                       │                │
│  └──────────────────────┬───────────────────────┘                │
│                          │                                        │
│  STEP 3: Forward stream to React + save via Python               │
│  ┌──────────────────────────────────────────────┐                │
│  │ IPC events → React: copilot:stream-chunk      │                │
│  │ After stream: Python saves messages to SQLite │                │
│  └──────────────────────────────────────────────┘                │
│                                                                   │
│  DATA STORES (all local, managed by Python):                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ ChromaDB     │  │ SQLite FTS5  │  │ SQLite Core  │           │
│  │ (vectors)    │  │ (keywords)   │  │ (structured) │           │
│  │ Per-user     │  │ file_chunks  │  │ chat_sessions│           │
│  │ collection   │  │ _fts table   │  │ chat_messages│           │
│  │              │  │              │  │ file_entities│           │
│  │ Metadata:    │  │              │  │ dr_insights  │           │
│  │  file_id     │  │              │  │ indexing_jobs│           │
│  │  dataroom_id │  │              │  │              │           │
│  │  checksum    │  │              │  │              │           │
│  │  file_size   │  │              │  │              │           │
│  │  file_mtime  │  │              │  │              │           │
│  │  emb_model   │  │              │  │              │           │
│  │  emb_status  │  │              │  │              │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

### Why This Architecture Wins

1. **API key never leaves Express** — Consistent with the V1 security model.
2. **Electron remains the orchestrator** — Same 3-step pattern as classification.
3. **Hybrid search runs locally** — ChromaDB + FTS5 both local. ~100ms, no network.
4. **Function calling for edge cases** — 80%+ queries resolve with pre-fetched chunks only.
5. **Background indexing with job queue** — Decoupled from upload. Retries on failure.
6. **Triple-check protects integrity** — file_size + mtime + checksum catches all external edits, including binary-only changes that checksum alone misses.
7. **Embedding status prevents corrupt results** — Only `complete` files are searchable.
8. **Model versioning enables safe migrations** — Re-index selectively when models change.
9. **Duplicate detection saves cost** — Skip embedding identical content via SHA-256 hash.

---

## Six Architectural Recommendations — How Each Is Implemented

### 1. Maintain File Integrity by Storing Checksums in Embedding Metadata

**Problem:** If a user edits an Excel or Word file outside Orvyn, the embeddings become stale.

**Edge case:** A file's binary metadata can change (e.g. Excel recalculates formulas, Word
updates revision history, PDF re-saves with different compression) while the extracted text
stays identical. A checksum-only comparison misses this. The file is different but the hash
says it's the same.

**Solution:** Triple-check using three signals together. A file is considered changed if ANY
of these differ from what was stored at indexing time:

```
1. file_size_bytes  — fast, catches most edits instantly
2. file_modified_at — OS-level timestamp, catches saves without content change
3. content_checksum — SHA-256 of extracted_text, catches text-level changes
```

All three are stored in the `files` table AND in every ChromaDB embedding metadata record:

```python
# When indexing:
metadata = {
    "file_id": file_id,
    "dataroom_id": dataroom_id,
    "chunk_index": i,
    "checksum": content_checksum,           # Text-level integrity
    "file_size_bytes": file_size_bytes,      # Binary-level integrity
    "file_modified_at": file_modified_at,    # OS-level integrity
    "embedding_model": EMBEDDING_MODEL,      # Model version
    "embedding_status": "complete",          # Filter directly in ChromaDB (no SQLite pre-query)
}
```

**Detection logic (on `file:relocate` or periodic check):**
```python
import os

def has_file_changed(file_record, file_path: str) -> bool:
    """Returns True if the file has changed since last indexing."""
    stat = os.stat(file_path)
    current_size = stat.st_size
    current_mtime = stat.st_mtime

    # Fast checks first (no I/O beyond stat)
    if current_size != file_record.file_size_bytes:
        return True
    if current_mtime != file_record.file_modified_at:
        return True

    # Expensive check last (requires full text extraction)
    current_text = extract_text(file_path)
    current_checksum = compute_content_hash(current_text)
    if current_checksum != file_record.content_checksum:
        return True

    return False
```

**When it triggers:** On `file:relocate`, Python calls `has_file_changed()`. If any of the
three checks fail → old embeddings are deleted → a new indexing job is created → the file
is re-embedded with fresh content. The triple-check means even binary-only changes get caught.

### 2. Introduce a Background Indexing Queue

**Problem:** Indexing 50 files synchronously blocks the UI and risks timeouts.

**Solution:** SQLite-backed `indexing_jobs` table decouples indexing from the upload flow.

```sql
CREATE TABLE IF NOT EXISTS indexing_jobs (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    dataroom_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | complete | failed
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

**Flow:** Classification completes → creates `indexing_jobs` (one per file) → background worker
picks jobs sequentially → runs the 3-step pipeline (Python chunk → Express embed → Python store)
→ on success: `status=complete` → on failure: `attempts++`, retry up to 3 times, then `status=failed`.

**Crash Recovery:** If the app crashes or is force-closed while a job has `status='processing'`,
that job is stuck forever — no worker will ever pick it up again. To handle this, Python
runs a recovery sweep on startup (called from `/init-db` or a dedicated startup endpoint):

```python
STALE_JOB_THRESHOLD_MINUTES = 10

def recover_stale_indexing_jobs(db_session):
    """Reset processing jobs older than 10 minutes back to pending.
    Called once at Python startup after /init-db."""
    db_session.execute(text("""
        UPDATE indexing_jobs
        SET status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'processing'
        AND updated_at < datetime('now', '-' || :threshold || ' minutes')
    """), {"threshold": STALE_JOB_THRESHOLD_MINUTES})
    db_session.commit()
```

**Rule:** Any job stuck in `processing` for longer than 10 minutes is assumed crashed.
It gets reset to `pending` so the worker picks it up again on the next run.
The `attempts` counter is NOT incremented on recovery — the crash was not the job's fault.

### 3. Protect the System from Partial Embedding Failures

**Problem:** Network failures or Gemini API errors can leave files partially indexed. Searching
these files returns incomplete or corrupt results.

**Solution:** `embedding_status` stored in TWO places:
- The `files` table in SQLite (for UI display and job management)
- Every ChromaDB chunk metadata record (for single-query search filtering)

```
States: none → pending → processing → complete → failed
```

**Rule:** The search engine ONLY queries embeddings where `embedding_status = 'complete'`.
This filter is applied directly in the ChromaDB `where` clause — no need to pre-query SQLite
for a list of complete file IDs. One query, not two.

Files stuck in `processing` or `failed` are invisible to search until successfully re-indexed.

### 4. Version the Embedding Model

**Problem:** Migrating from `gemini-embedding-001` to a newer model produces incompatible vectors.
Without tracking, old and new vectors get mixed in the same index.

**Solution:** Store `embedding_model` in both the `files` table and every ChromaDB metadata record.

```python
EMBEDDING_MODEL = "gemini-embedding-001"  # Read from Express env

# Stored per chunk in ChromaDB:
metadata["embedding_model"] = EMBEDDING_MODEL

# Stored per file in SQLite:
UPDATE files SET embedding_model = ? WHERE id = ?
```

**Migration:** Query ChromaDB for chunks with the old model version. Delete them. Re-index those
files with the new model. No incompatible vectors ever coexist.

### 5. Duplicate Document Detection

**Problem:** Legal and finance DataRooms often contain duplicate contracts, identical PDFs, or
re-uploaded pitch decks. Embedding them wastes API cost and storage.

**Solution:** Before generating embeddings, compute SHA-256 of the full extracted_text. If an
identical hash already exists for a different file, skip embedding and optionally copy vectors.

```python
import hashlib

def compute_content_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

# During prepare-index:
checksum = compute_content_hash(extracted_text)
existing = db.query(
    "SELECT id FROM files WHERE content_checksum = ? AND id != ? AND embedding_status = 'complete'",
    checksum, file_id
)
if existing:
    # Duplicate — copy embeddings from the original file
    return {"status": "duplicate", "original_file_id": existing.id}
```

**Benefits:** Prevents duplicate indexing, reduces vector DB storage, speeds up indexing,
saves Gemini embedding API cost.

### 6. Worker Crash Recovery

**Problem:** If the app crashes or is force-closed while an indexing job has `status='processing'`,
that job is stuck forever. No worker will ever pick it up — the file stays partially indexed
and invisible to search permanently.

**Solution:** On every app startup, Python runs a recovery sweep that resets stale processing
jobs back to `pending`:

```python
STALE_JOB_THRESHOLD_MINUTES = 10

def recover_stale_indexing_jobs(db_session):
    """Reset processing jobs older than 10 minutes back to pending.
    Called once at startup inside /init-db."""
    db_session.execute(text("""
        UPDATE indexing_jobs
        SET status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'processing'
        AND updated_at < datetime('now', '-' || :threshold || ' minutes')
    """), {"threshold": STALE_JOB_THRESHOLD_MINUTES})
    db_session.commit()
```

**Rules:**
- Any job stuck in `processing` for >10 minutes is assumed crashed and reset to `pending`.
- `attempts` is NOT incremented on recovery — the crash was not the job's fault.
- After /init-db completes, Electron checks for pending jobs and auto-resumes indexing.
- Also reset `embedding_status` to `pending` on the corresponding files table records.

---

## Full-Text Extraction & Chunk-Based Knowledge Architecture

### Problem

The original pipeline stored only the first 5000 characters of each document in `files.extracted_text`.
All downstream consumers — chunking, embedding, hybrid search, tools, checksums — read from this
truncated column. This meant **~95% of long documents were invisible** to the AI. A 50-page PDF
produced maybe 2 chunks. The Copilot literally could not answer questions about anything past page 2-3.

### Solution

The indexing pipeline now **re-extracts full text from the original file on disk** during `prepare_index()`,
instead of reading the truncated `extracted_text` from SQLite. The `files.extracted_text` column is
reduced to a **3000-char preview** (from 5000) — it now serves only as a preview for classification
fingerprinting, summary generation, and audit preview fallback.

### What Changed

| Component | Before | After |
|-----------|--------|-------|
| `_MAX_EXTRACTED_TEXT_LENGTH` (main.py) | 5000 | 3000 (preview-only) |
| `prepare_index()` text source | `files.extracted_text` from DB (truncated) | Re-extracted from disk via `_extract_text()` (full text) |
| Checksum computation | On truncated text | On full extracted text |
| Chunk generation | From truncated text (~2 chunks for long docs) | From full text (covers entire document) |
| `apply_index()` | Does not update `extracted_text` | Updates `extracted_text` with preview from same extraction pass |
| `tool_get_file_content()` | Returns `extracted_text` (truncated preview) | Reads from `file_chunks` table with overlap-aware concatenation (10K cap) |
| `prepare_compare_data()` | Returns `extracted_text[:3000]` | Reads from `file_chunks` with overlap-aware concatenation (5K cap) |
| Memory management | None | `del extracted_text` after chunking to free large text blobs |
| Error handling | Generic failure | Structured: `FILE_NOT_FOUND`, `EXTRACTION_ERROR: {details}` |

### Overlap-Aware Chunk Concatenation

When tools reconstruct document content from chunks, they use `_concatenate_chunks()` which trims
the overlap region from each chunk after the first. Chunks have ~750 char overlap
(`RAG_CHUNK_OVERLAP_CHARS`). The trim amount is `overlap - 50 = 700 chars` — slightly conservative
to avoid cutting unique content at paragraph boundaries where chunk splits may not align perfectly.

```python
_OVERLAP_TRIM = int(os.getenv("RAG_CHUNK_OVERLAP_CHARS", "750")) - 50

def _concatenate_chunks(chunk_rows: list, max_chars: int = 10000) -> str:
    if not chunk_rows:
        return ""
    parts = [chunk_rows[0][0]]
    for i in range(1, len(chunk_rows)):
        chunk_text = chunk_rows[i][0]
        if len(chunk_text) > _OVERLAP_TRIM:
            parts.append(chunk_text[_OVERLAP_TRIM:])
        else:
            parts.append(chunk_text)
    result = "\n".join(parts)
    if len(result) > max_chars:
        result = result[:max_chars] + "\n... [truncated]"
    return result
```

### Memory Management

A 100-page PDF can produce 500KB-1MB+ of extracted text. During sequential batch indexing (one file
at a time, confirmed in `copilotHandlers.js`), the full text is explicitly freed after chunking:

```python
chunks = chunk_text_with_metadata(extracted_text, file_ext)
preview_text = extracted_text[:3000]
content_checksum = compute_content_hash(extracted_text)
del extracted_text  # Free memory — only chunks and preview remain
```

### Electron Pass-Through

The `preview_text` field flows through the indexing pipeline:
1. `prepare-index` (Python) → returns `preview_text` in response
2. Electron passes it through to `apply-index` request body
3. `apply-index` (Python) → updates `files.extracted_text` with the preview

Both the normal indexing flow and the crash-recovery flow in `copilotHandlers.js` pass `preview_text`.

### Files Modified

| File | Changes |
|------|---------|
| `python-backend/app/main.py` | `_MAX_EXTRACTED_TEXT_LENGTH`: 5000 → 3000; `ApplyIndexRequest`: added `preview_text` field |
| `python-backend/app/services/embedding_service.py` | `prepare_index()`: re-extract from disk, memory mgmt, structured errors; `apply_index()`: accepts + writes preview_text |
| `python-backend/app/services/copilot_tools.py` | New `_concatenate_chunks()` helper; `tool_get_file_content()` + `prepare_compare_data()`: read from file_chunks |
| `electron/ipc/copilotHandlers.js` | Pass `preview_text` from prepare-index to apply-index (both normal + crash-recovery flows) |

---

## Feature Set (V1-new feature Launch)

### CORE (Must Ship)

| # | Feature | Description |
|---|---------|-------------|
| 1 | Chat with DataRoom | Ask questions about all files in a DataRoom |
| 2 | Chat with File(s) | Select 1+ files, ask specific questions |
| 3 | Cross-DataRoom Search | "Which dataroom has the compliance docs?" |
| 4 | DataRoom Audit | AI reviews completeness, consistency, risks |
| 5 | Quick Data Extraction | "What's the total amount?" → finds it, returns it |
| 6 | Source Citations | Every answer cites which file(s) it came from |
| 7 | Chat History | Saved per scope, revisitable |
| 8 | Suggested Questions | Context-aware prompts when chat opens |
| 9 | Background Indexing | Files auto-indexed via job queue after classification |

### ENHANCED (Ship if time allows)

| # | Feature | Description |
|---|---------|-------------|
| 10 | Hybrid Search | Vector + keyword (FTS5) for better retrieval |
| 11 | Auto DataRoom Insights | Auto-generated summary when DataRoom changes |
| 12 | Entity Extraction | Extract organizations, people, amounts, dates, terms |
| 13 | Document Comparison | "Compare these two contracts" |
| 14 | Document Similarity | Find near-duplicates across DataRooms |
| 15 | Role Simulation | "Act like a [VC / Legal Counsel / Board Member / Custom]" |

### FUTURE (V3+)

| # | Feature | Description |
|---|---------|-------------|
| 16 | Multi-agent orchestration | LangGraph for complex workflows |
| 17 | Knowledge graph | Entity relationships across documents |
| 18 | Offline AI mode | Local embeddings + local LLM |
| 19 | Real-time collaboration | Shared copilot in team DataRooms |
| 20 | Template DataRooms | Pre-built structures for common use cases |

---

## Tech Stack (Final)

| Component | Choice | Why |
|-----------|--------|-----|
| LLM | Gemini 2.0 Flash | Fast, cheap, function calling, already integrated |
| Embeddings | gemini-embedding-001 | Same provider, $0.15/1M, 3072 dimensions |
| Vector DB | ChromaDB (local, persistent) | Local-first, zero config, Python-native |
| Keyword Search | SQLite FTS5 | Already have SQLite, FTS5 is built-in |
| Chat Storage | SQLite (new tables) | Same DB, same patterns |
| Background Tasks | SQLite job queue + BackgroundTasks | Reliable, restartable |
| Chunking | Custom Python | Configurable size + overlap via .env |
| Parsing | Existing (PyMuPDF, python-docx, etc.) | Already built in V1 |

**New Python packages:** `chromadb` (one package, confirm before installing)

---

## Cost Estimate

### Per-Operation Costs
| Operation | Input Tokens | Output Tokens | Cost |
|-----------|-------------|---------------|------|
| Embed 1 file (10 chunks × 500 tokens) | ~5,000 | — | $0.00075 |
| Embed 50 files (full batch) | ~250,000 | — | $0.0375 |
| 1 chat query (system + 8 chunks + history) | ~5,000 | ~500 | $0.0007 |
| 1 deep analysis (file review) | ~20,000 | ~2,000 | $0.003 |
| 1 DataRoom audit (full review) | ~30,000 | ~3,000 | $0.0042 |
| 1 role simulation | ~25,000 | ~5,000 | $0.005 |
| Auto DataRoom insights | ~15,000 | ~2,000 | $0.002 |
| Entity extraction (per file) | ~3,000 | ~500 | $0.0005 |

### Monthly Cost Per User
| Usage Level | Queries/Day | Files Indexed/Month | Monthly Cost |
|-------------|-------------|---------------------|-------------|
| Light | 20 | 50 | ~$0.80 |
| Normal | 50 | 100 | ~$2.50 |
| Heavy | 200 | 300 | ~$8.00 |
| Power | 500 | 500 | ~$20.00 |

---

## Hybrid Search: How It Works

```
User: "Find all documents mentioning Stripe"

VECTOR SEARCH (ChromaDB):
  → Embeds "Stripe" → finds semantically similar chunks
  → Might find: "payment processor", "online payments"
  → But might MISS a chunk that says "Stripe Inc." in a low-relevance area

KEYWORD SEARCH (SQLite FTS5):
  → Searches chunk_text for exact word "Stripe"
  → Finds EVERY chunk that contains "Stripe"
  → Fast, exact, never misses

HYBRID MERGE (with score normalization):
  → PROBLEM: ChromaDB returns distances (lower = better, range 0-2 for cosine).
    FTS5 returns BM25 rank (negative, lower = better). These scales are incompatible.
  → NORMALIZE both to 0-1 (higher = better):
    vector_score = 1 - (distance / 2)        # cosine distance 0→1.0, 2→0.0
    keyword_score = 1 / (1 + abs(bm25_rank))  # BM25 rank -0.1→0.91, -10→0.09
  → Deduplicate by (file_id, chunk_index)
  → Chunk appears in BOTH → combined_score = max(vector_score, keyword_score) * 1.5
  → Chunk in only one → score = that score
  → Sort by combined score descending, return top 8

Result: Never misses exact matches + understands semantic meaning.
```

### SQLite FTS5 Setup
```sql
CREATE TABLE IF NOT EXISTS file_chunks (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    dataroom_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS file_chunks_fts USING fts5(
    chunk_text,
    file_id UNINDEXED,
    dataroom_id UNINDEXED,
    chunk_index UNINDEXED,
    content='file_chunks'
);

-- CRITICAL: content= mode requires manual sync triggers.
-- Without these, FTS5 is completely empty and keyword search returns nothing.

CREATE TRIGGER IF NOT EXISTS file_chunks_ai AFTER INSERT ON file_chunks BEGIN
    INSERT INTO file_chunks_fts(rowid, chunk_text, file_id, dataroom_id, chunk_index)
    VALUES (new.rowid, new.chunk_text, new.file_id, new.dataroom_id, new.chunk_index);
END;

CREATE TRIGGER IF NOT EXISTS file_chunks_ad AFTER DELETE ON file_chunks BEGIN
    INSERT INTO file_chunks_fts(file_chunks_fts, rowid, chunk_text, file_id, dataroom_id, chunk_index)
    VALUES ('delete', old.rowid, old.chunk_text, old.file_id, old.dataroom_id, old.chunk_index);
END;

CREATE TRIGGER IF NOT EXISTS file_chunks_au AFTER UPDATE ON file_chunks BEGIN
    INSERT INTO file_chunks_fts(file_chunks_fts, rowid, chunk_text, file_id, dataroom_id, chunk_index)
    VALUES ('delete', old.rowid, old.chunk_text, old.file_id, old.dataroom_id, old.chunk_index);
    INSERT INTO file_chunks_fts(rowid, chunk_text, file_id, dataroom_id, chunk_index)
    VALUES (new.rowid, new.chunk_text, new.file_id, new.dataroom_id, new.chunk_index);
END;
```

**Why `content=` mode:** FTS5 with `content='file_chunks'` means the FTS index does NOT store
its own copy of the text — it reads from the source table. This saves disk space (no duplicate
text storage), but the tradeoff is you MUST keep it in sync via triggers. Without the three
triggers above, INSERT/DELETE/UPDATE on `file_chunks` will not update the FTS index at all.

**Note for sync functions:** Because the triggers handle FTS5 automatically, the sync functions
in `embedding_service.py` only need to INSERT/DELETE on the `file_chunks` table. The FTS5
virtual table updates itself via the triggers. Do NOT manually INSERT into `file_chunks_fts`.

---

## Chat Scoping

```
📄 FILE SCOPE — User selects specific file(s)
   Filter: file_id IN [selected_ids]

📂 FOLDER SCOPE — User is inside a folder
   Filter: folder_id = current_folder (includes nested subfolders)

📁 DATAROOM SCOPE — User is in a DataRoom
   Filter: dataroom_id = current_dataroom

📁📁 MULTI-DATAROOM SCOPE — User references multiple DataRooms
   Filter: dataroom_id IN [detected_ids]

🌐 GLOBAL SCOPE — No specific DataRoom context
   Filter: none (search everything)
```

### Chat Storage Schema
```sql
-- NOTE: No user_id column. The SQLite database is already per-user
-- (each user has their own DB file at {userData}/users/{userId}/Orvyn.db).
-- If Orvyn ever moves to shared/cloud storage, add user_id then.

CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_ids TEXT,
    scope_name TEXT,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources TEXT,
    tool_calls TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);
```

---

## Auto DataRoom Insights

```
TRIGGER: After classification completes (background, via indexing pipeline)

GENERATES:
1. Summary: "This DataRoom contains 23 files across 5 categories..."
2. Key entities: organizations, people, amounts mentioned
3. File type breakdown: 12 PDFs, 5 DOCX, 3 XLSX
4. Missing document suggestions (based on what's present)
5. 4-5 suggested questions (context-aware, not hardcoded)

STORAGE:
CREATE TABLE IF NOT EXISTS dataroom_insights (
    id TEXT PRIMARY KEY,
    dataroom_id TEXT NOT NULL,
    insight_type TEXT NOT NULL,
    content TEXT NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stale BOOLEAN DEFAULT 0,
    FOREIGN KEY (dataroom_id) REFERENCES datarooms(id) ON DELETE CASCADE
);

STALENESS: When files are added/removed/moved, mark existing insights as stale.
Regenerate on next copilot open or user request.
```

---

## File Summary Cache

```
WHEN: During indexing, after chunking/embedding

HOW: Send first 2000 chars to Gemini (via Express):
     "Summarize this document in 2-3 sentences. Be specific about names, numbers, dates."
     Store in files table: ai_summary column

COST: ~$0.0003 per file (trivial)

WHY IT MATTERS:
  "Summarize this DataRoom" → read cached ai_summary from all files → combine → instant
  "What's in this file?" → return cached ai_summary → no Gemini call
  DataRoom audit → use cached summaries → faster and cheaper
```

---

## Entity Extraction (Domain-Agnostic)

```
WHEN: During indexing pipeline, after embedding

PROMPT:
"Extract all notable entities from this document. Return JSON only, no markdown:
{
  'organizations': [],
  'people': [],
  'monetary_values': [],
  'dates': [],
  'locations': [],
  'key_terms': []
}
Do NOT assume any industry. Extract what's actually in the document."

STORAGE:
CREATE TABLE IF NOT EXISTS file_entities (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    dataroom_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_value TEXT NOT NULL,
    context TEXT,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

---

## General Purpose Design

The copilot works for ANY domain — legal, finance, HR, medical, academic, engineering, personal.
Domain-specific modes are OPTIONAL enhancements the user selects.

### System Prompt
```
You are Orvyn Copilot, an intelligent AI assistant for document management and analysis.

You help users understand, search, analyze, and extract information from their documents.
You work with any type of document in any domain: business, legal, financial, medical,
academic, personal, HR, operations, engineering, research, or any other field.

RULES:
1. Answer based ONLY on the provided document excerpts. Never make up information.
2. Always cite sources using [Source: filename] format.
3. If you cannot find the answer, say clearly: "I couldn't find this in your documents."
4. Be precise with numbers, dates, names — quote them exactly as they appear.
5. Note any inconsistencies between documents.
6. Adapt your analysis style to the document domain (legal docs get legal analysis,
   financial docs get financial analysis, technical docs get technical analysis).
7. When summarizing, provide structured summaries with key points.
8. Suggest relevant follow-up questions the user might want to ask.
```

### Audit Types (General + Domain-Specific)
```
GENERAL AUDIT (default — works for everything):
  - Overview of DataRoom contents
  - Organization quality assessment
  - Completeness check (are there gaps?)
  - Consistency check (do documents agree?)
  - Suggestions for improvement

DOMAIN-SPECIFIC AUDITS (user selects):
  - Fundraising: cap table, pitch deck, financials, term sheet, IP...
  - Legal: contracts, compliance, governance, NDAs, IP protection...
  - Financial: revenue consistency, projections, expenses, unit economics...
  - Compliance: regulatory filings, certifications, data privacy...
  - HR: employee agreements, offer letters, policies, org chart...
  - Technical: architecture docs, API specs, security audits, test coverage...
  - Academic: research papers, citations, data sets, methodology...
  - Real Estate: deeds, permits, inspections, leases, appraisals...
  - Medical: patient records, lab results, prescriptions, referrals...
  - Custom: user describes what to audit for
```

### Simulation Roles (General + Domain-Specific)
```
GENERAL ROLES:
  - Critical Reviewer: "Find weaknesses and gaps"
  - Compliance Officer: "Check for regulatory issues"
  - New Employee: "Explain this DataRoom to me as if I'm new"
  - External Auditor: "Review for completeness and accuracy"

DOMAIN-SPECIFIC ROLES:
  - VC Partner (fundraising)
  - Legal Counsel (contracts/legal)
  - Board Member (governance)
  - Tax Auditor (financial)
  - HR Director (people docs)
  - Technical Lead (engineering docs)
  - Custom: user describes the role
```

### Suggested Questions — Context-Aware, Not Hardcoded
```python
prompt = f"""
Given a DataRoom with these folders: {folder_names}
And these file types: {file_types_summary}
And these file names: {file_names[:20]}

Generate 4 useful questions a user might ask about these documents.
Questions should be specific to the ACTUAL content, not generic.
Do NOT assume any specific industry or domain.
Return JSON array of 4 strings.
"""
```

This means:
- DataRoom with resumes → "Which candidates have Python experience?"
- DataRoom with contracts → "When do these contracts expire?"
- DataRoom with research → "What methodologies are used across papers?"
- DataRoom with financials → "What's the revenue trend?"

### UI Labels (Neutral Language)
- "Role Simulation" (not "Investor Simulation")
- "DataRoom Audit" (not "Fundraising Audit")
- "AI Review" (not "VC Review")

---

## Gemini Function Calling Tools

```python
COPILOT_TOOLS = [
    {
        "name": "search_documents",
        "description": "Search for information across documents using semantic and keyword search",
        "parameters": {
            "query": {"type": "string", "description": "What to search for"},
            "scope_type": {"type": "string", "enum": ["file","folder","dataroom","global"]},
            "scope_ids": {"type": "array", "description": "IDs to scope the search"},
            "search_type": {"type": "string", "enum": ["hybrid","semantic","keyword"], "default": "hybrid"}
        }
    },
    {
        "name": "get_file_content",
        "description": "Get the full extracted text content of a specific file",
        "parameters": { "file_id": {"type": "string"} }
    },
    {
        "name": "summarize_dataroom",
        "description": "Get a summary of a DataRoom's contents, structure, and key information",
        "parameters": { "dataroom_id": {"type": "string"} }
    },
    {
        "name": "compare_documents",
        "description": "Compare two or more documents for differences, inconsistencies, or similarities",
        "parameters": {
            "file_ids": {"type": "array", "description": "List of file IDs to compare"},
            "comparison_focus": {"type": "string", "description": "What to compare: numbers, terms, dates, general"}
        }
    },
    {
        "name": "extract_data_point",
        "description": "Extract a specific piece of data (number, name, date, amount) from documents",
        "parameters": {
            "query": {"type": "string", "description": "What data to extract"},
            "dataroom_id": {"type": "string"}
        }
    },
    {
        "name": "list_files_in_dataroom",
        "description": "List all files in a DataRoom with their types, sizes, and folders",
        "parameters": {
            "dataroom_id": {"type": "string"},
            "folder_id": {"type": "string", "description": "Optional: specific folder"}
        }
    },
    {
        "name": "find_similar_documents",
        "description": "Find documents similar to a given document across all DataRooms",
        "parameters": {
            "file_id": {"type": "string"},
            "max_results": {"type": "integer", "default": 5}
        }
    },
    {
        "name": "get_entities",
        "description": "Get extracted entities (organizations, people, amounts, dates) from a file or DataRoom",
        "parameters": {
            "scope_type": {"type": "string", "enum": ["file", "dataroom"]},
            "scope_id": {"type": "string"}
        }
    },
    {
        "name": "audit_dataroom",
        "description": "Perform a comprehensive audit/review of a DataRoom",
        "parameters": {
            "dataroom_id": {"type": "string"},
            "audit_type": {"type": "string", "enum": ["general","fundraising","legal","financial","compliance","hr","technical","academic","custom"]}
        }
    }
]
```

---

## Environment Configuration

### python-backend/.env (NO GEMINI KEY — Express owns it)
```env
# === EXISTING (don't change) ===
PORT=8000
DATABASE_DIR=

# === RAG CONFIGURATION ===
RAG_CHUNK_SIZE_CHARS=3750
RAG_CHUNK_OVERLAP_CHARS=750
RAG_MAX_CHUNKS_PER_QUERY=8
RAG_CONFIDENCE_THRESHOLD=0.3
RAG_MAX_RETRIEVAL_RESULTS=200

# === COPILOT CONFIGURATION ===
COPILOT_MAX_CHAT_HISTORY=10
COPILOT_MAX_TOOL_ROUNDS=3
COPILOT_EMBEDDING_BATCH_SIZE=50
COPILOT_SUMMARY_MAX_CHARS=2000
COPILOT_MAX_CONTEXT_TOKENS=8000
COPILOT_MAX_MESSAGE_LENGTH=10000

# === INDEXING CONFIGURATION ===
INDEX_AUTO_ON_CLASSIFY=true
INDEX_EXTRACT_ENTITIES=true
INDEX_GENERATE_SUMMARY=true
INDEX_MAX_RETRY_ATTEMPTS=3
```

### express-backend/.env (add to existing — owns ALL Gemini config)
```env
# === EXISTING (don't change) ===
# ... auth secrets, MongoDB, GEMINI_API_KEY ...

# === Chat model (NEW for V1-new feature) ===
GEMINI_CHAT_MODEL=gemini-2.5-flash
GEMINI_CHAT_TEMPERATURE=0.3
GEMINI_CHAT_MAX_OUTPUT_TOKENS=4096

# === Embedding model (NEW for V1-new feature) ===
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=3072
```

### electron/.env (add to existing)
```env
# === COPILOT (new) ===
COPILOT_PANEL_DEFAULT_WIDTH=380
COPILOT_PANEL_MIN_WIDTH=320
COPILOT_PANEL_MAX_WIDTH=600
```

---

## New Database Schema — Complete

### New Tables

```sql
-- Background indexing job queue
CREATE TABLE IF NOT EXISTS indexing_jobs (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    dataroom_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- File chunks for FTS5 keyword search
CREATE TABLE IF NOT EXISTS file_chunks (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    dataroom_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- FTS5 virtual table + sync triggers (content= mode requires manual sync)
CREATE VIRTUAL TABLE IF NOT EXISTS file_chunks_fts USING fts5(
    chunk_text,
    file_id UNINDEXED,
    dataroom_id UNINDEXED,
    chunk_index UNINDEXED,
    content='file_chunks'
);

CREATE TRIGGER IF NOT EXISTS file_chunks_ai AFTER INSERT ON file_chunks BEGIN
    INSERT INTO file_chunks_fts(rowid, chunk_text, file_id, dataroom_id, chunk_index)
    VALUES (new.rowid, new.chunk_text, new.file_id, new.dataroom_id, new.chunk_index);
END;

CREATE TRIGGER IF NOT EXISTS file_chunks_ad AFTER DELETE ON file_chunks BEGIN
    INSERT INTO file_chunks_fts(file_chunks_fts, rowid, chunk_text, file_id, dataroom_id, chunk_index)
    VALUES ('delete', old.rowid, old.chunk_text, old.file_id, old.dataroom_id, old.chunk_index);
END;

CREATE TRIGGER IF NOT EXISTS file_chunks_au AFTER UPDATE ON file_chunks BEGIN
    INSERT INTO file_chunks_fts(file_chunks_fts, rowid, chunk_text, file_id, dataroom_id, chunk_index)
    VALUES ('delete', old.rowid, old.chunk_text, old.file_id, old.dataroom_id, old.chunk_index);
    INSERT INTO file_chunks_fts(rowid, chunk_text, file_id, dataroom_id, chunk_index)
    VALUES (new.rowid, new.chunk_text, new.file_id, new.dataroom_id, new.chunk_index);
END;

-- Chat sessions (no user_id — SQLite DB is already per-user)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_ids TEXT,
    scope_name TEXT,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources TEXT,
    tool_calls TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- DataRoom auto-insights
CREATE TABLE IF NOT EXISTS dataroom_insights (
    id TEXT PRIMARY KEY,
    dataroom_id TEXT NOT NULL,
    insight_type TEXT NOT NULL,
    content TEXT NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stale BOOLEAN DEFAULT 0,
    FOREIGN KEY (dataroom_id) REFERENCES datarooms(id) ON DELETE CASCADE
);

-- Entity extraction
CREATE TABLE IF NOT EXISTS file_entities (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    dataroom_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_value TEXT NOT NULL,
    context TEXT,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

### New Columns on Existing `files` Table

```sql
ALTER TABLE files ADD COLUMN ai_summary TEXT;
ALTER TABLE files ADD COLUMN embedding_status TEXT DEFAULT 'none';
ALTER TABLE files ADD COLUMN content_checksum TEXT;
ALTER TABLE files ADD COLUMN embedding_model TEXT;
ALTER TABLE files ADD COLUMN indexed_file_size INTEGER;     -- file size in bytes at time of indexing
ALTER TABLE files ADD COLUMN indexed_file_mtime REAL;       -- OS modified timestamp at time of indexing
```

---

## Vector & DB Sync on File/Folder Operations (CRITICAL)

Every file/folder operation that changes state MUST update ChromaDB + FTS5 + entities + insights.

```
FILE OPERATION                       VECTOR/DB ACTION
───────────────────────────────────  ──────────────────────────────────────────

Rename file                          Update file_name in ChromaDB metadata (all chunks)
(file:rename — renames display       Update original_name in files table
 name AND on disk)                   Update original_path if disk name changed
                                     No FTS5 text change (content unchanged)
                                     No entity change

Remove from Orvyn                  Delete embeddings from ChromaDB
(file:remove-from-Orvyn)           Delete chunks from file_chunks (FTS5)
                                     Delete entities from file_entities
                                     Delete indexing_jobs for this file
                                     Mark dataroom_insights as stale
                                     Clear ai_summary, reset embedding_status='none'

Delete from System                   Same as Remove from Orvyn
(file:delete-from-system)            PLUS: delete physical file from disk
                                     PLUS: delete file record from files table

Mark-to-Move between folders         Update folder_id in ChromaDB metadata
(same DataRoom)                      No FTS5 change (content unchanged)
                                     No entity change
                                     Mark dataroom_insights stale (folder counts)

Mark-to-Move between DataRooms       Update dataroom_id in ChromaDB metadata
                                     Update folder_id in ChromaDB metadata
                                     Update dataroom_id in file_chunks (FTS5)
                                     Update dataroom_id in file_entities
                                     Update indexing_jobs if any pending
                                     Mark OLD dataroom insights stale
                                     Mark NEW dataroom insights stale

File relocated                       NO vector change (if file unchanged)
(file:relocate)                      Update original_path in files table
                                     Run TRIPLE-CHECK: compare current file_size +
                                       file_mtime + content_checksum vs stored values.
                                       If ANY differ → file has changed externally:
                                       → Delete old embeddings
                                       → Create new indexing_job (re-embed)
                                     Fast path: size or mtime mismatch = changed
                                       (skip expensive text extraction + checksum)
                                     Slow path: size+mtime match but checksum differs

Rename folder                        No vector change (folder name not in embeddings)
(folder:rename)                      Update name in folders table only

Edit folder description              No vector change
(folder:update-context)              Update context in folders table
                                     Mark dataroom_insights stale

Delete folder — Remove files         For EACH file in folder (+ all nested subfolders):
from Orvyn                           Delete embeddings from ChromaDB
                                       Delete chunks from file_chunks
                                       Delete entities from file_entities
                                       Delete indexing_jobs
                                       Clear ai_summary, reset embedding_status
                                       Delete file record from files table
                                     Delete all nested subfolders
                                     Delete the folder itself
                                     Mark dataroom_insights stale
                                     Files STAY on disk

Delete folder — Delete files         Same as above
from System                          PLUS: delete each physical file from disk

DataRoom deleted                     Delete ALL embeddings for DataRoom from ChromaDB
(dataroom:delete)                    Delete ALL chunks from file_chunks
                                     Delete ALL entities from file_entities
                                     Delete ALL insights from dataroom_insights
                                     Delete ALL indexing_jobs for this DataRoom
                                     Delete ALL chat sessions scoped to this DataRoom
                                     Delete ALL files + folders records

File not found on disk               NO vector change
(original_path missing)              Vectors still valid for search/chat
                                     User can still ask about the file content
                                     Only "Open" file operations fail
```

### Sync Functions

```python
def sync_file_renamed(file_id, new_name, user_id, chroma_path):
    """Called when file is renamed"""
    collection = get_chroma_collection(user_id, chroma_path)
    results = collection.get(where={"file_id": file_id})
    if results['ids']:
        for i, chunk_id in enumerate(results['ids']):
            new_meta = results['metadatas'][i].copy()
            new_meta['file_name'] = new_name
            collection.update(ids=[chunk_id], metadatas=[new_meta])

def sync_file_removed(file_id, user_id, dataroom_id, chroma_path, db_session):
    """Called when file removed from Orvyn or deleted from system"""
    delete_file_embeddings(file_id, user_id, chroma_path)
    db_session.execute(text("DELETE FROM file_chunks WHERE file_id = :fid"), {"fid": file_id})
    db_session.execute(text("DELETE FROM file_entities WHERE file_id = :fid"), {"fid": file_id})
    db_session.execute(text("DELETE FROM indexing_jobs WHERE file_id = :fid"), {"fid": file_id})
    db_session.execute(text(
        "UPDATE dataroom_insights SET stale = 1 WHERE dataroom_id = :did"
    ), {"did": dataroom_id})
    db_session.commit()

def sync_file_moved_folder(file_id, new_folder_id, user_id, dataroom_id, chroma_path, db_session):
    """Called when file moves to different folder (same DataRoom)"""
    collection = get_chroma_collection(user_id, chroma_path)
    results = collection.get(where={"file_id": file_id})
    if results['ids']:
        for i, chunk_id in enumerate(results['ids']):
            new_meta = results['metadatas'][i].copy()
            new_meta['folder_id'] = new_folder_id or "unclassified"
            collection.update(ids=[chunk_id], metadatas=[new_meta])
    db_session.execute(text(
        "UPDATE dataroom_insights SET stale = 1 WHERE dataroom_id = :did"
    ), {"did": dataroom_id})
    db_session.commit()

def sync_file_moved_dataroom(file_id, old_dataroom_id, new_dataroom_id,
                              new_folder_id, user_id, chroma_path, db_session):
    """Called when file moves between DataRooms"""
    collection = get_chroma_collection(user_id, chroma_path)
    results = collection.get(where={"file_id": file_id})
    if results['ids']:
        for i, chunk_id in enumerate(results['ids']):
            new_meta = results['metadatas'][i].copy()
            new_meta['dataroom_id'] = new_dataroom_id
            new_meta['folder_id'] = new_folder_id or "unclassified"
            collection.update(ids=[chunk_id], metadatas=[new_meta])
    db_session.execute(text(
        "UPDATE file_chunks SET dataroom_id = :new WHERE file_id = :fid"
    ), {"new": new_dataroom_id, "fid": file_id})
    db_session.execute(text(
        "UPDATE file_entities SET dataroom_id = :new WHERE file_id = :fid"
    ), {"new": new_dataroom_id, "fid": file_id})
    db_session.execute(text(
        "UPDATE dataroom_insights SET stale = 1 WHERE dataroom_id IN (:old, :new)"
    ), {"old": old_dataroom_id, "new": new_dataroom_id})
    db_session.commit()

def sync_folder_deleted(folder_id, dataroom_id, all_nested_file_ids,
                         user_id, chroma_path, db_session, delete_from_system=False):
    """Called when folder is deleted — handles all nested files recursively"""
    for fid in all_nested_file_ids:
        sync_file_removed(fid, user_id, dataroom_id, chroma_path, db_session)
    # Folder + subfolder record deletion handled by CASCADE or explicit DELETE

def sync_dataroom_deleted(dataroom_id, user_id, chroma_path, db_session):
    """Called when entire DataRoom is deleted"""
    delete_dataroom_embeddings(dataroom_id, user_id, chroma_path)
    db_session.execute(text("DELETE FROM file_chunks WHERE dataroom_id = :did"), {"did": dataroom_id})
    db_session.execute(text("DELETE FROM file_entities WHERE dataroom_id = :did"), {"did": dataroom_id})
    db_session.execute(text("DELETE FROM dataroom_insights WHERE dataroom_id = :did"), {"did": dataroom_id})
    db_session.execute(text("DELETE FROM indexing_jobs WHERE dataroom_id = :did"), {"did": dataroom_id})
    # Use json_each() for safe matching — LIKE '%id%' could false-match substring IDs
    db_session.execute(text("""
        DELETE FROM chat_sessions
        WHERE scope_type IN ('dataroom', 'multi_dataroom')
        AND EXISTS (SELECT 1 FROM json_each(scope_ids) WHERE json_each.value = :did)
    """), {"did": dataroom_id})
    db_session.commit()

def has_file_changed(file_record, file_path: str) -> bool:
    """Triple-check: size + mtime + checksum. Returns True if ANY differ.
    Fast checks first (stat only), expensive check last (full text extraction)."""
    import os
    stat = os.stat(file_path)

    # Fast check 1: file size
    if stat.st_size != file_record.indexed_file_size:
        return True

    # Fast check 2: OS modified time
    if stat.st_mtime != file_record.indexed_file_mtime:
        return True

    # Slow check 3: content hash (only if size+mtime both match)
    current_text = extract_text(file_path)  # uses existing extraction pipeline
    current_checksum = compute_content_hash(current_text)
    if current_checksum != file_record.content_checksum:
        return True

    return False

def sync_file_content_changed(file_id, dataroom_id, user_id, chroma_path, db_session):
    """Called when has_file_changed() returns True on relocate"""
    sync_file_removed(file_id, user_id, dataroom_id, chroma_path, db_session)
    create_indexing_job(file_id, dataroom_id, db_session)
```

### Where to Call Sync Functions (Existing Endpoints)

```
ENDPOINT                                 CALL THIS
─────────────────────────────────────── ─────────────────────────────────
PUT  /api/v1/files/{id}/rename           sync_file_renamed()
DELETE /api/v1/files/{id}                sync_file_removed()
PUT  /api/v1/files/{id}/move-to-folder   sync_file_moved_folder()
PUT  /api/v1/files/{id}/relocate         has_file_changed() → sync_file_content_changed() if True
DELETE /api/v1/folders/{id}              sync_folder_deleted() with all nested file IDs
DELETE /api/v1/datarooms/{id}            sync_dataroom_deleted()
```

---

## Streaming Architecture (SSE) + Tool Call Continuation

```
React: dispatch sendMessage("What's in my documents?")
  │ (IPC invoke)
  ▼
Electron (copilotHandlers.js):
  Step 1: Express POST /api/v1/ai/embed → get query vector
  Step 2: Python POST /api/v1/copilot/search → hybrid search with vector + text
  Step 3: Express POST /api/v1/ai/chat/stream → Gemini streaming
          Read SSE stream:
            'chunk'     → IPC 'copilot:stream-chunk' to React
            'tool_call' → Express CLOSES stream. Electron executes tool.
                          Then makes a NEW /api/v1/ai/chat/stream call
                          with tool result appended to message history.
                          Max 3 rounds. (See "Tool Call Loop" below.)
            'error'     → IPC 'copilot:stream-error' to React
            'end'       → IPC 'copilot:stream-end' to React
  Step 4: Python POST /api/v1/copilot/save-message → persist
  │
  ▼
React: copilotSlice renders tokens word-by-word in real-time
```

### Tool Call Loop — The Full Specification

This is the trickiest part. When Gemini decides it needs a tool, the flow is:

```
ROUND 1:
  Electron → Express: POST /api/v1/ai/chat/stream
    body: { system_prompt, messages: [...history, user_msg], tools, tool_config }
  
  Express streams tokens to Electron...
  Gemini decides it needs search_documents tool...
  Express sends: data: {"type":"tool_call","name":"search_documents","args":{...}}
  Express sends: data: {"type":"tool_call_stop"}
  Express CLOSES the stream (res.end()).
  Express does NOT keep the connection open.

  Electron receives tool_call_stop:
    1. Execute tool via Python:
       POST /api/v1/copilot/tool/search → { results }
    2. Append to message history:
       messages.push({ role: "model", parts: [{ functionCall: { name, args } }] })
       messages.push({ role: "user", parts: [{ functionResponse: { name, response: results } }] })
    3. Make a NEW request to Express (round 2):

ROUND 2:
  Electron → Express: POST /api/v1/ai/chat/stream
    body: { system_prompt, messages: [...original + tool_call + tool_result], tools, tool_config }
  
  Express streams tokens...
  If Gemini needs another tool → repeat (round 3)
  If Gemini is done → sends text chunks + type: "end"
  Express CLOSES the stream.

ROUND 3 (max):
  Same as round 2. If Gemini still wants tools after round 3,
  Electron sends a final message: "Please answer with the information you have."
  without tools enabled, forcing a text response.
```

**Why this approach (new request per tool call):**
- Express stays stateless — no WebSocket, no held connections, no server-side state
- Each call is a clean HTTP request with full message history
- Easy to debug — each round is a self-contained request/response
- Works with Express's existing Bearer token auth
- Gemini's function calling expects the tool result in the next `contents` message anyway

**What React sees during tool calls:**
- Stream chunks arrive → displayed word-by-word
- Tool call happens → React sees a brief pause (show "Searching documents..." reasoning step)
- Next round starts → more chunks arrive → displayed seamlessly
- To React it looks like one continuous stream with a thinking pause

### Express Streaming Implementation
```javascript
async function chatStream(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    const { system_prompt, messages, tools, tool_config } = req.body;
    try {
        const response = await model.generateContentStream({
            systemInstruction: system_prompt,
            contents: messages,
            tools: tools || undefined,
            toolConfig: tool_config || undefined,
        });
        let hasToolCall = false;
        for await (const chunk of response.stream) {
            if (chunk.text()) {
                res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk.text() })}\n\n`);
            }
            if (chunk.functionCalls?.length) {
                hasToolCall = true;
                for (const call of chunk.functionCalls) {
                    res.write(`data: ${JSON.stringify({
                        type: 'tool_call', name: call.name, args: call.args
                    })}\n\n`);
                }
            }
        }
        if (hasToolCall) {
            // Signal Electron to execute tool and make a new request
            res.write(`data: ${JSON.stringify({ type: 'tool_call_stop' })}\n\n`);
        } else {
            // Normal end — Gemini is done
            res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
        }
    } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    }
    res.end();
}
```

### Electron Stream Reader (with tool call loop)
```javascript
ipcMain.handle('copilot:send-message', async (event, data) => {
    activeStreamController = new AbortController();

    // Step 1: Embed query
    const { vectors } = await expressService.embed([data.message]);
    const queryVector = vectors[0];

    // Step 2: Hybrid search
    const searchResults = await pythonService.copilotSearch({
        query_vector: queryVector,
        query_text: data.message,
        ...data  // scope_type, scope_ids, session_id, etc.
    });

    // Step 3: Stream with tool call loop
    let messages = buildMessages(searchResults.chunks, searchResults.history, data.message);
    let fullText = '';
    let allToolCalls = [];
    const maxRounds = 3;

    for (let round = 0; round < maxRounds; round++) {
        const isLastRound = (round === maxRounds - 1);
        const streamResult = await streamFromExpress(event, {
            system_prompt: buildSystemPrompt(),
            messages,
            // On last round: no tools, force text response
            tools: isLastRound ? undefined : COPILOT_TOOLS,
            tool_config: isLastRound ? undefined : { mode: 'AUTO' }
        });

        fullText += streamResult.text;

        if (streamResult.toolCalls.length === 0) {
            // Gemini is done — send final event to React
            event.sender.send('copilot:stream-end', {
                sources: searchResults.sources,
                session_id: searchResults.session_id
            });
            break;
        }

        // Tool call(s) — execute via Python, then loop
        for (const tc of streamResult.toolCalls) {
            allToolCalls.push(tc);
            event.sender.send('copilot:stream-reasoning', {
                step: `Using ${tc.name}...`
            });

            const toolResult = await executeTool(tc.name, tc.args);

            // Append tool call + result to message history for next round
            messages.push({
                role: 'model',
                parts: [{ functionCall: { name: tc.name, args: tc.args } }]
            });
            messages.push({
                role: 'user',
                parts: [{ functionResponse: { name: tc.name, response: toolResult } }]
            });
        }
        // Loop continues → next round makes a new Express call with updated messages
    }

    // Step 4: Save to SQLite
    await pythonService.copilotSaveMessage({
        session_id: searchResults.session_id,
        user_message: data.message,
        assistant_response: fullText,
        sources: JSON.stringify(searchResults.sources),
        tool_calls: JSON.stringify(allToolCalls)
    });

    // Generate title if first message
    if (!searchResults.session_title) {
        const { title } = await expressService.generateTitle(data.message);
        await pythonService.updateSessionTitle(searchResults.session_id, title);
    }
});

// Helper: stream one round from Express, return text + toolCalls
async function streamFromExpress(event, body) {
    const response = await fetch(`${expressUrl}/api/v1/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: activeStreamController.signal
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let toolCalls = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value);
        const lines = raw.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
            const parsed = JSON.parse(line.slice(6));
            switch (parsed.type) {
                case 'chunk':
                    text += parsed.text;
                    event.sender.send('copilot:stream-chunk', parsed);
                    break;
                case 'tool_call':
                    toolCalls.push({ name: parsed.name, args: parsed.args });
                    break;
                case 'tool_call_stop':
                    // Stream ended for this round, tool execution needed
                    break;
                case 'error':
                    event.sender.send('copilot:stream-error', parsed);
                    break;
                case 'end':
                    // Normal completion, no more rounds needed
                    break;
            }
        }
    }
    return { text, toolCalls };
}

// Helper: execute a tool via Python
async function executeTool(name, args) {
    const toolEndpoints = {
        'search_documents': '/api/v1/copilot/tool/search',
        'get_file_content': '/api/v1/copilot/tool/get-file-content',
        'list_files_in_dataroom': '/api/v1/copilot/tool/list-files',
        'get_entities': '/api/v1/copilot/tool/get-entities',
        'find_similar_documents': '/api/v1/copilot/tool/find-similar',
        'compare_documents': '/api/v1/copilot/tool/prepare-compare',
        'summarize_dataroom': '/api/v1/copilot/tool/prepare-summarize',
        'extract_data_point': '/api/v1/copilot/tool/prepare-extract',
        'audit_dataroom': '/api/v1/copilot/tool/prepare-audit',
    };
    const endpoint = toolEndpoints[name];
    if (!endpoint) return { error: `Unknown tool: ${name}` };
    return await pythonService.post(endpoint, args);
}
```

### Preload Bridge
```javascript
onCopilotStreamChunk: (callback) => ipcRenderer.on('copilot:stream-chunk', callback),
offCopilotStreamChunk: (callback) => ipcRenderer.removeListener('copilot:stream-chunk', callback),
onCopilotStreamEnd: (callback) => ipcRenderer.on('copilot:stream-end', callback),
offCopilotStreamEnd: (callback) => ipcRenderer.removeListener('copilot:stream-end', callback),
onCopilotStreamError: (callback) => ipcRenderer.on('copilot:stream-error', callback),
offCopilotStreamError: (callback) => ipcRenderer.removeListener('copilot:stream-error', callback),
cancelCopilotStream: () => ipcRenderer.invoke('copilot:cancel-stream'),
```

### Cancel Stream
```javascript
ipcMain.handle('copilot:cancel-stream', async () => {
    if (activeStreamController) {
        activeStreamController.abort();
        activeStreamController = null;
    }
});
```

---

## Production Safety

### Token Explosion Protection
```python
MAX_CONTEXT_TOKENS = int(os.getenv("COPILOT_MAX_CONTEXT_TOKENS", "8000"))

def trim_chunks_to_token_limit(chunks, max_tokens=MAX_CONTEXT_TOKENS):
    total_chars = 0
    trimmed = []
    for chunk in chunks:
        chunk_chars = len(chunk['text'])
        if total_chars + chunk_chars > max_tokens * 4:
            break
        trimmed.append(chunk)
        total_chars += chunk_chars
    return trimmed
```

### User Message Size Limit
```python
MAX_MESSAGE_LENGTH = int(os.getenv("COPILOT_MAX_MESSAGE_LENGTH", "10000"))
```

### Section Numbers for Rich Citations
```python
# PDF: page_number from PyMuPDF per-page extraction
# DOCX: section_number from Heading paragraphs
# PPTX: page_number = slide number
# XLSX: section_name = sheet name

metadata = {
    "page_number": 14,
    "section_number": 3,
    "section_name": "Sheet1",
}
```

---

## New Express Endpoints (V1-new feature)

All require Bearer token authentication. Add to `express-backend/src/routes/ai.js`.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/ai/embed` | Batch embed texts via Gemini |
| `POST` | `/api/v1/ai/chat/stream` | Streaming chat via Gemini SSE |
| `POST` | `/api/v1/ai/chat` | Non-streaming chat fallback |
| `POST` | `/api/v1/ai/extract-entities` | Entity extraction via Gemini |
| `POST` | `/api/v1/ai/summarize-file` | File summary via Gemini |
| `POST` | `/api/v1/ai/generate-title` | Session title via Gemini |
| `POST` | `/api/v1/ai/audit` | Audit prompt + Gemini call |
| `POST` | `/api/v1/ai/simulate` | Simulation prompt + Gemini call |
| `POST` | `/api/v1/ai/generate-insights` | DataRoom insights via Gemini |
| `POST` | `/api/v1/ai/generate-suggestions` | Suggested questions via Gemini |

---

## New Python Endpoints (V1-new feature)

All under `/api/v1/`. Local data only — Python never calls Gemini.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/copilot/prepare-index` | Chunk files, compute checksums, detect duplicates |
| `POST` | `/api/v1/copilot/apply-index` | Store vectors in ChromaDB + chunks in FTS5 |
| `POST` | `/api/v1/copilot/apply-entities` | Store entities in file_entities |
| `POST` | `/api/v1/copilot/apply-summary` | Store ai_summary on file record |
| `POST` | `/api/v1/copilot/search` | Hybrid search (vector + keyword) |
| `POST` | `/api/v1/copilot/save-message` | Persist chat messages to SQLite |
| `POST` | `/api/v1/copilot/tool/search` | Tool: search_documents |
| `POST` | `/api/v1/copilot/tool/get-file-content` | Tool: get_file_content |
| `POST` | `/api/v1/copilot/tool/list-files` | Tool: list_files_in_dataroom |
| `POST` | `/api/v1/copilot/tool/get-entities` | Tool: get_entities |
| `POST` | `/api/v1/copilot/tool/find-similar` | Tool: find_similar_documents |
| `POST` | `/api/v1/copilot/prepare-audit` | Prepare audit data for Gemini |
| `POST` | `/api/v1/copilot/apply-audit` | Store audit result |
| `POST` | `/api/v1/copilot/prepare-insights` | Prepare insights data for Gemini |
| `POST` | `/api/v1/copilot/apply-insights` | Store insights in dataroom_insights |
| `POST` | `/api/v1/indexing/trigger` | Create indexing_jobs for files |
| `GET` | `/api/v1/indexing/status` | Get indexing status per DataRoom |
| `POST` | `/api/v1/indexing/retry-failed` | Reset failed jobs to pending |
| `POST` | `/api/v1/chat/sessions` | Create chat session |
| `GET` | `/api/v1/chat/sessions` | List sessions (optional scope filter) |
| `GET` | `/api/v1/chat/sessions/{id}/messages` | Get messages for session |
| `DELETE` | `/api/v1/chat/sessions/{id}` | Delete session + messages |
| `GET` | `/api/v1/chat/suggestions` | Get suggested questions |
| `GET` | `/api/v1/chat/insights` | Get DataRoom insights |

---

# BUILD PHASES — Copy-Pastable Claude Code Prompts

---

## PHASE C1 — Schema + Embedding Pipeline + Search + Sync Functions

**Layer:** `python-backend/` + `express-backend/`
**Estimated time:** 7-9 hours

Copy and paste this entire prompt into Claude Code:

```
Phase C1: Build the document intelligence pipeline for Orvyn Copilot.

READ CLAUDE.md FIRST. Follow every rule in it.

CRITICAL CONTEXT:
- GEMINI_API_KEY lives in express-backend/.env ONLY.
- Python NEVER calls Gemini directly. NEVER import google.generativeai in Python.
- All Gemini calls follow the V1 3-step pattern: Python prepares data →
  Express calls Gemini (holds API key) → Python applies results.
- Electron orchestrates the steps (wired in Phase C3, not now).
- This phase builds: Python data layer + Express AI proxy endpoints.
- All new endpoints MUST be under /api/v1/.
- Use the logger module (not print/console.*) in all new code.

=== STEP 1: INSTALL CHROMADB ===

Add to python-backend/requirements.txt: chromadb
Confirm with me before running pip install.

=== STEP 2: CREATE python-backend/app/services/embedding_service.py ===

CHROMADB SETUP:
- chromadb.PersistentClient(path=chroma_path)
- chroma_path comes from Electron (like db_path): {userData}/users/{userId}/chroma/
- Collection per user: "user_{user_id}" (get_or_create_collection)
- Do NOT configure a Gemini embedding function in ChromaDB — vectors come from Express

CHUNKING:
def chunk_text(text: str, chunk_size: int, overlap: int) -> list[dict]:
  - Read chunk_size from env RAG_CHUNK_SIZE_CHARS (default 3750, ~1000 tokens)
  - Read overlap from env RAG_CHUNK_OVERLAP_CHARS (default 750, ~200 tokens)
  - Split on paragraph boundaries (\n\n first, then \n, then by size)
  - Return: [{"text": "...", "index": 0}, ...]
  - For PDFs: track page_number per chunk (PyMuPDF per-page extraction)
  - For DOCX: track section_number based on Heading paragraphs
  - For PPTX: track page_number = slide number
  - For XLSX: track section_name = sheet name
  - Strip excessive whitespace
  - Handle edge: text < chunk_size → single chunk

CONTENT HASHING (Architectural Recommendation #1 + #5):
import hashlib

def compute_content_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

PREPARE INDEX (called by Electron in the 3-step flow):
def prepare_index(file_ids, dataroom_id, db_session) -> dict:
  For each file:
  - Read original_path, file_extension, original_name from SQLite
    (extracted_text is NOT read from DB — it's only a preview column)
  - RE-EXTRACT full text from the original file on disk using _extract_text()
    (lazy import from app.main to avoid circular imports)
  - If file not found at original_path: fail the indexing_job with
    error_message='FILE_NOT_FOUND', skip to next file
  - If extraction fails: fail the job with error_message='EXTRACTION_ERROR: {details}',
    skip to next file
  - Skip if extracted text is empty or placeholder ("[Image: ...]")
  - Capture preview_text = extracted_text[:3000] (for updating files.extracted_text)
  - Compute content_checksum via compute_content_hash() on FULL extracted text
  - Capture file_size_bytes and file_mtime via os.stat(original_path):
      stat = os.stat(original_path)
      file_size_bytes = stat.st_size
      file_mtime = stat.st_mtime
  - DUPLICATE DETECTION (Recommendation #5):
    Check if identical checksum exists for a different file with embedding_status='complete'.
    If yes: mark as duplicate, return the original_file_id.
  - Chunk the FULL text (not the truncated preview)
  - MEMORY MANAGEMENT: After chunking, free the full text: del extracted_text
    (a 100-page PDF can be 500KB-1MB+ of text; freeing prevents memory accumulation
    during sequential batch indexing)
  - Build metadata per chunk:
    {
      "file_id": file_id,
      "dataroom_id": dataroom_id,
      "file_name": original_name,
      "file_type": file_extension,
      "folder_id": folder_id or "unclassified",
      "chunk_index": i,
      "page_number": (PDF/PPTX),
      "section_number": (DOCX),
      "section_name": (XLSX),
      "checksum": content_checksum,           # Recommendation #1 — text integrity
      "file_size_bytes": file_size_bytes,      # Recommendation #1 — binary integrity
      "file_modified_at": file_mtime,          # Recommendation #1 — OS integrity
      "embedding_model": "pending",            # Set properly in apply_index
      "embedding_status": "processing"         # Recommendation #6 — filter in ChromaDB directly
    }
  Return: { files: [{ file_id, chunks, checksum, file_size_bytes, file_mtime,
                       is_duplicate, duplicate_of, preview_text, first_2000_chars }] }

APPLY INDEX (called by Electron after Express returns vectors):
def apply_index(file_id, dataroom_id, chunks, vectors, embedding_model,
                file_size_bytes, file_mtime,
                user_id, chroma_path, db_session,
                preview_text=None) -> dict:
  - Store in ChromaDB collection "user_{user_id}":
    ids: ["{file_id}_chunk_{i}" for each chunk]
    embeddings: vectors (from Express)
    documents: [chunk texts]
    metadatas: [chunk metadata with FINAL values]:
      embedding_model = actual model string      # Recommendation #4
      embedding_status = "complete"              # Recommendation #6
    NOTE: embedding_status is stored in ChromaDB metadata so vector_search
    can filter on it directly in one query — no need to pre-query SQLite.
  - Store in file_chunks table (for FTS5 keyword search)
  - FTS5 syncs automatically via triggers — just INSERT into file_chunks, do NOT touch file_chunks_fts
  - Update files table:
    embedding_status = 'complete'          # Recommendation #3
    content_checksum = checksum            # Recommendation #1
    embedding_model = embedding_model      # Recommendation #4
    indexed_file_size = file_size_bytes    # Recommendation #1 — triple-check
    indexed_file_mtime = file_mtime        # Recommendation #1 — triple-check
    extracted_text = preview_text          # If preview_text provided — keeps preview
                                           # in sync with the same extraction pass as chunks
  - Update indexing_jobs: status = 'complete'
  - Return: { chunks_indexed: N, status: "success" }

VECTOR SEARCH:
def vector_search(query_vector, user_id, chroma_path,
                  dataroom_id=None, file_ids=None, folder_id=None,
                  n_results=8) -> list[dict]:
  - query_vector is generated by Express, passed in by Electron
  - Build where_filter combining scope + embedding_status:
    Always include: {"embedding_status": "complete"}   # Recommendation #3 + #6
    dataroom_id → {"$and": [{"dataroom_id": id}, {"embedding_status": "complete"}]}
    file_ids → {"$and": [{"file_id": {"$in": ids}}, {"embedding_status": "complete"}]}
    folder_id → {"$and": [{"folder_id": id}, {"embedding_status": "complete"}]}
    global → {"embedding_status": "complete"}
  - NOTE (Recommendation #6): embedding_status is stored IN ChromaDB metadata,
    so this is a single ChromaDB query — no need to pre-query SQLite for complete file_ids.
  - Query ChromaDB with query_embeddings=[query_vector]
  - NORMALIZE scores: ChromaDB returns cosine distances (0=identical, 2=opposite).
    Convert to 0-1 similarity: score = 1 - (distance / 2)
  - Return: [{ text, file_id, file_name, dataroom_id, chunk_index, score, page_number }]

KEYWORD SEARCH (FTS5):
def keyword_search(query, db_session, dataroom_id=None, file_ids=None,
                   limit=8) -> list[dict]:
  - Use FTS5: SELECT fc.*, fts.rank FROM file_chunks_fts fts
    JOIN file_chunks fc ON fc.rowid = fts.rowid
    JOIN files f ON f.id = fc.file_id
    WHERE file_chunks_fts MATCH ? AND f.embedding_status = 'complete'
  - Apply scope filters
  - NORMALIZE scores: FTS5 BM25 rank is negative (more negative = more relevant).
    Convert to 0-1: score = 1 / (1 + abs(bm25_rank))
  - Return: [{ text, file_id, dataroom_id, chunk_index, score }]

HYBRID SEARCH:
def hybrid_search(query_vector, query_text, user_id, chroma_path, db_session,
                  dataroom_id=None, file_ids=None, folder_id=None,
                  n_results=8) -> list[dict]:
  - Run vector_search AND keyword_search (both return normalized 0-1 scores)
  - Build a dict keyed by (file_id, chunk_index)
  - For each chunk:
    - In BOTH results → combined_score = max(vector_score, keyword_score) * 1.5
    - In only one → combined_score = that score
  - Deduplicate, sort descending by combined_score
  - Return top n_results
  - Return: [{ text, file_id, file_name, dataroom_id, chunk_index, score, match_type }]
    match_type: "both" | "vector" | "keyword"

DELETE FUNCTIONS:
def delete_file_embeddings(file_id, user_id, chroma_path):
  - collection.delete(where={"file_id": file_id})

def delete_dataroom_embeddings(dataroom_id, user_id, chroma_path):
  - collection.delete(where={"dataroom_id": dataroom_id})

SYNC FUNCTIONS (called from EXISTING endpoints):

def sync_file_renamed(file_id, new_name, user_id, chroma_path):
    collection = get_chroma_collection(user_id, chroma_path)
    results = collection.get(where={"file_id": file_id})
    if results['ids']:
        for i, chunk_id in enumerate(results['ids']):
            new_meta = results['metadatas'][i].copy()
            new_meta['file_name'] = new_name
            collection.update(ids=[chunk_id], metadatas=[new_meta])

def sync_file_removed(file_id, user_id, dataroom_id, chroma_path, db_session):
    delete_file_embeddings(file_id, user_id, chroma_path)
    db_session.execute(text("DELETE FROM file_chunks WHERE file_id = :fid"), {"fid": file_id})
    db_session.execute(text("DELETE FROM file_entities WHERE file_id = :fid"), {"fid": file_id})
    db_session.execute(text("DELETE FROM indexing_jobs WHERE file_id = :fid"), {"fid": file_id})
    db_session.execute(text(
        "UPDATE dataroom_insights SET stale = 1 WHERE dataroom_id = :did"
    ), {"did": dataroom_id})
    db_session.commit()

def sync_file_moved_folder(file_id, new_folder_id, user_id, dataroom_id, chroma_path, db_session):
    collection = get_chroma_collection(user_id, chroma_path)
    results = collection.get(where={"file_id": file_id})
    if results['ids']:
        for i, chunk_id in enumerate(results['ids']):
            new_meta = results['metadatas'][i].copy()
            new_meta['folder_id'] = new_folder_id or "unclassified"
            collection.update(ids=[chunk_id], metadatas=[new_meta])
    db_session.execute(text(
        "UPDATE dataroom_insights SET stale = 1 WHERE dataroom_id = :did"
    ), {"did": dataroom_id})
    db_session.commit()

def sync_file_moved_dataroom(file_id, old_dataroom_id, new_dataroom_id,
                              new_folder_id, user_id, chroma_path, db_session):
    collection = get_chroma_collection(user_id, chroma_path)
    results = collection.get(where={"file_id": file_id})
    if results['ids']:
        for i, chunk_id in enumerate(results['ids']):
            new_meta = results['metadatas'][i].copy()
            new_meta['dataroom_id'] = new_dataroom_id
            new_meta['folder_id'] = new_folder_id or "unclassified"
            collection.update(ids=[chunk_id], metadatas=[new_meta])
    db_session.execute(text("UPDATE file_chunks SET dataroom_id = :new WHERE file_id = :fid"),
                       {"new": new_dataroom_id, "fid": file_id})
    db_session.execute(text("UPDATE file_entities SET dataroom_id = :new WHERE file_id = :fid"),
                       {"new": new_dataroom_id, "fid": file_id})
    db_session.execute(text(
        "UPDATE dataroom_insights SET stale = 1 WHERE dataroom_id IN (:old, :new)"
    ), {"old": old_dataroom_id, "new": new_dataroom_id})
    db_session.commit()

def sync_folder_deleted(folder_id, dataroom_id, all_nested_file_ids,
                         user_id, chroma_path, db_session):
    for fid in all_nested_file_ids:
        sync_file_removed(fid, user_id, dataroom_id, chroma_path, db_session)

def sync_dataroom_deleted(dataroom_id, user_id, chroma_path, db_session):
    delete_dataroom_embeddings(dataroom_id, user_id, chroma_path)
    db_session.execute(text("DELETE FROM file_chunks WHERE dataroom_id = :did"), {"did": dataroom_id})
    db_session.execute(text("DELETE FROM file_entities WHERE dataroom_id = :did"), {"did": dataroom_id})
    db_session.execute(text("DELETE FROM dataroom_insights WHERE dataroom_id = :did"), {"did": dataroom_id})
    db_session.execute(text("DELETE FROM indexing_jobs WHERE dataroom_id = :did"), {"did": dataroom_id})
    # json_each() for safe matching — avoids substring false-match with LIKE
    db_session.execute(text("""
        DELETE FROM chat_sessions
        WHERE scope_type IN ('dataroom', 'multi_dataroom')
        AND EXISTS (SELECT 1 FROM json_each(scope_ids) WHERE json_each.value = :did)
    """), {"did": dataroom_id})
    db_session.commit()

def has_file_changed(file_record, file_path: str) -> bool:
    """Triple-check: size + mtime + checksum. Returns True if ANY differ."""
    import os
    stat = os.stat(file_path)
    # Fast check 1: file size (no I/O beyond stat)
    if stat.st_size != file_record.indexed_file_size:
        return True
    # Fast check 2: OS modified time
    if stat.st_mtime != file_record.indexed_file_mtime:
        return True
    # Slow check 3: content hash (only runs if size+mtime both match)
    current_text = extract_text(file_path)
    current_checksum = compute_content_hash(current_text)
    if current_checksum != file_record.content_checksum:
        return True
    return False

def sync_file_content_changed(file_id, dataroom_id, user_id, chroma_path, db_session):
    """Called when has_file_changed() returns True on relocate"""
    sync_file_removed(file_id, user_id, dataroom_id, chroma_path, db_session)
    create_indexing_job(file_id, dataroom_id, db_session)

=== STEP 3: ADD NEW SQLITE TABLES + COLUMNS ===

Update /init-db in main.py to create these tables:

indexing_jobs:
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL (FK → files ON DELETE CASCADE),
  dataroom_id TEXT NOT NULL, status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0, error_message TEXT,
  created_at TIMESTAMP, updated_at TIMESTAMP

file_chunks:
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL (FK → files ON DELETE CASCADE),
  dataroom_id TEXT NOT NULL, chunk_index INTEGER, chunk_text TEXT

file_chunks_fts (FTS5 virtual table via raw SQL):
  chunk_text, file_id UNINDEXED, dataroom_id UNINDEXED,
  chunk_index UNINDEXED, content='file_chunks'

  CRITICAL: content='file_chunks' mode requires 3 manual sync triggers.
  Without these, FTS5 will be completely empty and keyword search returns nothing.
  Create these triggers IMMEDIATELY after the FTS5 virtual table:

  AFTER INSERT on file_chunks → INSERT into file_chunks_fts(rowid, chunk_text, file_id, ...)
  AFTER DELETE on file_chunks → INSERT into file_chunks_fts(file_chunks_fts, rowid, ...) VALUES('delete', ...)
  AFTER UPDATE on file_chunks → DELETE old row from fts, INSERT new row

  See the exact SQL in the "SQLite FTS5 Setup" section of the architecture guide.
  Because triggers handle FTS5 sync, the sync functions in embedding_service.py
  should only INSERT/DELETE on file_chunks — never touch file_chunks_fts directly.

chat_sessions:
  id TEXT PRIMARY KEY, scope_type TEXT NOT NULL,
  scope_ids TEXT, scope_name TEXT, title TEXT,
  created_at TIMESTAMP, updated_at TIMESTAMP

chat_messages:
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL (FK → chat_sessions ON DELETE CASCADE),
  role TEXT NOT NULL, content TEXT NOT NULL,
  sources TEXT, tool_calls TEXT, created_at TIMESTAMP

dataroom_insights:
  id TEXT PRIMARY KEY, dataroom_id TEXT NOT NULL (FK → datarooms ON DELETE CASCADE),
  insight_type TEXT NOT NULL, content TEXT NOT NULL,
  generated_at TIMESTAMP, stale BOOLEAN DEFAULT 0

file_entities:
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL (FK → files ON DELETE CASCADE),
  dataroom_id TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_value TEXT NOT NULL, context TEXT

New columns on existing files table:
  ai_summary TEXT
  embedding_status TEXT DEFAULT 'none'
  content_checksum TEXT
  embedding_model TEXT
  indexed_file_size INTEGER              -- file size in bytes at time of indexing
  indexed_file_mtime REAL                -- OS modified timestamp at time of indexing

=== STEP 4: UPDATE EXISTING ENDPOINTS TO CALL SYNC FUNCTIONS ===

This is critical. Wire sync calls into these existing Python endpoints:

PUT /api/v1/files/{id}/rename → call sync_file_renamed()
DELETE /api/v1/files/{id} → call sync_file_removed()
  (handles both remove-from-Orvyn and delete-from-system)
PUT /api/v1/files/{id}/move-to-folder → call sync_file_moved_folder()
PUT /api/v1/files/{id}/relocate → call has_file_changed(file_record, new_path).
  Uses triple-check: file_size + mtime + checksum (fast checks first, expensive last).
  If True → call sync_file_content_changed()
DELETE /api/v1/folders/{id} → collect ALL nested file IDs (recursive),
  call sync_folder_deleted() with the full list.
  The endpoint already supports two modes (remove files from Orvyn vs delete from system).
  Both modes must call sync_folder_deleted().
DELETE /api/v1/datarooms/{id} → call sync_dataroom_deleted()

=== STEP 5: ADD NEW PYTHON ENDPOINTS ===

POST /api/v1/copilot/prepare-index
POST /api/v1/copilot/apply-index
POST /api/v1/copilot/apply-entities
POST /api/v1/copilot/apply-summary
POST /api/v1/copilot/search (accepts query_vector + query_text, runs hybrid search)
POST /api/v1/copilot/save-message
POST /api/v1/indexing/trigger
GET  /api/v1/indexing/status?dataroom_id=...
POST /api/v1/indexing/retry-failed
POST /api/v1/chat/sessions
GET  /api/v1/chat/sessions?scope_type=...&scope_id=...
GET  /api/v1/chat/sessions/{id}/messages
DELETE /api/v1/chat/sessions/{id}

=== STEP 6: ADD NEW EXPRESS ENDPOINTS ===

All require Bearer token authentication. Add to express-backend/src/routes/ai.js
or create a new route file.

POST /api/v1/ai/embed
  Body: { texts: string[] }
  Logic: Call Gemini embedding API (model from GEMINI_EMBEDDING_MODEL env).
  Batch: 50 texts per API call. Retry with exponential backoff on rate limits.
  Returns: { vectors: number[][] }

POST /api/v1/ai/extract-entities
  Body: { text: string }
  Logic: Call Gemini with entity extraction prompt (domain-agnostic).
  Prompt: "Extract all notable entities. Return JSON only, no markdown:
  { organizations, people, monetary_values, dates, locations, key_terms }
  Do NOT assume any industry."
  Returns: parsed entity JSON

POST /api/v1/ai/summarize-file
  Body: { text: string }
  Logic: Call Gemini: "Summarize this document in 2-3 sentences.
  Be specific about names, numbers, dates, key terms."
  Returns: { summary: string }

POST /api/v1/ai/generate-title
  Body: { message: string }
  Logic: Call Gemini: "Generate a concise 5-word title for a chat that
  starts with this message: {message}. Return ONLY the title, nothing else."
  Returns: { title: string }

All Express endpoints:
  - Read model config from env (GEMINI_CHAT_MODEL, GEMINI_EMBEDDING_MODEL, etc.)
  - Handle Gemini rate limits with exponential backoff
  - Use the existing winston logger
  - Update .env.example with new variables

=== STEP 7: HOOK INTO CLASSIFICATION PIPELINE ===

In existing apply-classify and apply-generate Python endpoints:
After classification succeeds, create indexing_jobs for each classified file:
  for file_id in classified_file_ids:
      create_indexing_job(file_id, dataroom_id, db_session)

def create_indexing_job(file_id, dataroom_id, db_session):
    job_id = str(uuid.uuid4())
    db_session.execute(text("""
        INSERT INTO indexing_jobs (id, file_id, dataroom_id, status)
        VALUES (:id, :fid, :did, 'pending')
    """), {"id": job_id, "fid": file_id, "did": dataroom_id})
    db_session.commit()

CRASH RECOVERY (Recommendation #2 extension):
If the app crashes while a job is status='processing', it stays stuck forever.
Add this function and call it during /init-db (or create a POST /api/v1/indexing/recover endpoint):

STALE_JOB_THRESHOLD_MINUTES = 10

def recover_stale_indexing_jobs(db_session):
    """Reset processing jobs older than 10 minutes back to pending."""
    db_session.execute(text("""
        UPDATE indexing_jobs
        SET status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'processing'
        AND updated_at < datetime('now', '-' || :threshold || ' minutes')
    """), {"threshold": STALE_JOB_THRESHOLD_MINUTES})
    db_session.commit()

Call recover_stale_indexing_jobs() inside the /init-db endpoint AFTER tables are created.
This means every app startup automatically unsticks crashed jobs.
Do NOT increment attempts on recovery — the crash was not the job's fault.

Also reset embedding_status for files whose jobs were recovered:
    UPDATE files SET embedding_status = 'pending'
    WHERE id IN (
        SELECT file_id FROM indexing_jobs
        WHERE status = 'pending' AND attempts > 0
    ) AND embedding_status = 'processing'

The actual indexing execution (3-step flow) is driven by Electron (Phase C3).
For now, just create the jobs and the recovery logic. Add an endpoint GET /api/v1/indexing/status
that returns counts: { total, pending, processing, complete, failed }.

PACKAGES: chromadb (Python only, confirm before installing)
NO OTHER PACKAGES without asking me.

ENV UPDATES:
- python-backend/.env.example: Add RAG_*, COPILOT_*, INDEX_* variables with defaults
- express-backend/.env.example: Add GEMINI_CHAT_MODEL, GEMINI_CHAT_TEMPERATURE,
  GEMINI_CHAT_MAX_OUTPUT_TOKENS, GEMINI_EMBEDDING_MODEL, GEMINI_EMBEDDING_DIMENSIONS

RULES:
- Python NEVER imports google.generativeai or calls any Gemini/LLM API
- chroma_path is passed from Electron like db_path
- Store chunks in BOTH ChromaDB AND file_chunks (for FTS5)
- Only query files with embedding_status='complete' (Recommendation #3)
- Store checksum + file_size + file_mtime + embedding_model in every chunk metadata (#1, #4)
- Detect duplicates via checksum before embedding (#5)
- Indexing jobs use SQLite queue, not fire-and-forget (#2)
- Stale processing jobs (>10 min) reset to pending on startup (#6 — crash recovery)
- All existing V1 endpoints must keep working exactly as before
- Use logger everywhere, no print() or console.*
```

**Done when:** Schema created. All sync functions wired into existing endpoints. Express can embed, extract entities, summarize. Python can chunk, store vectors, run hybrid search. Indexing jobs created after classification.

---

## PHASE C2 — Chat Engine + RAG + Tools + Audit + Insights

**Layer:** `python-backend/` + `express-backend/`
**Estimated time:** 7-9 hours

Copy and paste:

```
Phase C2: Build the copilot chat engine with RAG, function calling, audit, and insights.

READ CLAUDE.md FIRST. Follow every rule in it.

CONTEXT:
- Phase C1 is complete: ChromaDB + FTS5 + sync functions + Express AI proxy working
- hybrid_search() exists in embedding_service.py
- Chat tables exist in SQLite
- Express has /api/v1/ai/embed, /api/v1/ai/extract-entities, /api/v1/ai/summarize-file
- Python NEVER calls Gemini. Express owns the API key.

=== STEP 1: CREATE python-backend/app/services/chat_service.py ===

This service prepares data for Electron to orchestrate the chat flow.
It does NOT call Gemini.

PREPARE CHAT CONTEXT:
def prepare_chat_context(message, query_vector, session_id, scope_type,
                          scope_ids, scope_name, user_id, db_session, chroma_path) -> dict:
  a. If session_id is None: create new ChatSession in SQLite
  b. Run hybrid_search(query_vector, message, ...) with scope filters
  c. Fetch last 10 messages from session (COPILOT_MAX_CHAT_HISTORY from env)
  d. Trim chunks to token limit (COPILOT_MAX_CONTEXT_TOKENS from env)
  e. Format chunks as document excerpts:
     --- [Source: {file_name}, Page {page_number}] ---
     {chunk_text}
     --- end ---
  f. Return: {
       session_id, session_title (if existing), scope_name,
       formatted_chunks: string (the document excerpts block),
       raw_chunks: [...] (for source citations),
       history: [{ role, content }],
       sources: [{ file_id, file_name, chunk_text_preview (200 chars), relevance, page_number }]
     }

SAVE CHAT MESSAGES:
def save_chat_messages(session_id, user_message, assistant_response,
                        sources_json, tool_calls_json, db_session):
  - Insert user message (role='user')
  - Insert assistant message (role='assistant', sources, tool_calls)
  - Update session.updated_at

UPDATE SESSION TITLE:
def update_session_title(session_id, title, db_session):
  - UPDATE chat_sessions SET title = ? WHERE id = ?

=== STEP 2: CREATE python-backend/app/services/copilot_tools.py ===

These are called by Electron when Express/Gemini requests a tool.

def tool_search_documents(query_vector, query_text, scope_type, scope_ids,
                           user_id, db_session, chroma_path):
  - Calls hybrid_search
  - Returns formatted text of top results with source labels

def tool_get_file_content(file_id, db_session):
  - Fetch file metadata from SQLite
  - Read full content from file_chunks table (ordered by chunk_index)
  - Concatenate chunks with overlap-aware trimming via _concatenate_chunks():
    Chunks have ~750 char overlap. For each chunk after the first, skip the
    leading 700 chars (RAG_CHUNK_OVERLAP_CHARS - 50) to remove duplication
    while preserving a safety margin at paragraph boundaries.
  - Cap at 10000 chars for tool response (token budget)
  - Fallback to files.extracted_text preview if no chunks exist (file not yet indexed)

def tool_list_files(dataroom_id, folder_id, db_session):
  - Query files in scope
  - Return: [{ id, name, type, size, folder_name, ai_summary }]

def tool_get_entities(scope_type, scope_id, db_session):
  - Query file_entities table
  - Return grouped by entity_type

def tool_find_similar(file_id, representative_chunk_vector, user_id,
                      chroma_path, max_results=5):
  - Vector search across ALL DataRooms (no dataroom filter)
  - Exclude chunks from the same file
  - Return similar documents with scores

NOTE: compare_documents, summarize_dataroom, extract_data_point, and
audit_dataroom all need Gemini. For these, Python prepares the data,
Electron sends it to Express, Express calls Gemini. The tool implementation
in Python just prepares the input data.

def prepare_compare_data(file_ids, db_session):
  - For each file: read full content from file_chunks table (ordered by chunk_index)
  - Concatenate chunks with overlap-aware trimming via _concatenate_chunks(max_chars=5000)
  - Fallback to files.extracted_text preview[:3000] if no chunks exist
  - Return formatted for Gemini comparison prompt

def prepare_summarize_data(dataroom_id, db_session):
  - Get all files with ai_summaries
  - Get folder structure
  - Return formatted for summarization

def prepare_extract_data(query, dataroom_id, query_vector, user_id,
                          chroma_path, db_session):
  - Search for the specific data point via hybrid search
  - Return top chunks formatted for extraction

=== STEP 3: AUDIT DATA PREPARATION ===

def prepare_audit_data(dataroom_id, audit_type, db_session) -> dict:
  - Fetch ALL files with metadata (name, type, size, folder, ai_summary)
  - Fetch folder structure with contexts
  - For each file without ai_summary: first 500 chars as preview
  - Return: { files, folders, previews, ai_summaries, audit_type }

Express receives this and builds the audit prompt based on audit_type.
Audit types are GENERAL PURPOSE:
  general, fundraising, legal, financial, compliance, hr, technical,
  academic, real_estate, medical, custom

def apply_audit_result(dataroom_id, audit_result, session_id, db_session):
  - Save audit as chat messages (special session)
  - Return { status }

=== STEP 4: INSIGHTS DATA PREPARATION ===

def prepare_insights_data(dataroom_id, db_session) -> dict:
  - Fetch file list with types, sizes, folders
  - Fetch folder names + contexts
  - Fetch existing entities (grouped)
  - Compute file_type_breakdown: "12 PDFs, 5 DOCX, 3 XLSX"
  - Return: { files, folders, entities, file_type_breakdown }

def apply_insights(dataroom_id, insights_data, db_session):
  - Mark old insights as stale=1
  - Insert new insights (summary, entities, suggestions, missing_docs)
  - Return { status }

=== STEP 5: SUGGESTIONS ===

def get_suggestions(dataroom_id, db_session) -> dict:
  - Check dataroom_insights for type='suggestions' where stale=0
  - If fresh: return cached suggestions
  - If stale/missing: return { stale: true, data_for_generation: { file_names, folder_names } }
  Express generates suggestions via Gemini using this data.

Suggestion prompt is DOMAIN-AGNOSTIC:
  "Given a DataRoom with folders: {folder_names} and files: {file_names[:20]},
   generate 4 useful questions a user might ask. Be specific to the actual content.
   Do NOT assume any industry. Return JSON array of 4 strings."

=== STEP 6: NEW EXPRESS ENDPOINTS ===

POST /api/v1/ai/chat/stream
  Body: { system_prompt, messages: [{role, content}], tools?, tool_config? }
  Logic:
  - Call Gemini generateContentStream() with streaming
  - Set Content-Type: text/event-stream
  - For each chunk: res.write data: {"type":"chunk","text":"..."}
  - For function calls: res.write data: {"type":"tool_call","name":"...","args":{...}}
  - On error: res.write data: {"type":"error","message":"..."}
  - On end: res.write data: {"type":"end"}
  Returns: SSE stream

POST /api/v1/ai/chat (non-streaming fallback for testing)
  Body: same as above
  Returns: { response, tool_calls }

POST /api/v1/ai/audit
  Body: { audit_data (from Python prepare), audit_type }
  Logic: Build audit prompt based on type. Call Gemini. Return structured result.
  
  GENERAL AUDIT prompt:
  "You are a document management expert. Analyze this DataRoom:
   1. OVERVIEW (2-3 sentences)
   2. COMPLETENESS (what's present, what's missing)
   3. ORGANIZATION (folder structure quality)
   4. INCONSISTENCIES (data mismatches)
   5. SUGGESTIONS (3-5 improvements)
   6. READINESS SCORE (1-10 with justification)"

  Domain-specific audits add relevant checklists (see General Purpose Design section).

POST /api/v1/ai/simulate
  Body: { simulation_data, simulation_type }
  Logic: Build role prompt. Call Gemini. Return structured result.

  Roles are GENERAL PURPOSE:
  critical_reviewer, compliance_officer, new_employee, external_auditor,
  vc_partner, legal_counsel, board_member, tax_auditor, hr_director,
  technical_lead, custom

  For "custom": user provides the role description in the request body.

POST /api/v1/ai/generate-insights
  Body: { insights_data (from Python prepare) }
  Logic: Generate summary, suggested questions, missing doc suggestions.
  Returns: { summary, suggestions, missing_docs }

POST /api/v1/ai/generate-suggestions
  Body: { file_names, folder_names }
  Logic: Generate 4 context-aware questions. Domain-agnostic prompt.
  Returns: { suggestions: ["...", "...", "...", "..."] }

=== STEP 7: NEW PYTHON ENDPOINTS ===

POST /api/v1/copilot/tool/search
POST /api/v1/copilot/tool/get-file-content
POST /api/v1/copilot/tool/list-files
POST /api/v1/copilot/tool/get-entities
POST /api/v1/copilot/tool/find-similar
POST /api/v1/copilot/tool/prepare-compare
POST /api/v1/copilot/tool/prepare-summarize
POST /api/v1/copilot/tool/prepare-extract
POST /api/v1/copilot/prepare-audit
POST /api/v1/copilot/apply-audit
POST /api/v1/copilot/prepare-insights
POST /api/v1/copilot/apply-insights
GET  /api/v1/chat/suggestions?dataroom_id=...
GET  /api/v1/chat/insights?dataroom_id=...

RULES:
- Python NEVER calls Gemini
- All prompts (system, audit, simulation, suggestions) live in Express
  since Express is the Gemini caller
- Chat history: last 10 messages max per session
- Tool call loops: max 3 rounds (enforced by Electron in C3)
- Sources always included in responses
- Domain-agnostic by default. Domain-specific modes are optional selections.
- All existing endpoints must keep working
- Use logger everywhere
```

**Done when:** Chat context preparation works. All tool functions implemented. Audit and insights data preparation complete. Express can stream chat, run audits, simulate roles, generate insights — all domain-agnostic.

---

## PHASE C3 — Electron IPC Orchestration + Redux

**Layer:** `electron/` + `frontend/`
**Estimated time:** 5-7 hours

Copy and paste:

```
Phase C3: Wire up Electron IPC orchestration and Redux state for the copilot.

READ CLAUDE.md FIRST. Follow every rule in it.

CONTEXT:
- C1 + C2 are complete. Python has all data endpoints. Express has all AI proxy endpoints.
- The 3-step orchestration pattern exists from V1 (aiHandlers.js).
- This phase wires everything together: Electron drives the multi-step flows.

=== STEP 1: CREATE electron/ipc/copilotHandlers.js ===

This is the orchestrator. Follow the same patterns as aiHandlers.js.
Use the logger module (not console.*).

copilot:send-message (STREAMING — the primary chat flow)
Receives: { message, session_id, scope_type, scope_ids, scope_name }
Flow:
  1. Call Express POST /api/v1/ai/embed with { texts: [message] }
     → get query_vector
  2. Call Python POST /api/v1/copilot/search with
     { query_text: message, query_vector, scope_type, scope_ids,
       session_id, scope_name, db_path, chroma_path, user_id }
     → get { session_id, formatted_chunks, history, sources }
  3. Build system_prompt (the general-purpose Orvyn Copilot prompt)
  4. Build messages array: history + document excerpts + user message
  5. Call Express POST /api/v1/ai/chat/stream with
     { system_prompt, messages, tools: COPILOT_TOOLS, tool_config: { mode: "AUTO" } }
     Read the SSE stream:
       parsed.type === 'chunk' → event.sender.send('copilot:stream-chunk', { text })
       parsed.type === 'tool_call' → execute tool:
         Call Python /api/v1/copilot/tool/{tool_name} with args
         Send tool result back to Express (continue conversation)
         Max 3 tool call rounds (COPILOT_MAX_TOOL_ROUNDS)
       parsed.type === 'error' → event.sender.send('copilot:stream-error', { message })
       parsed.type === 'end' → event.sender.send('copilot:stream-end', { sources, session_id })
  6. Accumulate full response text during streaming
  7. Call Python POST /api/v1/copilot/save-message with
     { session_id, user_message: message, assistant_response: fullText,
       sources, tool_calls }
  8. If first message in session: call Express POST /api/v1/ai/generate-title
     → call Python to update session title
  Store an AbortController for cancellation.

copilot:cancel-stream
  If activeStreamController exists, abort it.

copilot:index-files (BACKGROUND INDEXING PIPELINE)
Receives: { file_ids, dataroom_id }
For each file:
  1. Python POST /api/v1/copilot/prepare-index → { chunks, checksum, is_duplicate }
     If duplicate: skip embedding, copy from original (or just mark as complete)
  2. Express POST /api/v1/ai/embed with { texts: chunk_texts }
     → { vectors }
  3. Python POST /api/v1/copilot/apply-index with
     { file_id, dataroom_id, chunks, vectors, embedding_model, chroma_path,
       user_id, preview_text }
     (preview_text from prepare-index response — updates files.extracted_text
      from the same extraction pass as the chunks)
  4. Express POST /api/v1/ai/extract-entities with { text: first_2000_chars }
     (first_2000_chars = preview_text[:2000], captured during prepare-index)
     → { organizations, people, monetary_values, dates, locations, key_terms }
  5. Python POST /api/v1/copilot/apply-entities with { file_id, dataroom_id, entities }
  6. Express POST /api/v1/ai/summarize-file with { text: first_2000_chars }
     → { summary }
  7. Python POST /api/v1/copilot/apply-summary with { file_id, summary }
Process sequentially. On error: update indexing_job status, continue to next file.
Send IPC progress events: 'copilot:index-progress' { completed, total, current_file }

copilot:audit-dataroom
Receives: { dataroom_id, audit_type }
  1. Python POST /api/v1/copilot/prepare-audit → audit_data
  2. Express POST /api/v1/ai/audit with { audit_data, audit_type }
     → audit_result
  3. Python POST /api/v1/copilot/apply-audit with
     { dataroom_id, audit_result, session_id }
  Return: { audit_result, session_id }

copilot:simulate-review
Receives: { dataroom_id, simulation_type, custom_role? }
  1. Python POST /api/v1/copilot/prepare-audit → same data
  2. Express POST /api/v1/ai/simulate with
     { simulation_data, simulation_type, custom_role }
     → simulation_result
  3. Python POST /api/v1/copilot/apply-audit with result as chat session
  Return: { simulation_result, session_id }

copilot:generate-insights
Receives: { dataroom_id }
  1. Python POST /api/v1/copilot/prepare-insights → insights_data
  2. Express POST /api/v1/ai/generate-insights with { insights_data }
     → { summary, suggestions, missing_docs }
  3. Python POST /api/v1/copilot/apply-insights with results
  Return: { insights }

SIMPLE PASSTHROUGH handlers (call Python directly):
copilot:get-sessions → Python GET /api/v1/chat/sessions
copilot:get-messages → Python GET /api/v1/chat/sessions/{id}/messages
copilot:delete-session → Python DELETE /api/v1/chat/sessions/{id}
copilot:get-suggestions → Python GET /api/v1/chat/suggestions
  If stale: Express POST /api/v1/ai/generate-suggestions → Python apply
copilot:get-insights → Python GET /api/v1/chat/insights
copilot:get-index-status → Python GET /api/v1/indexing/status
copilot:retry-indexing → Python POST /api/v1/indexing/retry-failed

=== STEP 2: UPDATE electron/preload.js ===

Add to contextBridge:
  copilot: {
    sendMessage: (data) => ipcRenderer.invoke('copilot:send-message', data),
    cancelStream: () => ipcRenderer.invoke('copilot:cancel-stream'),
    onStreamChunk: (cb) => ipcRenderer.on('copilot:stream-chunk', cb),
    offStreamChunk: (cb) => ipcRenderer.removeListener('copilot:stream-chunk', cb),
    onStreamEnd: (cb) => ipcRenderer.on('copilot:stream-end', cb),
    offStreamEnd: (cb) => ipcRenderer.removeListener('copilot:stream-end', cb),
    onStreamError: (cb) => ipcRenderer.on('copilot:stream-error', cb),
    offStreamError: (cb) => ipcRenderer.removeListener('copilot:stream-error', cb),
    onIndexProgress: (cb) => ipcRenderer.on('copilot:index-progress', cb),
    offIndexProgress: (cb) => ipcRenderer.removeListener('copilot:index-progress', cb),
    getSessions: (data) => ipcRenderer.invoke('copilot:get-sessions', data),
    getMessages: (data) => ipcRenderer.invoke('copilot:get-messages', data),
    deleteSession: (data) => ipcRenderer.invoke('copilot:delete-session', data),
    auditDataroom: (data) => ipcRenderer.invoke('copilot:audit-dataroom', data),
    simulateReview: (data) => ipcRenderer.invoke('copilot:simulate-review', data),
    getSuggestions: (data) => ipcRenderer.invoke('copilot:get-suggestions', data),
    getInsights: (data) => ipcRenderer.invoke('copilot:get-insights', data),
    generateInsights: (data) => ipcRenderer.invoke('copilot:generate-insights', data),
    indexFiles: (data) => ipcRenderer.invoke('copilot:index-files', data),
    getIndexStatus: (data) => ipcRenderer.invoke('copilot:get-index-status', data),
    retryIndexing: (data) => ipcRenderer.invoke('copilot:retry-indexing', data),
  }

=== STEP 3: REGISTER IN main.js ===

require('./ipc/copilotHandlers');

STARTUP RECOVERY (Crash Recovery for Indexing):
After /init-db completes (which already runs recover_stale_indexing_jobs from C1),
Electron should check for pending indexing jobs and auto-resume them:

In the app startup sequence (after Python is ready and /init-db returns):
  1. Call Python GET /api/v1/indexing/status
  2. If pending > 0:
     - Log: "Resuming {pending} indexing jobs from previous session"
     - Automatically trigger copilot:index-files for the pending file IDs
     - This runs in the background — does not block the UI

This ensures that if the user quit the app mid-indexing, or the app crashed,
all pending work resumes seamlessly on next launch.

=== STEP 4: CREATE frontend/src/store/copilotSlice.js ===

State shape:
{
  isOpen: false,
  panelWidth: 380,
  sessions: [],
  activeSessionId: null,
  messages: [],
  scopeType: 'dataroom',
  scopeIds: [],
  scopeName: '',
  selectedFileIds: [],
  isLoading: false,
  isStreaming: false,
  streamingMessage: '',
  isAuditing: false,
  isSimulating: false,
  isIndexing: false,
  indexStatus: null,        // { total, pending, processing, complete, failed }
  indexProgress: null,      // { completed, total, current_file }
  suggestions: [],
  insights: null,
  auditResult: null,
  simulationResult: null,
  error: null
}

Thunks:
- sendMessage(message) — triggers IPC, relies on stream events for response
- fetchSessions(scopeType, scopeId)
- loadSession(sessionId) — fetches messages for a session
- deleteSession(sessionId)
- startNewSession(scopeType, scopeIds, scopeName)
- auditDataroom(dataroomId, auditType)
- simulateReview(dataroomId, simulationType, customRole?)
- fetchSuggestions(dataroomId)
- fetchInsights(dataroomId)
- generateInsights(dataroomId)
- indexFiles(fileIds, dataroomId)
- getIndexStatus(dataroomId)
- setCopilotScope(scopeType, scopeIds, scopeName)
- setSelectedFiles(fileIds)

Reducers:
- toggleCopilot() / openCopilot() / closeCopilot()
- clearMessages() / clearAudit() / clearSimulation()
- startStreaming() → isStreaming=true, streamingMessage=''
- appendStreamChunk(text) → streamingMessage += text
- finalizeStreamMessage({ sources, session_id, session_title })
    → push complete message to messages[], isStreaming=false, streamingMessage=''
- updateIndexProgress({ completed, total, current_file })

Streaming flow in React:
  1. dispatch(sendMessage()) → sets isStreaming=true, adds user message to messages[]
  2. IPC 'copilot:stream-chunk' events → dispatch appendStreamChunk(text)
  3. UI renders streamingMessage growing in real-time (word by word)
  4. IPC 'copilot:stream-end' → dispatch finalizeStreamMessage()
     → streamingMessage becomes a real message in messages[], sources attached

=== STEP 5: REGISTER copilotSlice IN STORE ===

Add to frontend/src/store/index.js (or store.js).

RULES:
- Follow existing IPC + Redux patterns exactly
- Pass db_path AND chroma_path with every Python call
  chroma_path: path.join(app.getPath('userData'), 'users', userId, 'chroma')
- Pass Bearer token with every Express call (via expressService.js)
- Error handling: try/catch in all handlers, structured error objects
- Toast notifications for user-facing errors
- No new packages
- Use logger (not console.*) in all Electron code
```

**Done when:** Full chat flow works end-to-end: React → Electron → Python search → Express stream → React renders tokens. Indexing pipeline runs. Audit and insights generation complete.

---

## PHASE C4 — Copilot Panel UI

**Layer:** `frontend/`
**Estimated time:** 6-8 hours

Copy and paste:

```
Phase C4: Build the copilot right-side sliding panel UI.

READ CLAUDE.md FIRST. Read design-system/Orvyn/MASTER.md for design tokens.

The copilot is a RIGHT-SIDE PANEL that slides in/out alongside the file explorer.
When open, the file explorer flex-shrinks to accommodate.

LAYOUT:
+----------+---------------------------+-----------------+
| Sidebar  |    File Explorer          |  COPILOT PANEL  |
| (DataRm) |                           |  (slides in)    |
+----------+---------------------------+-----------------+

=== TOGGLE ===
- Toolbar button: "Copilot" (accent colored)
- Keyboard: Ctrl+J to toggle
- 200ms ease transition
- File explorer flex-shrinks, copilot slides from right

=== PANEL STRUCTURE ===

+----------------------------------+
| HEADER                           |
| Scope: [DataRoom name]           |
| 12/15 files indexed              |
| [New Chat v]          [x Close]  |
|----------------------------------|
| [Chat] [Insights] [Audit] [Sim] |
|----------------------------------|
|  (Tab content — scrollable)      |
|----------------------------------|
| QUICK ACTIONS (always visible)   |
| [Summary] [Compare]              |
| [Audit] [Similar]                |
|----------------------------------|
| INPUT (always visible)           |
| +-------------------+ [Send]     |
| | Ask about your... |            |
| +-------------------+            |
+----------------------------------+

=== CHAT TAB (default) ===

Empty state:
- "Orvyn Copilot" heading
- "Ask anything about your documents." subtitle
- 4 suggested questions (clickable → sends as message)
- Suggestions from API (context-aware, domain-agnostic)

Chat messages:
- User: right-aligned bubble, --accent-primary bg, white text, radius 12/12/4/12
- Assistant: left-aligned, --bg-surface bg, radius 12/12/12/4
- Markdown support (bold, lists, code blocks, tables) via react-markdown
  ASK ME before installing react-markdown
- Source citations below each assistant message:
  Sources:
    📄 pitch_deck.pptx (Page 14) — clickable → navigate to file
    📄 financials.xlsx (Sheet1)
- "Copy" button on hover per message
- Auto-scroll to bottom on new messages

Streaming display:
- streamingMessage renders in real-time as tokens arrive
- Cursor/blinking indicator at end of streaming text

Loading — reasoning steps (before stream starts):
"Searching documents..." → (1s) → "Analyzing..." → (1s) → "Generating..."
Subtle fade-in animation. Replaced by real response when stream starts.

=== INSIGHTS TAB ===
- DataRoom summary (from dataroom_insights)
- Key entities as clickable chips grouped by type:
  Organizations: [Stripe] [AWS]   People: [John Smith]
  Amounts: [$2.3M]                Dates: [Q3 2024]
  Click entity → searches for it in chat tab
- File type breakdown: "12 PDFs, 5 DOCX, 3 XLSX"
- Missing documents suggestions
- "Stale" badge if insights outdated
- [Refresh Insights] button

=== AUDIT TAB ===
- Audit type selector cards:
  General, Financial, Legal, Fundraising, Compliance, HR, Technical, Custom
  "Custom" shows a text input for describing what to audit
- [Run Audit] button
- Loading: "Auditing your DataRoom..." with progress
- Results: Readiness Score bar, Overview, Completeness, Inconsistencies, Suggestions
- [Ask Follow-up] → switches to Chat tab with audit context
- [Re-run Audit]

=== SIMULATE TAB ===
- Role cards:
  Critical Reviewer, Compliance Officer, New Employee, External Auditor,
  VC Partner, Legal Counsel, Board Member, Custom
  "Custom" shows text input for describing the role
- [Run Simulation] button
- Results: Tough questions, Red flags, Verdict
- [Ask Follow-up] → Chat tab

=== QUICK ACTIONS BAR (above input, always visible) ===
Small buttons: [Summary] [Compare] [Audit] [Similar]
- Summary → sends "Summarize this DataRoom" to chat
- Compare → opens small file picker for 2+ files, sends compare prompt
- Audit → switches to Audit tab
- Similar → sends "Find similar or duplicate documents"

=== AUTO-PROMPT ON FILE UPLOAD ===
After classification completes:
- Copilot auto-opens (if not already)
- System message in chat:
  "5 files added to [DataRoom name]. Analyze? [Analyze] [Later]"
- "Analyze" triggers insight generation
- "Later" dismisses

=== CONTEXT AUTO-SWITCH ===
- Navigate to DataRoom → scope updates, suggestions refresh
- Select file(s) in explorer → scope switches to file(s)
- Deselect → scope returns to DataRoom
- Multi-select → show "Chat about N files" prompt

=== SOURCE CLICKING ===
- Source citations are clickable → navigate to file in explorer
- Page number shown for PDFs/PPTX, section for DOCX, sheet for XLSX
- Double-click source → open file in system app

=== SESSION MANAGEMENT ===
- "New Chat" dropdown shows past sessions grouped by scope
- Click session → loads messages
- Delete session option
- Current session highlighted

=== INDEXING STATUS IN HEADER ===
- "12/15 files indexed • 3 pending" with progress bar
- "Index Now" manual trigger button
- Updates in real-time via copilot:index-progress events

=== KEYBOARD ===
- Ctrl+J → toggle panel
- Enter → send message (Shift+Enter for newline)
- Escape → close panel
- Tab → cycle between tabs

=== COMPONENT STRUCTURE ===

frontend/src/components/copilot/
  CopilotPanel.jsx           — main container, slide animation, resize
  CopilotPanel.module.css
  CopilotHeader.jsx          — scope bar, indexing status, session switcher, close
  CopilotTabs.jsx            — tab navigation (compact underline style)
  CopilotChat.jsx            — chat messages + suggestions + empty state
  CopilotMessage.jsx         — single message (user/assistant) + copy button
  CopilotSources.jsx         — source citations under messages
  CopilotReasoningSteps.jsx  — loading state with step-by-step text
  CopilotInsights.jsx        — insights tab content
  CopilotAudit.jsx           — audit tab with type selector + results
  CopilotSimulate.jsx        — simulate tab with role selector + results
  CopilotQuickActions.jsx    — action buttons above input
  CopilotInput.jsx           — textarea + send button
  CopilotSessionList.jsx     — past sessions dropdown

RULES:
- CSS Modules + CSS variables for theming (light + dark from MASTER.md)
- All actions through copilotSlice thunks
- ASK ME before installing react-markdown or any package
- Responsive: min-width 320px for panel, max-width 600px
- Don't break file explorer functionality
- Domain-agnostic language everywhere. "Role Simulation" not "Investor Simulation".
  "DataRoom Audit" not "Fundraising Audit".
- Tabs: compact underline-active style, not bulky cards
- Smooth 200ms transitions on everything
- Custom thin auto-hide scrollbar for chat area
- Both light and dark themes must work
```

**Done when:** Full copilot panel UI with all four tabs. Chat streams in real-time. Insights, audit, and simulation tabs work. Keyboard shortcuts work. Both themes work.

---

## PHASE C5 — Cross-DataRoom + Comparison + Polish

**Layer:** All
**Estimated time:** 5-7 hours

Copy and paste:

```
Phase C5: Cross-dataroom intelligence, document comparison, and polish.

READ CLAUDE.md FIRST.

=== 1. CROSS-DATAROOM QUERY ===
- Global scope: no filter on ChromaDB/FTS5 search
- Response includes which DataRoom each source came from
- Source display: "📁 [DataRoom] > filename.ext"

=== 2. MULTI-DATAROOM DETECTION ===
- When user types query, check if it mentions DataRoom names
- "Compare [DR1] and [DR2]" → detect both IDs
- Set scope_type='multi_dataroom', scope_ids=[id1, id2]
- Scope bar shows: "Comparing: DR1, DR2"

=== 3. DOCUMENT COMPARISON UI ===
- Select 2+ files in explorer → "Compare with Copilot" button appears
- Opens copilot, auto-sends comparison prompt
- Copilot uses compare_documents tool
- Results highlight differences and similarities

=== 4. FOLDER SCOPE ===
- When navigated inside a folder, scope auto-sets to folder
- Header shows: "Scope: [Folder Name] (in [DataRoom])"
- Search scoped to folder contents (including nested subfolders)

=== 5. INDEXING STATUS ===
- Scope bar: "12/15 files indexed • 3 pending"
- Progress bar (subtle)
- "Index Now" manual trigger
- Real-time updates via copilot:index-progress IPC events

=== 6. STALE CONTENT DETECTION ===
- On file:relocate, run has_file_changed() triple-check:
  file_size + mtime (fast, stat only) → checksum (slow, only if first two match)
- If ANY check fails → show "Content changed" badge on file in explorer
- Offer "Re-index" button next to the badge
- Re-index triggers sync_file_content_changed() → deletes old embeddings → new indexing_job

=== 7. ERROR HANDLING PASS ===
- Empty DataRooms → "Add files to get started"
- No indexed files → "Files are being indexed..." or "Index your files to enable Copilot"
- Files with no extractable text → skip gracefully, log warning
- Very long responses → truncate display with "Show more" toggle
- Network failure (Express down) → toast "AI service unavailable"
- Gemini rate limits → Express retries with backoff, Electron shows "Processing..."
- Stream cancellation → clean up AbortController, no crash
- Rapid message sending → disable send button while streaming
- Toast notifications for all user-facing errors

=== 8. EDGE CASES ===
- Single-file DataRoom → copilot still works with that one file
- File with 0 bytes → skip indexing, show "Empty file" in insights
- Concurrent indexing + chat → search only queries complete files (safe)
- Session with deleted DataRoom → show "DataRoom no longer exists"
- Very large files (50MB+) → chunk limit prevents memory issues
```

**Done when:** Cross-DataRoom search works. Multi-DataRoom detection works. Comparison flow works. All error states handled gracefully.

---

## PHASE C6 — Bug Fixes + Edge Cases + CLAUDE.md Update

**Layer:** All
**Estimated time:** 3-5 hours

Copy and paste:

```
Phase C6: Final polish and CLAUDE.md documentation update.

=== 1. BUG FIXES ===
Fix all bugs found during testing of C1-C5.

=== 2. EDGE CASE TESTING ===
Test and fix:
- Empty DataRoom → copilot shows helpful empty state
- DataRoom with 1 file → all features work
- DataRoom with 50 files → indexing doesn't freeze
- File with no text (image-only) → skipped gracefully
- Very long chat history → only last 10 messages sent
- Concurrent operations → indexing + chat + navigation
- Rapid panel open/close → no state corruption
- Theme switch while copilot open → colors update correctly
- All file operations (rename, remove, delete, move, relocate) →
  verify sync functions fire correctly and search results update

=== 3. UPDATE CLAUDE.md ===

Add these new sections to CLAUDE.md:

Section: Copilot Architecture
- Explain the 3-step orchestration for chat (Python search → Express Gemini → Python save)
- Explain the indexing pipeline (Python chunk → Express embed → Python store)
- Document the 5 architectural safeguards (checksum, job queue, embedding_status, model version, dedup)
- Document the sync function rules (every file mutation must call its sync function)

Section: New IPC Channels (copilot:*)
- Document all copilot IPC channels from copilotHandlers.js
- Document streaming events (stream-chunk, stream-end, stream-error, index-progress)

Section: New Python Endpoints
- List all /api/v1/copilot/* and /api/v1/indexing/* and /api/v1/chat/* endpoints

Section: New Express Endpoints
- List all /api/v1/ai/* endpoints added in V1-new feature

Section: copilotSlice State Shape
- Document full state shape with descriptions

Section: Sync Function Rules
- The mapping table: which endpoint calls which sync function
- The principle: "Vector DB and SQLite must ALWAYS agree"

Section: New Environment Variables
- All RAG_*, COPILOT_*, INDEX_* variables with defaults
- New Express variables (GEMINI_CHAT_MODEL, GEMINI_EMBEDDING_MODEL, etc.)

=== 4. FINAL END-TO-END TEST ===
- Upload 10 files → classify → verify indexing_jobs created
- Wait for indexing → verify embedding_status = complete
- Open copilot → verify suggestions appear
- Ask a question → verify streaming response with sources
- Run audit → verify structured result
- Run simulation → verify role-appropriate response
- Delete a file → verify embeddings removed from ChromaDB
- Move a file to different folder → verify ChromaDB metadata updated
- Delete a folder → verify all nested files cleaned up
- Cross-DataRoom search → verify results from multiple DataRooms
```

**Done when:** All features work. CLAUDE.md is updated. No bugs remain.

---

## Summary

| Phase | What | Layer | Hours |
|-------|------|-------|-------|
| C1 | Schema + Embedding + Search + Express AI proxy + Sync functions | Python + Express | 7-9 |
| C2 | Chat engine + RAG + Tools + Audit + Insights (all general-purpose) | Python + Express | 7-9 |
| C3 | Electron IPC orchestration + Redux copilotSlice | Electron + Frontend | 5-7 |
| C4 | Copilot panel UI (full chat interface, 4 tabs) | Frontend | 6-8 |
| C5 | Cross-dataroom + Comparison + Error handling + Polish | All | 5-7 |
| C6 | Bug fixes, edge cases, CLAUDE.md update | All | 3-5 |

**Total: ~33-45 hours across 6 phases**
**Monthly cost per user: $2-8**
**New packages: chromadb (1 Python package)**

### Architectural Safeguards Built In

1. **Triple-check file integrity** — file_size + mtime + content_checksum stored per file and per chunk. Fast checks (stat) run first; expensive check (text extraction + hash) only if size+mtime match. Catches binary metadata changes that checksum-only misses. Auto re-indexes on any mismatch.
2. **Background indexing queue** — SQLite indexing_jobs table. Decoupled from upload. Status tracking. Retries up to 3 times.
3. **Embedding status protection** — `embedding_status` field: none → pending → processing → complete → failed. Search ONLY queries `complete` files.
4. **Embedding model versioning** — `embedding_model` stored per file and per chunk. Safe migration: query old model chunks, delete, re-index.
5. **Duplicate document detection** — Identical content_checksum skips embedding. Saves API cost and storage.
6. **Worker crash recovery** — Jobs stuck in `processing` for >10 minutes are reset to `pending` on app startup. Electron auto-resumes pending jobs after /init-db. No manual intervention needed.
