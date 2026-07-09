"""
AI Classification Service — Data preparation & result application for Orvyn.

Gemini API calls have moved to the Express backend (holds the API key securely).
This module now handles only:
  - Building file fingerprints from the local SQLite database
  - Building folder tree representations for classification context
  - Applying AI classification results back to the database
"""

import datetime
import uuid

from sqlalchemy.orm import Session

from app.main import DataRoom, Folder, File, Classification


# ---------------------------------------------------------------------------
# Fingerprint & folder-tree helpers
# ---------------------------------------------------------------------------

def create_fingerprint(file_record) -> dict:
    """
    Build a lightweight fingerprint dict from a File ORM object.
    Used as input context for the AI classification prompt.
    """
    text = file_record.extracted_text or ""

    # For images where extracted_text is just "[Image: filename]", use name-based preview
    if text.startswith("[Image:"):
        preview = f"(image file: {file_record.original_name})"
    else:
        preview = text[:1000]

    return {
        "id": file_record.id,
        "name": file_record.original_name,
        "extension": file_record.file_extension,
        "preview": preview,
        "type": file_record.mime_type or "unknown",
    }


def build_folder_tree(session, dataroom_id: str) -> str:
    """
    Query all folders for a DataRoom and build a nested text tree
    with IDs and context descriptions for use in the AI prompt.
    """
    folders = (
        session.query(Folder)
        .filter_by(dataroom_id=dataroom_id)
        .order_by(Folder.display_order)
        .all()
    )

    # Build lookup by parent_id
    children_map = {}
    for f in folders:
        parent = f.parent_id or "__root__"
        children_map.setdefault(parent, []).append(f)

    lines = []

    def _recurse(parent_key: str, depth: int):
        for f in children_map.get(parent_key, []):
            indent = "  " * depth
            lines.append(f"{indent}- [{f.id}] {f.name}: {f.context}")
            _recurse(f.id, depth + 1)

    _recurse("__root__", 0)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prepare functions — build data for Express/Gemini
# ---------------------------------------------------------------------------

def prepare_classify(engine, dataroom_id: str, file_ids: list[str]) -> dict:
    """
    Prepare fingerprints and folder tree for external AI classification.
    Returns data that Electron forwards to Express for the Gemini call.
    """
    with Session(engine) as session:
        # Build folder tree
        folders = (
            session.query(Folder)
            .filter_by(dataroom_id=dataroom_id)
            .all()
        )
        if not folders:
            raise ValueError("DataRoom has no folders to classify into.")

        folder_ids = [f.id for f in folders]
        folder_tree = build_folder_tree(session, dataroom_id)

        # Build file fingerprints
        files = session.query(File).filter(File.id.in_(file_ids)).all()
        found_ids = {f.id for f in files}
        missing = [fid for fid in file_ids if fid not in found_ids]

        fingerprints = [create_fingerprint(f) for f in files]

    return {
        "fingerprints": fingerprints,
        "folder_tree": folder_tree,
        "folder_ids": folder_ids,
        "missing_file_ids": missing,
    }


def prepare_generate(engine, file_ids: list[str]) -> dict:
    """
    Prepare file fingerprints for AI DataRoom generation.
    Returns data that Electron forwards to Express for the Gemini call.
    """
    with Session(engine) as session:
        files = session.query(File).filter(File.id.in_(file_ids)).all()
        found_ids = {f.id for f in files}
        missing = [fid for fid in file_ids if fid not in found_ids]

        preview_len = 500 if len(files) > 30 else 1000
        fingerprints = []
        for f in files:
            fp = create_fingerprint(f)
            fp["preview"] = fp["preview"][:preview_len]
            fingerprints.append(fp)

    return {
        "fingerprints": fingerprints,
        "missing_file_ids": missing,
    }


# ---------------------------------------------------------------------------
# Apply functions — write AI results to database
# ---------------------------------------------------------------------------

def apply_classify_results(engine, dataroom_id: str, results: list) -> dict:
    """
    Apply classification results (from Express/Gemini) to the database.
    Updates file folder assignments and creates Classification records.
    """
    with Session(engine) as session:
        # Get valid folder IDs for this DataRoom
        folder_ids_set = {
            f.id for f in session.query(Folder).filter_by(dataroom_id=dataroom_id).all()
        }

        classified_count = 0
        skipped_count = 0

        for r in results:
            file_record = session.query(File).filter_by(id=r.get("file_id")).first()
            if not file_record:
                continue

            fid = r.get("folder_id")
            if fid is not None and fid not in folder_ids_set:
                fid = None

            confidence = float(r.get("confidence", 0.0))

            file_record.status = "classified"
            file_record.updated_at = datetime.datetime.utcnow()

            # Only assign folder if confidence >= 0.4
            if fid and confidence >= 0.4:
                file_record.folder_id = fid
                classified_count += 1
            else:
                skipped_count += 1

            # Create Classification record when a folder was suggested
            if fid:
                classification = Classification(
                    id=str(uuid.uuid4()),
                    file_id=r["file_id"],
                    folder_id=fid,
                    confidence=confidence,
                    reasoning=r.get("reasoning", ""),
                )
                session.add(classification)

        session.commit()

    return {
        "status": "success",
        "dataroom_id": dataroom_id,
        "classified": classified_count,
        "low_confidence_skipped": skipped_count,
    }


def apply_generate_results(
    engine,
    name: str,
    description: str,
    gemini_result: dict,
    file_ids: list[str],
    dataroom_id: str = None,
) -> dict:
    """
    Apply AI-generated DataRoom structure (from Express/Gemini) to the database.
    If dataroom_id is provided, reuses the existing DataRoom; otherwise creates a new one.
    Creates folders and assigns files.
    """
    with Session(engine) as session:
        if dataroom_id:
            # Reuse existing DataRoom
            dataroom = session.query(DataRoom).filter_by(id=dataroom_id).first()
            if not dataroom:
                raise ValueError(f"DataRoom {dataroom_id} not found.")
            dataroom.name = name
            dataroom.description = description
            dataroom.created_by_ai = True
        else:
            # Create new DataRoom
            dataroom = DataRoom(
                id=str(uuid.uuid4()),
                name=name,
                description=description,
                created_by_ai=True,
            )
            session.add(dataroom)
            session.flush()

        # Recursively create folders — build path-to-id mapping
        folder_path_map = {}

        def _create_folders(folder_defs: list, parent_id=None, path_prefix=()):
            for order, fdef in enumerate(folder_defs):
                folder_name = fdef["name"]
                folder_context = fdef.get("context", folder_name)
                current_path = path_prefix + (folder_name,)

                folder = Folder(
                    id=str(uuid.uuid4()),
                    dataroom_id=dataroom.id,
                    name=folder_name,
                    context=folder_context,
                    parent_id=parent_id,
                    display_order=order,
                    created_by_ai=True,
                )
                session.add(folder)
                session.flush()

                folder_path_map[current_path] = folder.id

                children = fdef.get("children", [])
                if children:
                    _create_folders(children, parent_id=folder.id, path_prefix=current_path)

        _create_folders(gemini_result.get("folders", []))

        # Assign files and create Classification records
        assigned_count = 0
        unassigned_count = 0
        missing = []

        for assignment in gemini_result.get("assignments", []):
            file_id = assignment.get("file_id")
            folder_path = tuple(assignment.get("folder_path", []))
            confidence = float(assignment.get("confidence", 0.0))
            reasoning = assignment.get("reasoning", "")

            folder_id = folder_path_map.get(folder_path)
            if not folder_id:
                unassigned_count += 1
                continue

            file_record = session.query(File).filter_by(id=file_id).first()
            if not file_record:
                missing.append(file_id)
                continue

            file_record.dataroom_id = dataroom.id
            file_record.folder_id = folder_id if confidence >= 0.4 else None
            file_record.status = "classified"
            file_record.updated_at = datetime.datetime.utcnow()

            classification = Classification(
                id=str(uuid.uuid4()),
                file_id=file_id,
                folder_id=folder_id,
                confidence=confidence,
                reasoning=reasoning,
            )
            session.add(classification)
            assigned_count += 1

        session.commit()
        session.refresh(dataroom)

        return {
            "status": "success",
            "dataroom": {
                "id": dataroom.id,
                "name": dataroom.name,
                "description": dataroom.description,
                "created_by_ai": True,
            },
            "folders_created": len(folder_path_map),
            "files_assigned": assigned_count,
            "files_unassigned": unassigned_count,
            "missing_file_ids": missing,
        }
