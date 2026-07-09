"""
Chat Service — Chat context preparation and message persistence for Orvyn Copilot.

Handles:
  - Chat session creation and management
  - Hybrid search context preparation for Gemini
  - Chat message persistence
  - Token explosion protection

Python NEVER calls Gemini directly. This service only prepares data for
Electron to orchestrate calls to Express (which holds the API key).
"""

import os
import uuid
import json
import logging
import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("Orvyn.chat_service")

# ---------------------------------------------------------------------------
# Configuration — loaded from environment
# ---------------------------------------------------------------------------

_MAX_CHAT_HISTORY = int(os.getenv("COPILOT_MAX_CHAT_HISTORY", "10"))
_MAX_CONTEXT_TOKENS = int(os.getenv("COPILOT_MAX_CONTEXT_TOKENS", "8000"))
_MAX_MESSAGE_LENGTH = int(os.getenv("COPILOT_MAX_MESSAGE_LENGTH", "10000"))


# ---------------------------------------------------------------------------
# Token explosion protection
# ---------------------------------------------------------------------------

def trim_chunks_to_token_limit(chunks: list, max_tokens: int = None) -> list:
    """
    Trim chunks to fit within a token budget.
    Approximation: 1 token ≈ 4 chars.
    """
    limit = (max_tokens or _MAX_CONTEXT_TOKENS) * 4
    total_chars = 0
    trimmed = []
    for chunk in chunks:
        chunk_text = chunk.get("text", "")
        chunk_chars = len(chunk_text)
        if total_chars + chunk_chars > limit:
            break
        trimmed.append(chunk)
        total_chars += chunk_chars
    return trimmed


# ---------------------------------------------------------------------------
# Message validation
# ---------------------------------------------------------------------------

def validate_message_length(message: str) -> None:
    """
    Validate that a user message does not exceed the maximum allowed length.
    Raises ValueError if the message is too long.
    """
    if len(message) > _MAX_MESSAGE_LENGTH:
        raise ValueError(
            f"Message exceeds maximum length of {_MAX_MESSAGE_LENGTH} characters "
            f"(got {len(message)})."
        )


# ---------------------------------------------------------------------------
# Session pruning
# ---------------------------------------------------------------------------

def _prune_excess_sessions(db_session: Session, max_sessions: int = 10) -> None:
    """Delete oldest chat sessions if total count exceeds max_sessions."""
    count_row = db_session.execute(
        text("SELECT COUNT(*) FROM chat_sessions")
    ).fetchone()
    total = count_row[0] if count_row else 0

    if total > max_sessions:
        excess = total - max_sessions
        oldest = db_session.execute(
            text("""
                SELECT id FROM chat_sessions
                ORDER BY updated_at ASC
                LIMIT :excess
            """),
            {"excess": excess},
        ).fetchall()

        for row in oldest:
            db_session.execute(
                text("DELETE FROM chat_sessions WHERE id = :sid"),
                {"sid": row[0]},
            )
        db_session.commit()
        logger.info(f"Pruned {len(oldest)} excess chat sessions (max={max_sessions})")


# ---------------------------------------------------------------------------
# Chat context preparation
# ---------------------------------------------------------------------------

def prepare_chat_context(
    message: str,
    query_vector: list,
    session_id: Optional[str],
    scope_type: str,
    scope_ids: Optional[list],
    scope_name: Optional[str],
    user_id: str,
    db_session: Session,
    chroma_path: str,
) -> dict:
    """
    Prepare context for the Copilot chat flow.

    1. Create or retrieve a chat session.
    2. Run hybrid_search with scope filters.
    3. Fetch recent chat history.
    4. Trim chunks to token limit.
    5. Format chunks as labeled document excerpts.

    Returns:
        {
            session_id, session_title, scope_name,
            formatted_chunks (str), raw_chunks ([...]),
            history ([{role, content}]),
            sources ([{file_id, file_name, chunk_text_preview, relevance, page_number}])
        }
    """
    from app.services.embedding_service import hybrid_search

    # Validate message
    validate_message_length(message)

    # 1. Create or retrieve session
    if session_id:
        row = db_session.execute(
            text("SELECT id, title, scope_name FROM chat_sessions WHERE id = :sid"),
            {"sid": session_id},
        ).fetchone()
        if not row:
            raise ValueError(f"Chat session not found: {session_id}")
        session_title = row[1]
        effective_scope_name = row[2] or scope_name
    else:
        session_id = str(uuid.uuid4())
        scope_ids_json = json.dumps(scope_ids) if scope_ids else None
        db_session.execute(
            text("""
                INSERT INTO chat_sessions (id, scope_type, scope_ids, scope_name)
                VALUES (:id, :stype, :sids, :sname)
            """),
            {
                "id": session_id,
                "stype": scope_type,
                "sids": scope_ids_json,
                "sname": scope_name,
            },
        )
        db_session.commit()
        session_title = None
        effective_scope_name = scope_name
        logger.info(f"Created chat session {session_id} (scope={scope_type})")

        # Prune excess sessions: keep only the newest 10
        _prune_excess_sessions(db_session, max_sessions=10)

    # 2. Resolve scope filters for hybrid search
    dataroom_id = None
    file_ids = None
    folder_id = None

    if scope_type == "file" and scope_ids:
        file_ids = scope_ids
    elif scope_type == "folder" and scope_ids:
        folder_id = scope_ids[0] if scope_ids else None
    elif scope_type == "dataroom" and scope_ids:
        dataroom_id = scope_ids[0] if scope_ids else None
    elif scope_type == "multi_dataroom" and scope_ids:
        pass  # handled below: search each DR and merge
    # global scope: no filters

    # 3. Run hybrid search
    if scope_type == "multi_dataroom" and scope_ids and len(scope_ids) > 1:
        # Search each DataRoom separately, then merge by score
        all_results = []
        for dr_id in scope_ids:
            dr_results = hybrid_search(
                query_vector=query_vector,
                query_text=message,
                user_id=user_id,
                chroma_path=chroma_path,
                db_session=db_session,
                dataroom_id=dr_id,
            )
            all_results.extend(dr_results)
        # Sort merged results by score descending and cap
        all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
        search_results = all_results[:int(os.getenv("RAG_MAX_CHUNKS_PER_QUERY", "8"))]
    else:
        search_results = hybrid_search(
            query_vector=query_vector,
            query_text=message,
            user_id=user_id,
            chroma_path=chroma_path,
            db_session=db_session,
            dataroom_id=dataroom_id,
            file_ids=file_ids,
            folder_id=folder_id,
        )

    # 3b. Deduplicate: hybrid search can return the same chunk from both vector + keyword
    seen = set()
    unique_results = []
    for chunk in search_results:
        key = (chunk.get("file_id"), chunk.get("chunk_index"))
        if key not in seen:
            unique_results.append(chunk)
            seen.add(key)
    search_results = unique_results

    # 4. Trim to token limit
    trimmed_chunks = trim_chunks_to_token_limit(search_results)

    # 5. Resolve DataRoom names for cross-DR source display
    dr_name_cache = {}
    dr_ids_in_results = set(c.get("dataroom_id") for c in trimmed_chunks if c.get("dataroom_id"))
    if dr_ids_in_results:
        placeholders = ", ".join(f":dr_{i}" for i in range(len(dr_ids_in_results)))
        params = {f"dr_{i}": dr_id for i, dr_id in enumerate(dr_ids_in_results)}
        rows = db_session.execute(
            text(f"SELECT id, name FROM datarooms WHERE id IN ({placeholders})"),
            params,
        ).fetchall()
        dr_name_cache = {row[0]: row[1] for row in rows}

    is_cross_dr = scope_type in ("global", "multi_dataroom") or len(dr_ids_in_results) > 1

    # 6. Format chunks as labeled document excerpts + build sources
    formatted_parts = []
    raw_sources = []

    for chunk in trimmed_chunks:
        file_name = chunk.get("file_name", "Unknown")
        page_number = chunk.get("page_number")
        section_number = chunk.get("section_number")
        section_name = chunk.get("section_name")
        chunk_text = chunk.get("text", "")
        chunk_dr_id = chunk.get("dataroom_id")
        chunk_dr_name = dr_name_cache.get(chunk_dr_id, "")

        raw_sources.append({
            "file_id": chunk.get("file_id"),
            "file_name": file_name,
            "dataroom_id": chunk_dr_id,
            "dataroom_name": chunk_dr_name,
            "chunk_text_preview": chunk_text[:200],
            "relevance": chunk.get("score", 0),
            "page_number": page_number,
            "section_number": section_number,
            "section_name": section_name,
        })

    # --- Deduplicate sources by file_id (keep highest relevance) ---
    deduped = {}
    for src in raw_sources:
        fid = src.get("file_id")
        if fid not in deduped or src.get("relevance", 0) > deduped[fid].get("relevance", 0):
            deduped[fid] = src
    sources = list(deduped.values())

    # Assign sequential source_number (1-based)
    for idx, src in enumerate(sources):
        src["source_number"] = idx + 1

    # Batch query for folder_id
    file_ids_for_folder = [s["file_id"] for s in sources if s.get("file_id")]
    if file_ids_for_folder:
        placeholders = ", ".join(f":fid_{i}" for i in range(len(file_ids_for_folder)))
        params = {f"fid_{i}": fid for i, fid in enumerate(file_ids_for_folder)}
        folder_rows = db_session.execute(
            text(f"SELECT id, folder_id FROM files WHERE id IN ({placeholders})"),
            params,
        ).fetchall()
        folder_map = {row[0]: row[1] for row in folder_rows}
        for src in sources:
            src["folder_id"] = folder_map.get(src.get("file_id"))

    # Build numbered source lookup for formatting
    file_source_num = {s["file_id"]: s["source_number"] for s in sources}

    # Build formatted_parts from trimmed_chunks using numbered labels
    for chunk in trimmed_chunks:
        file_name = chunk.get("file_name", "Unknown")
        file_id = chunk.get("file_id")
        chunk_text = chunk.get("text", "")
        chunk_dr_id = chunk.get("dataroom_id")
        chunk_dr_name = dr_name_cache.get(chunk_dr_id, "")
        page_number = chunk.get("page_number")
        section_number = chunk.get("section_number")
        section_name = chunk.get("section_name")

        num = file_source_num.get(file_id, "?")

        # Build source label with number prefix
        if is_cross_dr and chunk_dr_name:
            source_label = f"[{num}] 📁 {chunk_dr_name} > {file_name}"
        else:
            source_label = f"[{num}] {file_name}"
        if page_number:
            source_label += f", Page {page_number}"
        elif section_number:
            source_label += f", Section {section_number}"
        elif section_name:
            source_label += f", Sheet {section_name}"

        formatted_parts.append(
            f"--- [{source_label}] ---\n{chunk_text}\n--- end ---"
        )

    formatted_chunks = "\n\n".join(formatted_parts)

    # 7. Fetch chat history (last N messages)
    history_rows = db_session.execute(
        text("""
            SELECT role, content FROM chat_messages
            WHERE session_id = :sid
            ORDER BY created_at DESC
            LIMIT :limit
        """),
        {"sid": session_id, "limit": _MAX_CHAT_HISTORY},
    ).fetchall()

    # Reverse to chronological order
    history = [{"role": row[0], "content": row[1]} for row in reversed(history_rows)]

    return {
        "session_id": session_id,
        "session_title": session_title,
        "scope_name": effective_scope_name,
        "formatted_chunks": formatted_chunks,
        "raw_chunks": trimmed_chunks,
        "history": history,
        "sources": sources,
    }


# ---------------------------------------------------------------------------
# Save chat messages
# ---------------------------------------------------------------------------

def save_chat_messages(
    session_id: str,
    user_message: str,
    assistant_response: str,
    sources_json: Optional[str],
    tool_calls_json: Optional[str],
    db_session: Session,
) -> None:
    """
    Persist a user message and assistant response to SQLite.
    Updates the session's updated_at timestamp.
    """
    # Insert user message
    db_session.execute(
        text("""
            INSERT INTO chat_messages (id, session_id, role, content)
            VALUES (:id, :sid, 'user', :content)
        """),
        {"id": str(uuid.uuid4()), "sid": session_id, "content": user_message},
    )

    # Insert assistant message
    db_session.execute(
        text("""
            INSERT INTO chat_messages (id, session_id, role, content, sources, tool_calls)
            VALUES (:id, :sid, 'assistant', :content, :sources, :tools)
        """),
        {
            "id": str(uuid.uuid4()),
            "sid": session_id,
            "content": assistant_response,
            "sources": sources_json,
            "tools": tool_calls_json,
        },
    )

    # Update session timestamp
    db_session.execute(
        text("UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = :sid"),
        {"sid": session_id},
    )

    db_session.commit()
    logger.info(f"Saved messages for session {session_id}")


# ---------------------------------------------------------------------------
# Update session title
# ---------------------------------------------------------------------------

def update_session_title(session_id: str, title: str, db_session: Session) -> None:
    """Update the title of a chat session."""
    db_session.execute(
        text("UPDATE chat_sessions SET title = :title, updated_at = CURRENT_TIMESTAMP WHERE id = :sid"),
        {"sid": session_id, "title": title},
    )
    db_session.commit()
    logger.info(f"Updated title for session {session_id}: {title}")
