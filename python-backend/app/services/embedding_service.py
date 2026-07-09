"""
Embedding Service — ChromaDB + FTS5 management for Orvyn Copilot.

Handles:
  - ChromaDB setup and collection management
  - Text chunking with paragraph-aware splitting
  - Content hashing for duplicate detection and integrity
  - Prepare/apply index (3-step flow: Python prepares → Express embeds → Python stores)
  - Vector search, keyword search (FTS5), hybrid search
  - Sync functions for file/folder/dataroom operations
  - Indexing job management and crash recovery

Python NEVER calls Gemini directly. Vectors come from Express.
"""

import hashlib
import logging
import os
import re
import uuid

import chromadb
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("Orvyn")

# ---------------------------------------------------------------------------
# Environment config
# ---------------------------------------------------------------------------

_CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE_CHARS", "3750"))
_CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP_CHARS", "750"))
_MAX_CHUNKS_PER_QUERY = int(os.getenv("RAG_MAX_CHUNKS_PER_QUERY", "8"))
_MAX_RETRIEVAL_RESULTS = int(os.getenv("RAG_MAX_RETRIEVAL_RESULTS", "200"))
_CONFIDENCE_THRESHOLD = float(os.getenv("RAG_CONFIDENCE_THRESHOLD", "0.3"))
_STALE_JOB_THRESHOLD_MINUTES = 10
_MAX_RETRY_ATTEMPTS = int(os.getenv("INDEX_MAX_RETRY_ATTEMPTS", "3"))


# ---------------------------------------------------------------------------
# ChromaDB setup
# ---------------------------------------------------------------------------

# Cache clients and collections to avoid re-opening on every request
_chroma_clients = {}
_chroma_collections = {}


def get_chroma_collection(user_id: str, chroma_path: str):
    """Get or create a ChromaDB collection for a user."""
    cache_key = f"{chroma_path}::{user_id}"
    if cache_key in _chroma_collections:
        return _chroma_collections[cache_key]

    if chroma_path not in _chroma_clients:
        os.makedirs(chroma_path, exist_ok=True)
        _chroma_clients[chroma_path] = chromadb.PersistentClient(path=chroma_path)

    client = _chroma_clients[chroma_path]
    collection = client.get_or_create_collection(
        name=f"user_{user_id}",
        metadata={"hnsw:space": "cosine"},
    )
    _chroma_collections[cache_key] = collection
    return collection


# ---------------------------------------------------------------------------
# Content hashing (Architectural Recommendation #1 + #5)
# ---------------------------------------------------------------------------

def compute_content_hash(text_content: str) -> str:
    """Compute SHA-256 hash of extracted text content."""
    return hashlib.sha256(text_content.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Text chunking
# ---------------------------------------------------------------------------

def chunk_text(text_content: str, chunk_size: int = None, overlap: int = None) -> list:
    """
    Split text into overlapping chunks, respecting paragraph boundaries.

    Returns: [{"text": "...", "index": 0}, ...]
    """
    if chunk_size is None:
        chunk_size = _CHUNK_SIZE
    if overlap is None:
        overlap = _CHUNK_OVERLAP

    if not text_content or not text_content.strip():
        return []

    text_content = re.sub(r"[ \t]+", " ", text_content)
    text_content = re.sub(r"\n{3,}", "\n\n", text_content)
    text_content = text_content.strip()

    # If text fits in one chunk, return as-is
    if len(text_content) <= chunk_size:
        return [{"text": text_content, "index": 0}]

    # Split on paragraph boundaries first
    paragraphs = text_content.split("\n\n")

    chunks = []
    current_chunk = ""
    chunk_index = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # If adding this paragraph exceeds chunk_size and we have content
        if current_chunk and len(current_chunk) + len(para) + 2 > chunk_size:
            chunks.append({"text": current_chunk.strip(), "index": chunk_index})
            chunk_index += 1

            # Overlap: keep the tail of the current chunk
            if overlap > 0 and len(current_chunk) > overlap:
                current_chunk = current_chunk[-overlap:]
            else:
                current_chunk = ""

        if current_chunk:
            current_chunk += "\n\n" + para
        else:
            current_chunk = para

        # If a single paragraph exceeds chunk_size, split it by sentences/size
        while len(current_chunk) > chunk_size:
            # Find a split point near chunk_size
            split_at = chunk_size
            # Try to split at sentence boundary
            for sep in [". ", ".\n", "\n", " "]:
                idx = current_chunk.rfind(sep, 0, chunk_size)
                if idx > chunk_size // 2:
                    split_at = idx + len(sep)
                    break

            chunks.append({"text": current_chunk[:split_at].strip(), "index": chunk_index})
            chunk_index += 1

            remaining = current_chunk[split_at:]
            if overlap > 0:
                overlap_start = max(0, split_at - overlap)
                current_chunk = current_chunk[overlap_start:]
                # But we need to continue from remaining
                current_chunk = current_chunk[-(len(remaining) + min(overlap, split_at)):]
            else:
                current_chunk = remaining

    # Don't forget the last chunk
    if current_chunk and current_chunk.strip():
        chunks.append({"text": current_chunk.strip(), "index": chunk_index})

    return chunks


def chunk_text_with_metadata(text_content: str, file_extension: str,
                             chunk_size: int = None, overlap: int = None) -> list:
    """
    Chunk text with file-type-specific metadata (page numbers, sections).

    Returns: [{"text": "...", "index": 0, "page_number": 1, ...}, ...]
    """
    ext = file_extension.lower() if file_extension else ""
    base_chunks = chunk_text(text_content, chunk_size, overlap)

    if ext == ".pdf":
        # Track page numbers from PyMuPDF page markers
        _assign_page_numbers(base_chunks, text_content)
    elif ext == ".docx":
        # Track section numbers from heading paragraphs
        _assign_section_numbers(base_chunks, text_content)
    elif ext == ".pptx":
        # Track slide numbers from [Slide N] markers
        _assign_slide_numbers(base_chunks, text_content)
    elif ext == ".xlsx":
        # Track sheet names from [Sheet: name] markers
        _assign_sheet_names(base_chunks, text_content)

    return base_chunks


def _assign_page_numbers(chunks: list, full_text: str):
    """Estimate page numbers for PDF chunks based on text position."""
    # PyMuPDF concatenates pages with \n. We estimate page boundaries.
    pages = full_text.split("\n\n")
    page_positions = []
    pos = 0
    for i, page in enumerate(pages):
        page_positions.append(pos)
        pos += len(page) + 2  # +2 for \n\n

    for chunk in chunks:
        chunk_start = full_text.find(chunk["text"][:100])
        if chunk_start < 0:
            chunk_start = 0
        page_num = 1
        for i, pp in enumerate(page_positions):
            if chunk_start >= pp:
                page_num = i + 1
        chunk["page_number"] = page_num


def _assign_section_numbers(chunks: list, full_text: str):
    """Assign section numbers based on text position for DOCX."""
    # Simple heuristic: count paragraphs before the chunk
    for i, chunk in enumerate(chunks):
        chunk["section_number"] = i + 1


def _assign_slide_numbers(chunks: list, full_text: str):
    """Assign slide numbers from [Slide N] markers for PPTX."""
    for chunk in chunks:
        match = re.search(r"\[Slide\s+(\d+)\]", chunk["text"])
        if match:
            chunk["page_number"] = int(match.group(1))
        else:
            # Find the last [Slide N] before this chunk's text in full_text
            chunk_start = full_text.find(chunk["text"][:80])
            if chunk_start > 0:
                preceding = full_text[:chunk_start]
                matches = re.findall(r"\[Slide\s+(\d+)\]", preceding)
                chunk["page_number"] = int(matches[-1]) if matches else 1
            else:
                chunk["page_number"] = 1


def _assign_sheet_names(chunks: list, full_text: str):
    """Assign sheet names from [Sheet: name] markers for XLSX."""
    for chunk in chunks:
        match = re.search(r"\[Sheet:\s*(.+?)\]", chunk["text"])
        if match:
            chunk["section_name"] = match.group(1)
        else:
            chunk_start = full_text.find(chunk["text"][:80])
            if chunk_start > 0:
                preceding = full_text[:chunk_start]
                matches = re.findall(r"\[Sheet:\s*(.+?)\]", preceding)
                chunk["section_name"] = matches[-1] if matches else "Sheet1"
            else:
                chunk["section_name"] = "Sheet1"


# ---------------------------------------------------------------------------
# Prepare index (Step 1 of 3-step flow)
# ---------------------------------------------------------------------------

def prepare_index(file_ids: list, dataroom_id: str, db_session) -> dict:
    """
    Prepare files for embedding: chunk text, compute checksums, detect duplicates.
    Returns data for Electron to send to Express for embedding.
    """
    files_data = []

    from app.main import _extract_text

    for file_id in file_ids:
        row = db_session.execute(
            text("""
                SELECT id, original_name, original_path, file_extension,
                       folder_id, mime_type, extracted_text
                FROM files WHERE id = :fid
            """),
            {"fid": file_id},
        ).fetchone()

        if not row:
            logger.warning(f"prepare_index: file {file_id} not found, skipping")
            continue

        original_path = row[2]
        file_ext = row[3]
        original_name = row[1]
        stored_extracted_text = row[6]  # extracted_text from DB (may contain OCR text for images)

        # For image files, use the stored extracted_text (from OCR) instead of re-extracting
        _image_exts = {".png", ".jpg", ".jpeg"}
        if file_ext in _image_exts and stored_extracted_text and not stored_extracted_text.startswith("[Image:"):
            extracted_text = stored_extracted_text
        else:
            # Re-extract full text from original file on disk
            if not os.path.exists(original_path):
                logger.warning(f"prepare_index: file not found at {original_path}, failing job")
                db_session.execute(
                    text("""
                        UPDATE indexing_jobs
                        SET status = 'failed',
                            error_message = 'FILE_NOT_FOUND',
                            attempts = attempts + 1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE file_id = :fid AND status IN ('pending', 'processing')
                    """),
                    {"fid": file_id},
                )
                db_session.commit()
                files_data.append({
                    "file_id": file_id, "chunks": [], "skipped": True,
                    "skip_reason": "file_not_found",
                })
                continue

            try:
                extracted_text = _extract_text(original_path, file_ext, original_name)
            except Exception as exc:
                logger.error(f"prepare_index: extraction failed for {file_id}: {exc}")
                db_session.execute(
                    text("""
                        UPDATE indexing_jobs
                        SET status = 'failed',
                            error_message = :err,
                            attempts = attempts + 1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE file_id = :fid AND status IN ('pending', 'processing')
                    """),
                    {"fid": file_id, "err": f"EXTRACTION_ERROR: {exc}"},
                )
                db_session.commit()
                files_data.append({
                    "file_id": file_id, "chunks": [], "skipped": True,
                    "skip_reason": "extraction_error",
                })
                continue

        # Skip empty or image-only files
        if not extracted_text.strip() or extracted_text.startswith("[Image:"):
            logger.info(f"prepare_index: file {file_id} has no extractable text, marking complete")
            # Compute checksum even for skipped files (for future change detection)
            skip_checksum = compute_content_hash(extracted_text) if extracted_text else compute_content_hash("")
            # Mark both file and job as complete immediately — no text to index
            db_session.execute(
                text("""
                    UPDATE files SET embedding_status = 'complete', content_checksum = :checksum
                    WHERE id = :fid
                """),
                {"checksum": skip_checksum, "fid": file_id},
            )
            db_session.execute(
                text("""
                    UPDATE indexing_jobs SET status = 'complete', updated_at = CURRENT_TIMESTAMP
                    WHERE file_id = :fid AND status IN ('pending', 'processing')
                """),
                {"fid": file_id},
            )
            db_session.commit()
            files_data.append({
                "file_id": file_id,
                "chunks": [],
                "checksum": skip_checksum,
                "file_size_bytes": None,
                "file_mtime": None,
                "is_duplicate": False,
                "duplicate_of": None,
                "skipped": True,
                "skip_reason": "no_text",
            })
            continue

        # Capture preview text before any mutation
        preview_text = extracted_text[:3000]

        # Compute content checksum on FULL text
        content_checksum = compute_content_hash(extracted_text)

        # Get file stats (size + mtime)
        file_size_bytes = None
        file_mtime = None
        try:
            if os.path.exists(original_path):
                stat = os.stat(original_path)
                file_size_bytes = stat.st_size
                file_mtime = stat.st_mtime
        except OSError:
            logger.warning(f"prepare_index: cannot stat file {original_path}")

        # NOTE: Duplicate content detection removed — each file gets its own
        # embeddings even if the same document exists in multiple DataRooms.
        # Duplicate file uploads are handled at the upload stage instead.

        # Chunk the text
        chunks = chunk_text_with_metadata(extracted_text, file_ext)

        # Free memory — full text no longer needed, only chunks and preview remain
        del extracted_text

        # Build metadata per chunk
        folder_id = row[4] or "unclassified"

        chunks_with_meta = []
        for chunk in chunks:
            meta = {
                "file_id": file_id,
                "dataroom_id": dataroom_id,
                "file_name": original_name,
                "file_type": file_ext,
                "folder_id": folder_id,
                "chunk_index": chunk["index"],
                "checksum": content_checksum,
                "file_size_bytes": file_size_bytes or 0,
                "file_modified_at": file_mtime or 0.0,
                "embedding_model": "pending",
                "embedding_status": "processing",
            }
            # Add file-type-specific metadata
            if "page_number" in chunk:
                meta["page_number"] = chunk["page_number"]
            if "section_number" in chunk:
                meta["section_number"] = chunk["section_number"]
            if "section_name" in chunk:
                meta["section_name"] = chunk["section_name"]

            chunks_with_meta.append({
                "text": chunk["text"],
                "index": chunk["index"],
                "metadata": meta,
            })

        # Atomic job claim: update indexing_jobs pending/processing → processing.
        # Also claims stale 'processing' jobs from crashed workers.
        claim_result = db_session.execute(
            text("""
                UPDATE indexing_jobs SET status = 'processing', updated_at = CURRENT_TIMESTAMP
                WHERE file_id = :fid AND status IN ('pending', 'processing')
            """),
            {"fid": file_id},
        )
        if claim_result.rowcount == 0:
            logger.info(f"prepare_index: no claimable job for file {file_id}, skipping")
            db_session.commit()
            files_data.append({
                "file_id": file_id,
                "chunks": [],
                "checksum": content_checksum,
                "file_size_bytes": file_size_bytes,
                "file_mtime": file_mtime,
                "is_duplicate": False,
                "duplicate_of": None,
                "skipped": False,
                "already_claimed": True,
            })
            continue

        # Update embedding_status to processing
        db_session.execute(
            text("UPDATE files SET embedding_status = 'processing' WHERE id = :fid"),
            {"fid": file_id},
        )

        files_data.append({
            "file_id": file_id,
            "chunks": chunks_with_meta,
            "checksum": content_checksum,
            "file_size_bytes": file_size_bytes,
            "file_mtime": file_mtime,
            "is_duplicate": False,
            "duplicate_of": None,
            "skipped": False,
            "already_claimed": False,
            "first_2000_chars": preview_text[:2000],
            "preview_text": preview_text,
        })

    db_session.commit()
    return {"files": files_data}


# ---------------------------------------------------------------------------
# Apply index (Step 3 of 3-step flow)
# ---------------------------------------------------------------------------

def apply_index(file_id: str, dataroom_id: str, chunks: list, vectors: list,
                embedding_model: str, content_checksum: str,
                file_size_bytes: int, file_mtime: float,
                user_id: str, chroma_path: str, db_session,
                preview_text: str = None) -> dict:
    """
    Store vectors in ChromaDB and chunks in file_chunks (FTS5 syncs via triggers).
    Update files table with embedding metadata.
    """
    collection = get_chroma_collection(user_id, chroma_path)

    if not chunks or not vectors:
        logger.warning(f"apply_index: no chunks/vectors for file {file_id}")
        return {"chunks_indexed": 0, "status": "skipped"}

    # Prepare ChromaDB data
    ids = []
    embeddings = []
    documents = []
    metadatas = []

    for i, chunk in enumerate(chunks):
        chunk_id = f"{file_id}_chunk_{chunk['index']}"
        meta = chunk.get("metadata", {}).copy()
        meta["embedding_model"] = embedding_model
        meta["embedding_status"] = "complete"

        ids.append(chunk_id)
        embeddings.append(vectors[i])
        documents.append(chunk["text"])
        metadatas.append(meta)

    # Upsert into ChromaDB
    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas,
    )

    # Store in file_chunks table (FTS5 syncs automatically via triggers)
    # First delete any existing chunks for this file
    db_session.execute(
        text("DELETE FROM file_chunks WHERE file_id = :fid"),
        {"fid": file_id},
    )

    for chunk in chunks:
        chunk_db_id = str(uuid.uuid4())
        db_session.execute(
            text("""
                INSERT INTO file_chunks (id, file_id, dataroom_id, chunk_index, chunk_text)
                VALUES (:id, :fid, :did, :idx, :txt)
            """),
            {
                "id": chunk_db_id,
                "fid": file_id,
                "did": dataroom_id,
                "idx": chunk["index"],
                "txt": chunk["text"],
            },
        )

    # Update files table (including preview text from same extraction pass)
    update_params = {
        "checksum": content_checksum,
        "model": embedding_model,
        "fsize": file_size_bytes,
        "fmtime": file_mtime,
        "fid": file_id,
    }

    if preview_text is not None:
        db_session.execute(
            text("""
                UPDATE files SET
                    embedding_status = 'complete',
                    content_checksum = :checksum,
                    embedding_model = :model,
                    indexed_file_size = :fsize,
                    indexed_file_mtime = :fmtime,
                    extracted_text = :preview
                WHERE id = :fid
            """),
            {**update_params, "preview": preview_text},
        )
    else:
        db_session.execute(
            text("""
                UPDATE files SET
                    embedding_status = 'complete',
                    content_checksum = :checksum,
                    embedding_model = :model,
                    indexed_file_size = :fsize,
                    indexed_file_mtime = :fmtime
                WHERE id = :fid
            """),
            update_params,
        )

    # Update indexing_jobs: status = 'complete'
    db_session.execute(
        text("""
            UPDATE indexing_jobs SET status = 'complete', updated_at = CURRENT_TIMESTAMP
            WHERE file_id = :fid AND status = 'processing'
        """),
        {"fid": file_id},
    )

    db_session.commit()

    logger.info(f"apply_index: indexed {len(chunks)} chunks for file {file_id}")
    return {"chunks_indexed": len(chunks), "status": "success"}


# ---------------------------------------------------------------------------
# Search functions
# ---------------------------------------------------------------------------

def vector_search(query_vector: list, user_id: str, chroma_path: str,
                  dataroom_id: str = None, file_ids: list = None,
                  folder_id: str = None, n_results: int = None) -> list:
    """
    Search ChromaDB for semantically similar chunks.
    Only queries files with embedding_status='complete'.
    Returns normalized scores (0-1, higher = better).
    """
    if n_results is None:
        n_results = _MAX_CHUNKS_PER_QUERY

    collection = get_chroma_collection(user_id, chroma_path)

    # Build where filter — always include embedding_status=complete
    where_filter = _build_chroma_where(dataroom_id, file_ids, folder_id)

    try:
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=min(n_results, _MAX_RETRIEVAL_RESULTS),
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        logger.error(f"vector_search error: {e}")
        return []

    if not results or not results["ids"] or not results["ids"][0]:
        return []

    output = []
    for i, chunk_id in enumerate(results["ids"][0]):
        distance = results["distances"][0][i]
        # Normalize: cosine distance 0=identical → score 1.0, distance 2=opposite → score 0.0
        score = 1 - (distance / 2)

        meta = results["metadatas"][0][i] if results["metadatas"] else {}
        doc = results["documents"][0][i] if results["documents"] else ""

        output.append({
            "text": doc,
            "file_id": meta.get("file_id"),
            "file_name": meta.get("file_name"),
            "dataroom_id": meta.get("dataroom_id"),
            "chunk_index": meta.get("chunk_index"),
            "score": round(score, 4),
            "page_number": meta.get("page_number"),
            "section_number": meta.get("section_number"),
            "section_name": meta.get("section_name"),
        })

    return output


def _build_chroma_where(dataroom_id=None, file_ids=None, folder_id=None) -> dict:
    """Build ChromaDB where filter with embedding_status=complete."""
    status_filter = {"embedding_status": "complete"}

    if file_ids and len(file_ids) == 1:
        return {"$and": [{"file_id": file_ids[0]}, status_filter]}
    elif file_ids and len(file_ids) > 1:
        return {"$and": [{"file_id": {"$in": file_ids}}, status_filter]}
    elif folder_id:
        return {"$and": [{"folder_id": folder_id}, status_filter]}
    elif dataroom_id:
        return {"$and": [{"dataroom_id": dataroom_id}, status_filter]}
    else:
        # Global scope
        return status_filter


def keyword_search(query: str, db_session, dataroom_id: str = None,
                   file_ids: list = None, folder_id: str = None,
                   limit: int = None) -> list:
    """
    Search FTS5 for keyword matches.
    Only queries files with embedding_status='complete'.
    Returns normalized scores (0-1, higher = better).
    """
    if limit is None:
        limit = _MAX_CHUNKS_PER_QUERY

    if not query or not query.strip():
        return []

    # Sanitize the query for FTS5 — escape special chars and add wildcards
    fts_query = _sanitize_fts_query(query)
    if not fts_query:
        return []

    # Build scope filter
    scope_clause = ""
    params = {"query": fts_query, "limit": limit}

    if file_ids:
        placeholders = ", ".join(f":fid_{i}" for i in range(len(file_ids)))
        scope_clause = f"AND fc.file_id IN ({placeholders})"
        for i, fid in enumerate(file_ids):
            params[f"fid_{i}"] = fid
    elif folder_id:
        # Resolve folder + all nested subfolders via recursive CTE
        folder_ids = _resolve_folder_tree(folder_id, db_session)
        if folder_ids:
            placeholders = ", ".join(f":fold_{i}" for i in range(len(folder_ids)))
            scope_clause = f"AND f.folder_id IN ({placeholders})"
            for i, fid in enumerate(folder_ids):
                params[f"fold_{i}"] = fid
    elif dataroom_id:
        scope_clause = "AND fc.dataroom_id = :did"
        params["did"] = dataroom_id

    sql = f"""
        SELECT fc.file_id, fc.dataroom_id, fc.chunk_index, fc.chunk_text,
               fts.rank
        FROM file_chunks_fts fts
        JOIN file_chunks fc ON fc.rowid = fts.rowid
        JOIN files f ON f.id = fc.file_id
        WHERE file_chunks_fts MATCH :query
        AND f.embedding_status = 'complete'
        {scope_clause}
        ORDER BY fts.rank
        LIMIT :limit
    """

    try:
        rows = db_session.execute(text(sql), params).fetchall()
    except Exception as e:
        logger.error(f"keyword_search error: {e}")
        return []

    output = []
    for row in rows:
        bm25_rank = abs(row[4]) if row[4] else 0
        # Normalize: BM25 rank → 0-1 (higher = better)
        score = 1 / (1 + bm25_rank)

        output.append({
            "text": row[3],
            "file_id": row[0],
            "dataroom_id": row[1],
            "chunk_index": row[2],
            "score": round(score, 4),
        })

    return output


def _resolve_folder_tree(folder_id: str, db_session) -> list:
    """Resolve a folder and all its nested subfolders via recursive CTE."""
    try:
        rows = db_session.execute(
            text("""
                WITH RECURSIVE folder_tree(id) AS (
                    SELECT id FROM folders WHERE id = :fid
                    UNION ALL
                    SELECT f.id FROM folders f
                    JOIN folder_tree ft ON f.parent_id = ft.id
                )
                SELECT id FROM folder_tree
            """),
            {"fid": folder_id},
        ).fetchall()
        return [row[0] for row in rows]
    except Exception as e:
        logger.warning(f"_resolve_folder_tree error: {e}")
        return [folder_id]  # Fallback to just the requested folder




def _sanitize_fts_query(query: str) -> str:
    """Sanitize a user query for FTS5 MATCH syntax."""
    # Remove FTS5 special characters
    cleaned = re.sub(r'[^\w\s]', ' ', query)
    # Split into tokens and join with implicit AND
    tokens = [t.strip() for t in cleaned.split() if t.strip()]
    if not tokens:
        return ""
    # Quote each token to prevent FTS5 syntax errors
    return " ".join(f'"{t}"' for t in tokens)


def hybrid_search(query_vector: list, query_text: str, user_id: str,
                  chroma_path: str, db_session,
                  dataroom_id: str = None, file_ids: list = None,
                  folder_id: str = None, n_results: int = None) -> list:
    """
    Combine vector search and keyword search results.
    Chunks appearing in both get a 1.5x score boost.
    Returns top n_results sorted by combined score.
    """
    if n_results is None:
        n_results = _MAX_CHUNKS_PER_QUERY

    # Run both searches
    vector_results = vector_search(
        query_vector, user_id, chroma_path,
        dataroom_id=dataroom_id, file_ids=file_ids,
        folder_id=folder_id, n_results=_MAX_RETRIEVAL_RESULTS,
    )
    keyword_results = keyword_search(
        query_text, db_session,
        dataroom_id=dataroom_id, file_ids=file_ids,
        folder_id=folder_id, limit=_MAX_RETRIEVAL_RESULTS,
    )

    # Merge by (file_id, chunk_index) key
    merged = {}

    for r in vector_results:
        key = (r["file_id"], r["chunk_index"])
        merged[key] = {
            **r,
            "vector_score": r["score"],
            "keyword_score": 0,
            "match_type": "vector",
        }

    for r in keyword_results:
        key = (r["file_id"], r["chunk_index"])
        if key in merged:
            # Chunk in both — boost by 1.5x
            existing = merged[key]
            existing["keyword_score"] = r["score"]
            existing["match_type"] = "both"
            existing["score"] = max(existing["vector_score"], r["score"]) * 1.5
        else:
            merged[key] = {
                **r,
                "vector_score": 0,
                "keyword_score": r["score"],
                "match_type": "keyword",
            }

    # Sort by combined score descending
    sorted_results = sorted(merged.values(), key=lambda x: x["score"], reverse=True)

    # Cap scores at 1.0 for consistency
    for r in sorted_results:
        r["score"] = min(round(r["score"], 4), 1.0)

    return sorted_results[:n_results]


# ---------------------------------------------------------------------------
# Delete functions
# ---------------------------------------------------------------------------

def delete_file_embeddings(file_id: str, user_id: str, chroma_path: str):
    """Delete all embeddings for a file from ChromaDB."""
    try:
        collection = get_chroma_collection(user_id, chroma_path)
        collection.delete(where={"file_id": file_id})
        logger.info(f"delete_file_embeddings: deleted chunks for file {file_id}")
    except Exception as e:
        logger.error(f"delete_file_embeddings error for file {file_id}: {e}")


def delete_dataroom_embeddings(dataroom_id: str, user_id: str, chroma_path: str):
    """Delete all embeddings for a DataRoom from ChromaDB."""
    try:
        collection = get_chroma_collection(user_id, chroma_path)
        collection.delete(where={"dataroom_id": dataroom_id})
        logger.info(f"delete_dataroom_embeddings: deleted chunks for dataroom {dataroom_id}")
    except Exception as e:
        logger.error(f"delete_dataroom_embeddings error for dataroom {dataroom_id}: {e}")


# ---------------------------------------------------------------------------
# Sync functions — called from existing endpoints
# ---------------------------------------------------------------------------

def sync_file_renamed(file_id: str, new_name: str, user_id: str, chroma_path: str):
    """Update file_name in ChromaDB metadata when file is renamed."""
    try:
        collection = get_chroma_collection(user_id, chroma_path)
        results = collection.get(where={"file_id": file_id})
        if results["ids"]:
            for i, chunk_id in enumerate(results["ids"]):
                new_meta = results["metadatas"][i].copy()
                new_meta["file_name"] = new_name
                collection.update(ids=[chunk_id], metadatas=[new_meta])
            logger.info(f"sync_file_renamed: updated {len(results['ids'])} chunks for file {file_id}")
    except Exception as e:
        logger.error(f"sync_file_renamed error for file {file_id}: {e}")


def sync_file_removed(file_id: str, user_id: str, dataroom_id: str,
                      chroma_path: str, db_session):
    """Clean up all Copilot data when file is removed from Orvyn or deleted."""
    delete_file_embeddings(file_id, user_id, chroma_path)
    db_session.execute(text("DELETE FROM file_chunks WHERE file_id = :fid"), {"fid": file_id})
    db_session.execute(text("DELETE FROM file_entities WHERE file_id = :fid"), {"fid": file_id})
    db_session.execute(text("DELETE FROM indexing_jobs WHERE file_id = :fid"), {"fid": file_id})
    # Reclaim FTS5 shadow table space after deletion
    db_session.execute(text("INSERT INTO file_chunks_fts(file_chunks_fts) VALUES('optimize')"))
    db_session.commit()
    logger.info(f"sync_file_removed: cleaned up copilot data for file {file_id}")


def sync_file_moved_folder(file_id: str, new_folder_id: str, user_id: str,
                           dataroom_id: str, chroma_path: str, db_session):
    """Update folder_id in ChromaDB when file moves to a different folder (same DataRoom)."""
    try:
        collection = get_chroma_collection(user_id, chroma_path)
        results = collection.get(where={"file_id": file_id})
        if results["ids"]:
            for i, chunk_id in enumerate(results["ids"]):
                new_meta = results["metadatas"][i].copy()
                new_meta["folder_id"] = new_folder_id or "unclassified"
                collection.update(ids=[chunk_id], metadatas=[new_meta])
    except Exception as e:
        logger.error(f"sync_file_moved_folder error for file {file_id}: {e}")

    db_session.commit()


def sync_file_moved_dataroom(file_id: str, old_dataroom_id: str, new_dataroom_id: str,
                             new_folder_id: str, user_id: str, chroma_path: str,
                             db_session):
    """Update dataroom_id and folder_id in ChromaDB + SQLite when file moves between DataRooms."""
    try:
        collection = get_chroma_collection(user_id, chroma_path)
        results = collection.get(where={"file_id": file_id})
        if results["ids"]:
            for i, chunk_id in enumerate(results["ids"]):
                new_meta = results["metadatas"][i].copy()
                new_meta["dataroom_id"] = new_dataroom_id
                new_meta["folder_id"] = new_folder_id or "unclassified"
                collection.update(ids=[chunk_id], metadatas=[new_meta])
    except Exception as e:
        logger.error(f"sync_file_moved_dataroom error for file {file_id}: {e}")

    db_session.execute(
        text("UPDATE file_chunks SET dataroom_id = :new WHERE file_id = :fid"),
        {"new": new_dataroom_id, "fid": file_id},
    )
    db_session.execute(
        text("UPDATE file_entities SET dataroom_id = :new WHERE file_id = :fid"),
        {"new": new_dataroom_id, "fid": file_id},
    )
    db_session.commit()


def sync_folder_deleted(folder_id: str, dataroom_id: str, all_nested_file_ids: list,
                        user_id: str, chroma_path: str, db_session):
    """Clean up Copilot data for all files when a folder is deleted."""
    for fid in all_nested_file_ids:
        sync_file_removed(fid, user_id, dataroom_id, chroma_path, db_session)
    logger.info(f"sync_folder_deleted: cleaned up {len(all_nested_file_ids)} files for folder {folder_id}")


def sync_dataroom_deleted(dataroom_id: str, user_id: str, chroma_path: str, db_session):
    """Clean up all Copilot data when a DataRoom is deleted."""
    delete_dataroom_embeddings(dataroom_id, user_id, chroma_path)
    db_session.execute(text("DELETE FROM file_chunks WHERE dataroom_id = :did"), {"did": dataroom_id})
    db_session.execute(text("DELETE FROM file_entities WHERE dataroom_id = :did"), {"did": dataroom_id})
    db_session.execute(text("DELETE FROM indexing_jobs WHERE dataroom_id = :did"), {"did": dataroom_id})
    # Use json_each() for exact matching — avoids substring false-match with LIKE
    db_session.execute(text("""
        DELETE FROM chat_sessions
        WHERE scope_type IN ('dataroom', 'multi_dataroom')
        AND EXISTS (SELECT 1 FROM json_each(scope_ids) WHERE json_each.value = :did)
    """), {"did": dataroom_id})
    # Reclaim FTS5 shadow table space after bulk deletion
    db_session.execute(text("INSERT INTO file_chunks_fts(file_chunks_fts) VALUES('optimize')"))
    db_session.commit()
    logger.info(f"sync_dataroom_deleted: cleaned up all copilot data for dataroom {dataroom_id}")


# ---------------------------------------------------------------------------
# File change detection (Triple-check: Recommendation #1)
# ---------------------------------------------------------------------------

def has_file_changed(file_record_row, file_path: str) -> bool:
    """
    Triple-check: size + mtime + checksum.
    Returns True if ANY differ from stored indexing values.
    Fast checks first (stat only), expensive check last (full text extraction).

    file_record_row is a SQLAlchemy row with indexed_file_size, indexed_file_mtime,
    content_checksum fields.
    """
    if not os.path.exists(file_path):
        return False  # File missing — not changed, just missing

    try:
        stat = os.stat(file_path)
    except OSError:
        return False

    stored_size = file_record_row.indexed_file_size
    stored_mtime = file_record_row.indexed_file_mtime
    stored_checksum = file_record_row.content_checksum

    # If never indexed, consider it changed
    if stored_size is None and stored_mtime is None and stored_checksum is None:
        return False  # Never indexed, nothing to compare

    # Fast check 1: file size
    if stored_size is not None and stat.st_size != stored_size:
        return True

    # Fast check 2: OS modified time
    if stored_mtime is not None and stat.st_mtime != stored_mtime:
        return True

    # Slow check 3: content hash (only runs if size+mtime both match)
    if stored_checksum is not None:
        from app.main import _extract_text
        try:
            # Need to determine extension from path
            ext = os.path.splitext(file_path)[1].lower()
            filename = os.path.basename(file_path)
            current_text = _extract_text(file_path, ext, filename)
            current_checksum = compute_content_hash(current_text)
            if current_checksum != stored_checksum:
                return True
        except Exception as e:
            logger.warning(f"has_file_changed: text extraction failed for {file_path}: {e}")
            return True  # Assume changed if we can't verify

    return False


def sync_file_content_changed(file_id: str, dataroom_id: str, user_id: str,
                              chroma_path: str, db_session):
    """Called when has_file_changed() returns True on relocate."""
    sync_file_removed(file_id, user_id, dataroom_id, chroma_path, db_session)
    create_indexing_job(file_id, dataroom_id, db_session)
    logger.info(f"sync_file_content_changed: re-indexing file {file_id}")


# ---------------------------------------------------------------------------
# Indexing job management (Recommendation #2)
# ---------------------------------------------------------------------------

def create_indexing_job(file_id: str, dataroom_id: str, db_session):
    """Create a new indexing job for a file."""
    job_id = str(uuid.uuid4())
    db_session.execute(
        text("""
            INSERT INTO indexing_jobs (id, file_id, dataroom_id, status)
            VALUES (:id, :fid, :did, 'pending')
        """),
        {"id": job_id, "fid": file_id, "did": dataroom_id},
    )
    # Set embedding_status to pending on the file
    db_session.execute(
        text("UPDATE files SET embedding_status = 'pending' WHERE id = :fid"),
        {"fid": file_id},
    )
    db_session.commit()
    logger.info(f"create_indexing_job: created job {job_id} for file {file_id}")
    return job_id


def recover_stale_indexing_jobs(db_session):
    """
    Handle jobs stuck in 'processing' at startup.

    On app startup, NO worker is actually running, so ALL 'processing' jobs are
    stale by definition.  Jobs under the retry cap are reset to 'pending' (attempts
    is NOT incremented — the crash/shutdown was not the job's fault).  Jobs at or
    over the cap are set to 'failed' permanently.

    Called once at Python startup inside /init-db.
    """
    # All 'processing' jobs are stale on startup — reset those under the retry cap
    result = db_session.execute(text("""
        UPDATE indexing_jobs
        SET status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'processing'
        AND attempts < :max_attempts
    """), {"max_attempts": _MAX_RETRY_ATTEMPTS})

    recovered_count = result.rowcount

    # Jobs at or over the cap: mark as failed permanently
    failed_result = db_session.execute(text("""
        UPDATE indexing_jobs
        SET status = 'failed', updated_at = CURRENT_TIMESTAMP,
            error_message = 'Max retries exceeded'
        WHERE status = 'processing'
        AND attempts >= :max_attempts
    """), {"max_attempts": _MAX_RETRY_ATTEMPTS})

    failed_count = failed_result.rowcount

    # Reset embedding_status for files whose jobs were reset to pending
    if recovered_count > 0:
        db_session.execute(text("""
            UPDATE files SET embedding_status = 'pending'
            WHERE id IN (
                SELECT file_id FROM indexing_jobs
                WHERE status = 'pending' AND attempts > 0
            ) AND embedding_status = 'processing'
        """))

    # Mark embedding_status as failed for files whose jobs exceeded the cap
    if failed_count > 0:
        db_session.execute(text("""
            UPDATE files SET embedding_status = 'failed'
            WHERE id IN (
                SELECT file_id FROM indexing_jobs WHERE status = 'failed'
                AND error_message = 'Max retries exceeded'
            ) AND embedding_status = 'processing'
        """))

    db_session.commit()

    if recovered_count > 0:
        logger.info(f"recover_stale_indexing_jobs: reset {recovered_count} stale jobs to pending")
    if failed_count > 0:
        logger.info(f"recover_stale_indexing_jobs: permanently failed {failed_count} jobs (max retries exceeded)")
    return recovered_count
