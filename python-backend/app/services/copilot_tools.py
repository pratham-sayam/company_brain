"""
Copilot Tools — Tool implementations and audit/insights data preparation.

Handles:
  - Gemini function calling tool implementations (Python executes directly)
  - Data preparation for Gemini-dependent tools (Express calls Gemini)
  - Audit data preparation and result application
  - DataRoom insights preparation and storage
  - Suggested questions retrieval

Python NEVER calls Gemini directly. For tools that need LLM reasoning
(compare, summarize, extract, audit), Python prepares the data and Electron
sends it to Express which holds the API key.
"""

import hashlib
import os
import uuid
import json
import logging
import datetime
from typing import Optional, List

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("Orvyn.copilot_tools")

# Overlap trim (slightly less than RAG_CHUNK_OVERLAP_CHARS=750 for safety)
_OVERLAP_TRIM = int(os.getenv("RAG_CHUNK_OVERLAP_CHARS", "750")) - 50


def _concatenate_chunks(chunk_rows: list, max_chars: int = 10000) -> str:
    """Concatenate ordered chunks with overlap trimming and character cap.

    Chunks have ~750 char overlap. For chunks after the first, skip leading
    content that overlaps with the previous chunk's tail. Uses a conservative
    trim (750-50=700) to avoid cutting unique content at paragraph boundaries.
    """
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


# ---------------------------------------------------------------------------
# Data-only tools — Python executes directly
# ---------------------------------------------------------------------------

def tool_search_documents(
    query_vector: list,
    query_text: str,
    scope_type: str,
    scope_ids: Optional[list],
    user_id: str,
    db_session: Session,
    chroma_path: str,
) -> dict:
    """
    Tool: search_documents
    Called by Electron when Gemini requests a document search.
    Runs hybrid_search and returns formatted results with source labels.
    """
    import os
    from app.services.embedding_service import hybrid_search

    # Resolve scope filters
    dataroom_id = None
    file_ids = None
    folder_id = None

    if scope_type == "file" and scope_ids:
        file_ids = scope_ids
    elif scope_type == "folder" and scope_ids:
        folder_id = scope_ids[0]
    elif scope_type == "dataroom" and scope_ids:
        dataroom_id = scope_ids[0]
    elif scope_type == "multi_dataroom" and scope_ids:
        if len(scope_ids) == 1:
            dataroom_id = scope_ids[0]
        else:
            # Search each DataRoom separately, then merge and re-rank by score
            all_results = []
            for dr_id in scope_ids:
                dr_results = hybrid_search(
                    query_vector=query_vector,
                    query_text=query_text,
                    user_id=user_id,
                    chroma_path=chroma_path,
                    db_session=db_session,
                    dataroom_id=dr_id,
                )
                all_results.extend(dr_results)
            all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
            max_chunks = int(os.getenv("RAG_MAX_CHUNKS_PER_QUERY", "8"))
            results = all_results[:max_chunks]
            # Skip the single hybrid_search call below and format directly
            return _format_tool_search_results(results)
    # global: no filter

    results = hybrid_search(
        query_vector=query_vector,
        query_text=query_text,
        user_id=user_id,
        chroma_path=chroma_path,
        db_session=db_session,
        dataroom_id=dataroom_id,
        file_ids=file_ids,
        folder_id=folder_id,
    )

    return _format_tool_search_results(results)


def _format_tool_search_results(results: list) -> dict:
    """Format hybrid search results for Gemini tool consumption."""
    formatted_parts = []
    for chunk in results:
        file_name = chunk.get("file_name", "Unknown")
        page_number = chunk.get("page_number")
        chunk_text = chunk.get("text", "")

        label = f"Source: {file_name}"
        if page_number:
            label += f", Page {page_number}"

        formatted_parts.append(f"[{label}]\n{chunk_text}")

    return {
        "results": "\n\n---\n\n".join(formatted_parts),
        "result_count": len(results),
        "sources": [
            {
                "file_id": c.get("file_id"),
                "file_name": c.get("file_name"),
                "relevance": c.get("score", 0),
            }
            for c in results
        ],
    }


def tool_get_file_content(file_id: str, db_session: Session) -> dict:
    """
    Tool: get_file_content
    Fetch a file's content from chunks (full document) with preview fallback.
    """
    row = db_session.execute(
        text("""
            SELECT original_name, file_extension, ai_summary, extracted_text
            FROM files WHERE id = :fid
        """),
        {"fid": file_id},
    ).fetchone()

    if not row:
        return {"error": f"File not found: {file_id}"}

    original_name = row[0]
    file_extension = row[1]
    ai_summary = row[2]
    preview_text = row[3] or ""

    # Try to read full content from chunks (post-indexing)
    chunk_rows = db_session.execute(
        text("""
            SELECT chunk_text FROM file_chunks
            WHERE file_id = :fid
            ORDER BY chunk_index ASC
        """),
        {"fid": file_id},
    ).fetchall()

    if chunk_rows:
        content = _concatenate_chunks(chunk_rows, max_chars=10000)
    else:
        # Fallback to preview (file not yet indexed)
        content = preview_text

    result = {
        "file_name": original_name,
        "file_type": file_extension,
        "content": content,
    }

    if ai_summary:
        result["summary"] = ai_summary

    return result


def tool_list_files(
    dataroom_id: str,
    folder_id: Optional[str],
    db_session: Session,
) -> dict:
    """
    Tool: list_files_in_dataroom
    Query files in scope with metadata.
    """
    if folder_id:
        rows = db_session.execute(
            text("""
                SELECT f.id, f.original_name, f.file_extension, f.size_bytes,
                       fo.name AS folder_name, f.ai_summary
                FROM files f
                LEFT JOIN folders fo ON f.folder_id = fo.id
                WHERE f.dataroom_id = :did AND f.folder_id = :folid
                ORDER BY f.original_name
            """),
            {"did": dataroom_id, "folid": folder_id},
        ).fetchall()
    else:
        rows = db_session.execute(
            text("""
                SELECT f.id, f.original_name, f.file_extension, f.size_bytes,
                       fo.name AS folder_name, f.ai_summary
                FROM files f
                LEFT JOIN folders fo ON f.folder_id = fo.id
                WHERE f.dataroom_id = :did
                ORDER BY f.original_name
            """),
            {"did": dataroom_id},
        ).fetchall()

    files = []
    for row in rows:
        files.append({
            "id": row[0],
            "name": row[1],
            "type": row[2],
            "size": row[3],
            "folder_name": row[4] or "Unclassified",
            "ai_summary": row[5],
        })

    return {"files": files, "count": len(files)}


def tool_get_entities(
    scope_type: str,
    scope_id: str,
    db_session: Session,
) -> dict:
    """
    Tool: get_entities
    Query file_entities table grouped by entity_type.
    """
    if scope_type == "file":
        rows = db_session.execute(
            text("""
                SELECT entity_type, entity_value, context
                FROM file_entities
                WHERE file_id = :sid
                ORDER BY entity_type, entity_value
            """),
            {"sid": scope_id},
        ).fetchall()
    elif scope_type == "dataroom":
        rows = db_session.execute(
            text("""
                SELECT entity_type, entity_value, context
                FROM file_entities
                WHERE dataroom_id = :sid
                ORDER BY entity_type, entity_value
            """),
            {"sid": scope_id},
        ).fetchall()
    else:
        return {"error": f"Invalid scope_type: {scope_type}. Must be 'file' or 'dataroom'."}

    # Group by entity_type
    grouped = {}
    for row in rows:
        entity_type = row[0]
        if entity_type not in grouped:
            grouped[entity_type] = []
        entry = {"value": row[1]}
        if row[2]:
            entry["context"] = row[2]
        grouped[entity_type].append(entry)

    return {"entities": grouped}


def tool_find_similar(
    file_id: str,
    representative_chunk_vector: list,
    user_id: str,
    chroma_path: str,
    max_results: int = 5,
) -> dict:
    """
    Tool: find_similar_documents
    Vector search across ALL DataRooms, exclude same-file chunks.
    """
    from app.services.embedding_service import vector_search

    # Search globally (no dataroom filter) for similar content
    results = vector_search(
        query_vector=representative_chunk_vector,
        user_id=user_id,
        chroma_path=chroma_path,
        n_results=max_results + 10,  # Fetch extra to account for same-file filtering
    )

    # Filter out chunks from the same file and deduplicate by file_id
    seen_files = set()
    similar = []
    for chunk in results:
        chunk_file_id = chunk.get("file_id")
        if chunk_file_id == file_id:
            continue
        if chunk_file_id in seen_files:
            continue
        seen_files.add(chunk_file_id)
        similar.append({
            "file_id": chunk_file_id,
            "file_name": chunk.get("file_name", "Unknown"),
            "dataroom_id": chunk.get("dataroom_id"),
            "similarity_score": chunk.get("score", 0),
            "matching_text_preview": chunk.get("text", "")[:200],
        })
        if len(similar) >= max_results:
            break

    return {"similar_documents": similar, "count": len(similar)}


# ---------------------------------------------------------------------------
# Gemini-dependent tools — Python prepares data only
# ---------------------------------------------------------------------------

def prepare_compare_data(file_ids: list, db_session: Session) -> dict:
    """
    Prepare data for compare_documents tool.
    Reads from chunks (full document) with preview fallback, capped at 5000 chars per file.
    """
    files_data = []

    for fid in file_ids:
        row = db_session.execute(
            text("""
                SELECT original_name, file_extension, extracted_text
                FROM files WHERE id = :fid
            """),
            {"fid": fid},
        ).fetchone()

        if not row:
            continue

        # Try chunks first (full document content)
        chunk_rows = db_session.execute(
            text("""
                SELECT chunk_text FROM file_chunks
                WHERE file_id = :fid
                ORDER BY chunk_index ASC
            """),
            {"fid": fid},
        ).fetchall()

        if chunk_rows:
            content = _concatenate_chunks(chunk_rows, max_chars=5000)
        else:
            content = (row[2] or "")[:3000]

        files_data.append({
            "file_id": fid,
            "file_name": row[0],
            "file_type": row[1],
            "content": content,
        })

    return {"files": files_data, "file_count": len(files_data)}


def prepare_summarize_data(dataroom_id: str, db_session: Session) -> dict:
    """
    Prepare data for summarize_dataroom tool.
    Gets all files with ai_summaries and folder structure.
    """
    # Get dataroom info
    dr_row = db_session.execute(
        text("SELECT name, description FROM datarooms WHERE id = :did"),
        {"did": dataroom_id},
    ).fetchone()

    if not dr_row:
        return {"error": f"DataRoom not found: {dataroom_id}"}

    # Get files with summaries
    file_rows = db_session.execute(
        text("""
            SELECT f.original_name, f.file_extension, f.size_bytes,
                   fo.name AS folder_name, f.ai_summary
            FROM files f
            LEFT JOIN folders fo ON f.folder_id = fo.id
            WHERE f.dataroom_id = :did
            ORDER BY fo.name, f.original_name
        """),
        {"did": dataroom_id},
    ).fetchall()

    files = []
    for row in file_rows:
        files.append({
            "name": row[0],
            "type": row[1],
            "size": row[2],
            "folder": row[3] or "Unclassified",
            "summary": row[4] or "No summary available",
        })

    # Get folder structure
    folder_rows = db_session.execute(
        text("""
            SELECT name, context, parent_id
            FROM folders WHERE dataroom_id = :did
            ORDER BY display_order
        """),
        {"did": dataroom_id},
    ).fetchall()

    folders = [{"name": r[0], "context": r[1], "parent_id": r[2]} for r in folder_rows]

    return {
        "dataroom_name": dr_row[0],
        "dataroom_description": dr_row[1],
        "files": files,
        "folders": folders,
        "file_count": len(files),
        "folder_count": len(folders),
    }


def prepare_extract_data(
    query: str,
    dataroom_id: str,
    query_vector: list,
    user_id: str,
    chroma_path: str,
    db_session: Session,
) -> dict:
    """
    Prepare data for extract_data_point tool.
    Search for the specific data point via hybrid search and return top chunks.
    """
    from app.services.embedding_service import hybrid_search

    results = hybrid_search(
        query_vector=query_vector,
        query_text=query,
        user_id=user_id,
        chroma_path=chroma_path,
        db_session=db_session,
        dataroom_id=dataroom_id,
    )

    # Format top results for extraction
    formatted_parts = []
    for chunk in results[:5]:  # Top 5 most relevant
        file_name = chunk.get("file_name", "Unknown")
        chunk_text = chunk.get("text", "")
        formatted_parts.append(f"[Source: {file_name}]\n{chunk_text}")

    return {
        "query": query,
        "relevant_excerpts": "\n\n---\n\n".join(formatted_parts),
        "sources": [
            {"file_id": c.get("file_id"), "file_name": c.get("file_name")}
            for c in results[:5]
        ],
    }


