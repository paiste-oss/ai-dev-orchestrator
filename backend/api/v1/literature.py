"""
Literatur-Endpunkte — persönliche Literaturdatenbank pro Kunde.

  GET    /v1/literature/mine                        — eigene Einträge
  POST   /v1/literature/                            — manuell anlegen
  PUT    /v1/literature/{id}                        — bearbeiten
  DELETE /v1/literature/{id}                        — löschen
  POST   /v1/literature/import                      — .ris / .xml Datei importieren
  POST   /v1/literature/import-pdfs                 — ZIP direkt hochladen (≤ 90 MB)
  POST   /v1/literature/import-pdfs/upload-chunk    — Chunk-Upload für grosse ZIPs (Cloudflare-Bypass)
  GET    /v1/literature/import-pdfs/status/{id}     — Verarbeitungs-Status (Redis-Poll)
  POST   /v1/literature/{id}/pdf                    — PDF anhängen
  GET    /v1/literature/{id}/pdf                    — PDF herunterladen
"""
from __future__ import annotations

import io
import json as _json
import logging
import os
import pathlib
import re
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from models.literature_entry import LiteratureEntry
from models.literature_group import LiteratureGroup
from services.literature_parser import parse_endnote_xml, parse_ris
from services.s3_storage import delete_file as s3_delete
from services.s3_storage import download_file as s3_download
from services.s3_storage import generate_presigned_put_url as s3_presigned_put
from services.s3_storage import upload_file as s3_upload

_log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/literature", tags=["literature"])

_QDRANT_COLLECTION = "literature"
_MAX_PDF_SIZE = 50 * 1024 * 1024
_CHUNK_TMP_BASE = pathlib.Path(tempfile.gettempdir()) / "lit_bulk"
_VALID_ENTRY_TYPES = ("paper", "book", "patent", "norm", "law", "regulatory", "manual")


# ── Schemas ───────────────────────────────────────────────────────────────────

class LiteratureEntryOut(BaseModel):
    id: uuid.UUID
    entry_type: str
    title: str
    authors: list[str] | None
    year: int | None
    abstract: str | None
    journal: str | None
    volume: str | None
    issue: str | None
    pages: str | None
    doi: str | None
    url: str | None
    publisher: str | None
    isbn: str | None
    edition: str | None
    tags: list[str] | None
    notes: str | None
    pdf_s3_key: str | None
    pdf_size_bytes: int
    baddi_readable: bool
    is_favorite: bool
    read_later: bool
    group_ids: list[uuid.UUID]  # many-to-many: ein Eintrag kann in mehreren Gruppen sein
    has_meta_backup: bool  # True wenn metadata_backup gesetzt ist (Undo möglich)
    meta_refreshed_count: int = 0
    import_source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class LiteratureGroupOut(BaseModel):
    id: uuid.UUID
    entry_type: str
    name: str
    parent_id: uuid.UUID | None
    position: int
    created_at: datetime

    model_config = {"from_attributes": True}


class LiteratureGroupCreate(BaseModel):
    entry_type: str
    name: str
    parent_id: uuid.UUID | None = None
    position: int = 0


class LiteratureGroupRename(BaseModel):
    name: str


class EntryGroupsAssign(BaseModel):
    group_ids: list[uuid.UUID] = []


class LiteratureCreateRequest(BaseModel):
    entry_type: str = "paper"
    title: str
    authors: list[str] | None = None
    year: int | None = None
    abstract: str | None = None
    journal: str | None = None
    volume: str | None = None
    issue: str | None = None
    pages: str | None = None
    doi: str | None = None
    url: str | None = None
    publisher: str | None = None
    isbn: str | None = None
    edition: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    baddi_readable: bool = True


class LiteratureUpdateRequest(BaseModel):
    entry_type: str | None = None  # paper | book | patent
    title: str | None = None
    authors: list[str] | None = None
    year: int | None = None
    abstract: str | None = None
    journal: str | None = None
    volume: str | None = None
    issue: str | None = None
    pages: str | None = None
    doi: str | None = None
    url: str | None = None
    publisher: str | None = None
    isbn: str | None = None
    edition: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    baddi_readable: bool | None = None
    # group_id wird via separatem PATCH /{id}/group geändert (kann null sein
    # zum Entfernen — exclude_none=True würde null-Werte hier verschlucken)


class ExportPdfsRequest(BaseModel):
    entry_ids: list[uuid.UUID]


class FlagsUpdateRequest(BaseModel):
    is_favorite: bool | None = None
    read_later: bool | None = None


class ImportResponse(BaseModel):
    imported: int
    skipped: int
    entries: list[LiteratureEntryOut]


class PdfMatchDetail(BaseModel):
    filename: str
    status: str          # "matched" | "already_has_pdf" | "unmatched" | "orphan"
    match_method: str | None = None  # doi | filename | title_text | llm_doi | llm_title | llm_author_year
    matched_title: str | None = None
    entry_id: str | None = None
    orphan_id: str | None = None  # gesetzt wenn status=="orphan"


class BulkPdfResponse(BaseModel):
    matched: int
    already_had_pdf: int
    unmatched: int      # endgültig verloren (nur Lese-Fehler etc.)
    orphans: int = 0    # PDFs die nicht zugeordnet werden konnten, aber im Postfach liegen
    skipped_by_hash: int = 0  # Subset von already_had_pdf: per SHA256-Fast-Skip übersprungen
    details: list[PdfMatchDetail]


class BulkUploadUrlResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_in: int


class BulkPdfFromS3Request(BaseModel):
    s3_key: str


class PdfMetaResponse(BaseModel):
    entry_type: str = "paper"
    title: str | None = None
    authors: list[str] | None = None
    year: int | None = None
    abstract: str | None = None
    journal: str | None = None
    volume: str | None = None
    issue: str | None = None
    pages: str | None = None
    doi: str | None = None
    publisher: str | None = None
    isbn: str | None = None
    edition: str | None = None
    tags: list[str] | None = None


class ChunkUploadResponse(BaseModel):
    upload_id: str
    chunks_received: int
    total_chunks: int
    status: str  # "uploading" | "processing"


class UploadStatusResponse(BaseModel):
    status: str  # "uploading" | "processing" | "done" | "error"
    upload_id: str
    result: BulkPdfResponse | None = None
    error: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sha256_bytes(data: bytes) -> str:
    """SHA256-Hex eines Byte-Streams. ~30 MB/s, also ~50ms pro 1.5 MB-PDF."""
    import hashlib
    return hashlib.sha256(data).hexdigest()


def _content_disposition(mode: str, raw_name: str, ext: str = "") -> str:
    """RFC-konformer Content-Disposition-Header.
    Latin-1 für 'filename=' (ASCII-Fallback), UTF-8 für 'filename*=' — sonst
    schmeisst Starlette/Uvicorn UnicodeEncodeError bei Sonderzeichen wie U+2010.
    """
    from urllib.parse import quote
    base = (raw_name or "datei").strip()[:120]
    ascii_safe = re.sub(r"[^A-Za-z0-9 \-_.]", "_", base).strip() or "datei"
    return (
        f'{mode}; filename="{ascii_safe}{ext}"; '
        f"filename*=UTF-8''{quote(base + ext, safe='')}"
    )


def _sanitize_pg_text(text: str | None) -> str | None:
    """Entfernt NUL-Bytes und andere für PostgreSQL UTF-8-Felder verbotene Zeichen.
    PDFs enthalten oft \\x00 von Schriftart-Encodings — die brechen den DB-Insert.
    """
    if text is None:
        return None
    # NUL-Byte ist der wichtigste Übeltäter
    cleaned = text.replace("\x00", "")
    # Andere Steuerzeichen ausser Tab/Newline/CR rauswerfen
    cleaned = "".join(c for c in cleaned if c >= " " or c in "\t\n\r")
    return cleaned


def _build_extracted_text(entry: LiteratureEntry) -> str:
    parts = [entry.title]
    if entry.authors:
        parts.append(", ".join(entry.authors))
    if entry.year:
        parts.append(str(entry.year))
    if entry.abstract:
        parts.append(entry.abstract)
    if entry.notes:
        parts.append(entry.notes)
    if entry.journal:
        parts.append(entry.journal)
    if entry.publisher:
        parts.append(entry.publisher)
    return "\n".join(p for p in parts if p)


def _index_entry(entry: LiteratureEntry) -> None:
    if not entry.baddi_readable or not entry.extracted_text:
        return
    try:
        from services.vector_store import delete_document_vectors, store_document_vectors
        if entry.qdrant_point_ids:
            delete_document_vectors(str(entry.id), _QDRANT_COLLECTION)
        point_ids = store_document_vectors(
            customer_id=str(entry.customer_id),
            document_id=str(entry.id),
            filename=entry.title,
            text=entry.extracted_text,
            collection_name=_QDRANT_COLLECTION,
        )
        entry.qdrant_point_ids = point_ids
    except Exception as e:
        _log.warning("Qdrant-Indexierung fehlgeschlagen für Literatureintrag %s: %s", entry.id, e)


def _deindex_entry(entry: LiteratureEntry) -> None:
    if entry.qdrant_point_ids:
        try:
            from services.vector_store import delete_document_vectors
            delete_document_vectors(str(entry.id), _QDRANT_COLLECTION)
        except Exception as e:
            _log.warning("Qdrant-Deindexierung fehlgeschlagen: %s", e)


def _trigger_global_enrichment(doi: str | None, isbn: str | None = None) -> None:
    """Feuer-und-vergiss: schickt DOI und/oder ISBN an Celery für Anreicherung.
    Fehler beim Trigger sind nicht kritisch — Worker offline ist akzeptabel."""
    try:
        if doi:
            from tasks.literature_enrichment_task import enrich_doi_async
            enrich_doi_async.delay(doi)
        if isbn:
            from tasks.literature_enrichment_task import enrich_isbn_async
            enrich_isbn_async.delay(isbn)
    except Exception as exc:
        _log.info("[Literatur/Global-Trigger] doi=%s isbn=%s: %s — Worker evtl. offline", doi, isbn, exc)


async def _create_entry_from_dict(
    data: dict[str, Any],
    customer_id: uuid.UUID,
    db: AsyncSession,
    *,
    index: bool = True,
) -> LiteratureEntry:
    entry = LiteratureEntry(
        id=uuid.uuid4(),
        customer_id=customer_id,
        entry_type=data.get("entry_type", "paper"),
        title=data["title"],
        authors=data.get("authors"),
        year=data.get("year"),
        abstract=data.get("abstract"),
        journal=data.get("journal"),
        volume=data.get("volume"),
        issue=data.get("issue"),
        pages=data.get("pages"),
        doi=data.get("doi"),
        url=data.get("url"),
        publisher=data.get("publisher"),
        isbn=data.get("isbn"),
        edition=data.get("edition"),
        tags=data.get("tags"),
        notes=data.get("notes"),
        baddi_readable=data.get("baddi_readable", True),
        import_source=data.get("import_source", "manual"),
    )
    entry.extracted_text = _sanitize_pg_text(_build_extracted_text(entry))
    db.add(entry)
    if index:
        await db.flush()  # ID für sofortige Qdrant-Indexierung nötig
        _index_entry(entry)
    # Phase A — globale Anreicherung anstossen (asynchron via Celery)
    _trigger_global_enrichment(entry.doi, entry.isbn)
    return entry


async def _index_entries_background(entry_ids: list[str]) -> None:
    """Qdrant-Indexierung nach dem Response — eigene DB-Session."""
    from core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        for eid in entry_ids:
            try:
                entry = await db.get(LiteratureEntry, uuid.UUID(eid))
                if entry and entry.baddi_readable:
                    _index_entry(entry)
                    await db.commit()
            except Exception as e:
                _log.warning("[Literatur] Hintergrund-Indexierung fehlgeschlagen für %s: %s", eid, e)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/mine", response_model=list[LiteratureEntryOut])
async def list_my_literature(
    entry_type: str | None = None,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(LiteratureEntry).where(
        LiteratureEntry.customer_id == user.id,
        LiteratureEntry.is_active.is_(True),
    ).order_by(LiteratureEntry.created_at.desc())
    if entry_type:
        stmt = stmt.where(LiteratureEntry.entry_type == entry_type)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=LiteratureEntryOut, status_code=201)
async def create_literature_entry(
    req: LiteratureCreateRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not req.title.strip():
        raise HTTPException(status_code=422, detail="Titel darf nicht leer sein")
    entry = await _create_entry_from_dict(req.model_dump(), user.id, db)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=LiteratureEntryOut)
async def update_literature_entry(
    entry_id: uuid.UUID,
    req: LiteratureUpdateRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    if req.entry_type is not None and req.entry_type not in _VALID_ENTRY_TYPES:
        raise HTTPException(status_code=422, detail=f"entry_type muss einer von {', '.join(_VALID_ENTRY_TYPES)} sein")

    for field, value in req.model_dump(exclude_none=True).items():
        setattr(entry, field, value)

    entry.extracted_text = _sanitize_pg_text(_build_extracted_text(entry))
    _deindex_entry(entry)
    _index_entry(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{entry_id}")
async def delete_literature_entry(
    entry_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    _deindex_entry(entry)

    if entry.pdf_s3_key:
        try:
            await s3_delete(entry.pdf_s3_key)
        except Exception as e:
            _log.warning("S3-Löschen fehlgeschlagen für Literatur-PDF %s: %s", entry_id, e)

    entry.is_active = False
    await db.commit()
    return {"ok": True}


@router.patch("/{entry_id}/flags", response_model=LiteratureEntryOut)
async def update_entry_flags(
    entry_id: uuid.UUID,
    req: FlagsUpdateRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if req.is_favorite is not None:
        entry.is_favorite = req.is_favorite
    if req.read_later is not None:
        entry.read_later = req.read_later
    await db.commit()
    await db.refresh(entry)
    return entry


@router.patch("/{entry_id}/groups", response_model=LiteratureEntryOut)
async def assign_entry_groups(
    entry_id: uuid.UUID,
    req: EntryGroupsAssign,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Setzt die komplette Gruppen-Zuordnung des Eintrags (replace).
    Leere Liste entfernt aus allen Gruppen."""
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    # Dedupe + alle angegebenen Gruppen prüfen (gehören dem Kunden)
    unique_ids = list(dict.fromkeys(req.group_ids))
    target_groups: list[LiteratureGroup] = []
    if unique_ids:
        result = await db.execute(
            select(LiteratureGroup).where(
                LiteratureGroup.id.in_(unique_ids),
                LiteratureGroup.customer_id == user.id,
            )
        )
        target_groups = list(result.scalars().all())
        if len(target_groups) != len(unique_ids):
            raise HTTPException(status_code=404, detail="Eine oder mehrere Gruppen nicht gefunden")

    entry.groups = target_groups
    await db.commit()
    await db.refresh(entry)
    return entry


# ── Literature Groups ─────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[LiteratureGroupOut])
async def list_groups(
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LiteratureGroup)
        .where(LiteratureGroup.customer_id == user.id)
        .order_by(LiteratureGroup.entry_type, LiteratureGroup.position, LiteratureGroup.created_at)
    )
    return result.scalars().all()


@router.post("/groups", response_model=LiteratureGroupOut, status_code=201)
async def create_group(
    req: LiteratureGroupCreate,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.entry_type not in _VALID_ENTRY_TYPES:
        raise HTTPException(status_code=422, detail=f"entry_type muss einer von {', '.join(_VALID_ENTRY_TYPES)} sein")
    if req.parent_id is not None:
        parent = await db.get(LiteratureGroup, req.parent_id)
        if not parent or parent.customer_id != user.id:
            raise HTTPException(status_code=404, detail="Übergeordnete Gruppe nicht gefunden")
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail="Nur eine Verschachtelungsebene erlaubt")
    grp = LiteratureGroup(
        customer_id=user.id,
        entry_type=req.entry_type,
        name=req.name.strip()[:256],
        parent_id=req.parent_id,
        position=req.position,
    )
    db.add(grp)
    await db.commit()
    await db.refresh(grp)
    _log.info("[Literatur-Gruppe] Erstellt: %s (%s)", grp.name, grp.entry_type)
    return grp


@router.put("/groups/{group_id}", response_model=LiteratureGroupOut)
async def rename_group(
    group_id: uuid.UUID,
    req: LiteratureGroupRename,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    grp = await db.get(LiteratureGroup, group_id)
    if not grp or grp.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden")
    grp.name = req.name.strip()[:256]
    await db.commit()
    await db.refresh(grp)
    return grp


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(
    group_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    grp = await db.get(LiteratureGroup, group_id)
    if not grp or grp.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden")
    # Cascade in der Join-Tabelle (FK ondelete=CASCADE) entfernt Zuordnungen automatisch
    await db.delete(grp)
    await db.commit()


# ── PDF Export (Mehrfach-Auswahl) ─────────────────────────────────────────────

@router.post("/export-pdfs")
async def export_pdfs(
    req: ExportPdfsRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exportiert die PDFs der ausgewählten Einträge.
    Bei einem PDF: einzelne PDF-Datei. Bei mehreren: ZIP mit allen PDFs.
    """
    from fastapi.responses import StreamingResponse

    if not req.entry_ids:
        raise HTTPException(status_code=422, detail="Keine Einträge ausgewählt")
    if len(req.entry_ids) > 500:
        raise HTTPException(status_code=422, detail="Max. 500 Einträge pro Export")

    result = await db.execute(
        select(LiteratureEntry).where(
            LiteratureEntry.id.in_(req.entry_ids),
            LiteratureEntry.customer_id == user.id,
            LiteratureEntry.is_active.is_(True),
        )
    )
    entries = list(result.scalars().all())
    with_pdf = [e for e in entries if e.pdf_s3_key]

    if not with_pdf:
        raise HTTPException(status_code=404, detail="Keiner der Einträge hat ein PDF angehängt")

    # Einzeldatei: direkt streamen
    if len(with_pdf) == 1:
        e = with_pdf[0]
        try:
            content = await s3_download(e.pdf_s3_key)
        except Exception as exc:
            _log.error("[Export] PDF-Download fehlgeschlagen für %s: %s", e.id, exc)
            raise HTTPException(status_code=500, detail="PDF konnte nicht abgerufen werden")
        return StreamingResponse(
            io.BytesIO(content), media_type="application/pdf",
            headers={"Content-Disposition": _content_disposition("attachment", e.title, ".pdf")},
        )

    # ZIP mit allen PDFs
    buf = io.BytesIO()
    used_names: set[str] = set()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for e in with_pdf:
            try:
                content = await s3_download(e.pdf_s3_key)
            except Exception as exc:
                _log.warning("[Export] PDF-Download fehlgeschlagen für %s: %s — übersprungen", e.id, exc)
                continue
            safe_title = re.sub(r"[^\w\-. ]", "_", e.title)[:120].strip() or "eintrag"
            base = f"{safe_title}.pdf"
            # Dedupe
            name = base
            n = 1
            while name in used_names:
                name = f"{safe_title}_{n}.pdf"
                n += 1
            used_names.add(name)
            zf.writestr(name, content)

    buf.seek(0)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        buf, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="literatur_export_{timestamp}.zip"'}
    )


# ── Import ────────────────────────────────────────────────────────────────────

@router.post("/import", response_model=ImportResponse, status_code=201)
async def import_literature(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filename = (file.filename or "").lower()
    if not (filename.endswith(".ris") or filename.endswith(".xml")):
        raise HTTPException(status_code=415, detail="Nur .ris und .xml Dateien werden unterstützt")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Import-Datei zu gross (max. 10 MB)")

    if filename.endswith(".ris"):
        parsed = parse_ris(content)
    else:
        parsed = parse_endnote_xml(content)

    if not parsed:
        raise HTTPException(status_code=422, detail="Keine Einträge in der Datei gefunden")

    # Duplikat-Check: bereits vorhandene Titel (lowercase)
    existing_result = await db.execute(
        select(LiteratureEntry.title).where(
            LiteratureEntry.customer_id == user.id,
            LiteratureEntry.is_active.is_(True),
        )
    )
    existing_titles = {t.lower() for (t,) in existing_result.all()}

    created: list[LiteratureEntry] = []
    skipped = 0

    for data in parsed:
        if data["title"].lower() in existing_titles:
            skipped += 1
            continue
        # index=False — Qdrant läuft nach dem Response im Hintergrund
        entry = await _create_entry_from_dict(data, user.id, db, index=False)
        existing_titles.add(data["title"].lower())
        created.append(entry)

    if created:
        await db.commit()
        for e in created:
            await db.refresh(e)
        # Qdrant-Indexierung entkoppelt vom Request
        background_tasks.add_task(_index_entries_background, [str(e.id) for e in created])

    _log.info("[Literatur] Import: %d neu, %d übersprungen für Kunde %s", len(created), skipped, user.id)
    return ImportResponse(imported=len(created), skipped=skipped, entries=created)


# ── PDF Metadaten-Extraktion (Autofill) ──────────────────────────────────────

@router.post("/extract-pdf-meta", response_model=PdfMetaResponse)
async def extract_pdf_meta(
    file: UploadFile = File(...),
    user: Customer = Depends(get_current_user),
):
    """PDF hochladen → Metadaten per KI extrahieren → für Autofill im Neu-Formular."""
    content = await file.read()
    if len(content) > _MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="PDF zu gross (max. 50 MB)")

    filename = file.filename or "document.pdf"

    pdf_text = ""
    try:
        from services.file_parser import parse_file
        parsed = parse_file(content, filename, "application/pdf")
        pdf_text = parsed.text[:5000]
    except Exception as e:
        _log.warning("[Literatur/Autofill] PDF-Text-Extraktion fehlgeschlagen: %s", e)

    if not pdf_text.strip():
        return PdfMetaResponse(title=os.path.splitext(filename)[0])

    try:
        from services.llm_gateway import chat_with_claude
        result = await chat_with_claude(
            messages=[{
                "role": "user",
                "content": (
                    "Extrahiere bibliografische Metadaten aus diesem PDF-Text-Anfang.\n"
                    "Antworte NUR mit einem JSON-Objekt, kein Text davor oder danach, keine Code-Fence.\n"
                    "Fehlende Felder als null. Autoren im Format ['Nachname, Vorname', ...].\n\n"
                    f"PDF-Text:\n{pdf_text[:4000]}\n\n"
                    "JSON-Schema:\n"
                    '{"entry_type":"paper|book|patent","title":null,"authors":null,'
                    '"year":null,"abstract":null,"journal":null,"volume":null,"issue":null,'
                    '"pages":null,"doi":null,"publisher":null,"isbn":null,"edition":null,"tags":null}'
                ),
            }],
            model="claude-haiku-4-5-20251001",
        )
        raw = result.text.strip()
        # Code-Fence entfernen falls vorhanden
        if raw.startswith("```"):
            raw = re.sub(r'^```[a-z]*\n?', '', raw)
            raw = re.sub(r'\n?```$', '', raw.strip())
        meta = _json.loads(raw)
        return PdfMetaResponse(**{k: v for k, v in meta.items() if v is not None})
    except Exception as e:
        _log.warning("[Literatur/Autofill] LLM-Extraktion fehlgeschlagen: %s", e)
        return PdfMetaResponse(title=os.path.splitext(filename)[0])


# ── Metadaten aus angehängter PDF verbessern (Stufe 1: pro Eintrag) ───────────

class RefreshMetaResponse(BaseModel):
    current: dict
    extracted: dict
    proposed: dict  # Smart-Merge: nur Felder, die wir empfehlen zu ersetzen


class ApplyMetaRequest(BaseModel):
    fields: dict  # vom User bestätigte Felder die übernommen werden sollen


# Felder, die User-eigene Daten enthalten — nie überschreiben durch PDF-Extraktion
_META_USER_FIELDS = {"notes", "tags", "is_favorite", "read_later", "group_ids", "baddi_readable"}
# Felder, die wir aus dem PDF-Extract auf den Eintrag übertragen können
_META_FIELDS = {
    "entry_type", "title", "authors", "year", "abstract",
    "journal", "volume", "issue", "pages", "doi",
    "publisher", "isbn", "edition",
}


async def _extract_pdf_meta_from_bytes(
    pdf_bytes: bytes, filename: str = "document.pdf",
) -> tuple[dict | None, str]:
    """Aus PDF-Bytes via Haiku Metadaten extrahieren.
    Gibt (meta_dict_or_None, pdf_text_preview) zurück. Text bleibt auch nutzbar
    wenn die LLM-Extraktion scheitert (z. B. für Orphan-Vorschau)."""
    pdf_text = ""
    try:
        from services.file_parser import parse_file
        parsed = parse_file(pdf_bytes, filename, "application/pdf")
        pdf_text = parsed.text[:5000]
    except Exception as exc:
        _log.warning("[Literatur/Meta] PDF-Text-Extraktion fehlgeschlagen für %s: %s", filename, exc)
        return None, ""

    if not pdf_text.strip():
        return None, pdf_text

    try:
        from services.llm_gateway import chat_with_claude
        result = await chat_with_claude(
            messages=[{
                "role": "user",
                "content": (
                    "Extrahiere bibliografische Metadaten aus diesem PDF-Text-Anfang.\n"
                    "Antworte NUR mit einem JSON-Objekt, kein Text davor oder danach, keine Code-Fence.\n"
                    "Fehlende Felder als null. Autoren im Format ['Nachname, Vorname', ...].\n\n"
                    f"PDF-Text:\n{pdf_text[:4000]}\n\n"
                    "JSON-Schema:\n"
                    '{"entry_type":"paper|book|patent","title":null,"authors":null,'
                    '"year":null,"abstract":null,"journal":null,"volume":null,"issue":null,'
                    '"pages":null,"doi":null,"publisher":null,"isbn":null,"edition":null}'
                ),
            }],
            model="claude-haiku-4-5-20251001",
        )
        raw = result.text.strip()
        if raw.startswith("```"):
            raw = re.sub(r'^```[a-z]*\n?', '', raw)
            raw = re.sub(r'\n?```$', '', raw.strip())
        meta = _json.loads(raw)
        cleaned = {}
        for k, v in meta.items():
            if k not in _META_FIELDS:
                continue
            if v is None or (isinstance(v, str) and not v.strip()):
                continue
            if isinstance(v, list) and not v:
                continue
            cleaned[k] = v
        return cleaned, pdf_text
    except Exception as exc:
        _log.warning("[Literatur/Meta] LLM-Extraktion fehlgeschlagen für %s: %s", filename, exc)
        return None, pdf_text


async def _extract_pdf_meta_for_entry(entry: LiteratureEntry) -> dict | None:
    """Lädt PDF aus S3, extrahiert Text, ruft Haiku — gibt Metadaten-Dict zurück."""
    if not entry.pdf_s3_key:
        return None
    try:
        content = await s3_download(entry.pdf_s3_key)
    except Exception as exc:
        _log.warning("[Literatur/Refresh-Meta] S3-Download fehlgeschlagen %s: %s", entry.id, exc)
        return None
    meta, _text = await _extract_pdf_meta_from_bytes(content, entry.title or "document.pdf")
    return meta


def _compute_proposed_changes(entry: LiteratureEntry, extracted: dict) -> dict:
    """Smart-Merge: was aus extracted übernehmen wir? Nur 'klare Verbesserungen'.

    Regeln:
      - title: ersetzen wenn neu deutlich länger (>20%) UND alter als Substring/
        Präfix erkennbar (typische XML-Truncation), oder wenn alt leer
      - authors: übernehmen wenn neu mehr Einträge ODER alt enthält 'et al.'
      - alle anderen Felder: nur wenn aktuell leer
    """
    proposed: dict = {}

    new_title = extracted.get("title")
    if new_title:
        cur = (entry.title or "").strip()
        new = new_title.strip()
        cur_low, new_low = cur.lower(), new.lower()
        if not cur:
            proposed["title"] = new
        elif cur_low == new_low:
            pass  # identisch
        # Fall A: XML truncated — PDF deutlich länger und alt steckt im neuen drin
        elif len(new) > len(cur) * 1.2 and (cur_low in new_low or new_low.startswith(cur_low[:30])):
            proposed["title"] = new
        # Fall B: XML hat 'Autor - Titel'-Präfix — PDF ist sauberer und steckt im alten
        # z.B. cur='Abdel-Fattah - Surface ...' → new='Surface ...'
        elif new_low in cur_low and len(new) >= 20 and (len(cur) - len(new)) < 80:
            proposed["title"] = new
        # Fall C: erste Zeichen abweichen aber grosses gemeinsames Suffix (>60% von cur)
        elif len(new) >= 20 and len(new) >= len(cur) * 0.7:
            # Suche längste gemeinsame Suffix-Sequenz (case-insensitive)
            common = 0
            for i in range(1, min(len(cur), len(new)) + 1):
                if cur_low[-i:] == new_low[-i:]:
                    common = i
                else:
                    break
            if common >= len(new) * 0.7:
                proposed["title"] = new

    new_authors = extracted.get("authors")
    if isinstance(new_authors, list) and new_authors:
        cur_authors = entry.authors or []
        has_et_al = any("et al" in (a or "").lower() for a in cur_authors)
        if not cur_authors or len(new_authors) > len(cur_authors) or has_et_al:
            proposed["authors"] = new_authors

    # Felder die nur leere ersetzen
    fill_only_empty = {"abstract", "doi", "year", "journal", "volume", "issue",
                       "pages", "publisher", "isbn", "edition"}
    for f in fill_only_empty:
        new_val = extracted.get(f)
        cur_val = getattr(entry, f, None)
        if new_val and not cur_val:
            proposed[f] = new_val

    # entry_type nur falls aktueller default 'paper' und PDF was anderes erkennt
    new_type = extracted.get("entry_type")
    if new_type and new_type in _VALID_ENTRY_TYPES and new_type != entry.entry_type and entry.entry_type == "paper":
        proposed["entry_type"] = new_type

    return proposed


def _entry_to_meta_dict(entry: LiteratureEntry) -> dict:
    """Aktuelle Metadaten als Dict — für Diff-Anzeige + Backup."""
    return {f: getattr(entry, f, None) for f in _META_FIELDS}


@router.post("/{entry_id}/refresh-meta", response_model=RefreshMetaResponse)
async def refresh_entry_meta(
    entry_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Liest die angehängte PDF erneut, gibt aktuelle vs. vorgeschlagene Metadaten zurück.
    Wendet KEINE Änderung an — nur Vorschau für Diff-Ansicht im Frontend."""
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if not entry.pdf_s3_key:
        raise HTTPException(status_code=422, detail="Eintrag hat kein PDF angehängt")

    extracted = await _extract_pdf_meta_for_entry(entry)
    if extracted is None:
        raise HTTPException(status_code=500, detail="PDF konnte nicht ausgewertet werden")

    proposed = _compute_proposed_changes(entry, extracted)
    return RefreshMetaResponse(
        current=_entry_to_meta_dict(entry),
        extracted=extracted,
        proposed=proposed,
    )


@router.post("/{entry_id}/apply-meta", response_model=LiteratureEntryOut)
async def apply_entry_meta(
    entry_id: uuid.UUID,
    req: ApplyMetaRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Übernimmt vom User bestätigte Felder. Speichert Backup für Undo."""
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    # Nur erlaubte Felder filtern (Schutz gegen Manipulation)
    fields = {k: v for k, v in (req.fields or {}).items() if k in _META_FIELDS}
    if not fields:
        raise HTTPException(status_code=422, detail="Keine zu übernehmenden Felder angegeben")

    if "entry_type" in fields and fields["entry_type"] not in _VALID_ENTRY_TYPES:
        raise HTTPException(status_code=422, detail="Ungültiger entry_type")

    # Backup vor Änderung
    entry.metadata_backup = _entry_to_meta_dict(entry)
    entry.metadata_backup_at = datetime.utcnow()

    for k, v in fields.items():
        setattr(entry, k, v)

    # Counter — Eintrag hat das Refresh-Prozedere durchlaufen
    entry.meta_refreshed_count = (entry.meta_refreshed_count or 0) + 1
    entry.meta_refreshed_at = datetime.utcnow()

    entry.extracted_text = _sanitize_pg_text(_build_extracted_text(entry))
    _deindex_entry(entry)
    _index_entry(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/{entry_id}/restore-meta", response_model=LiteratureEntryOut)
async def restore_entry_meta(
    entry_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Setzt die zuletzt gesicherten Metadaten wieder ein."""
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if not entry.metadata_backup:
        raise HTTPException(status_code=422, detail="Kein Backup vorhanden")

    backup = entry.metadata_backup
    for k, v in backup.items():
        if k in _META_FIELDS:
            setattr(entry, k, v)
    entry.metadata_backup = None
    entry.metadata_backup_at = None
    entry.metadata_backup_job_id = None
    # Counter zurückdrehen — Eintrag ist wieder eligible für nächsten Bulk-Lauf
    entry.meta_refreshed_count = max(0, (entry.meta_refreshed_count or 0) - 1)
    entry.extracted_text = _sanitize_pg_text(_build_extracted_text(entry))
    _deindex_entry(entry)
    _index_entry(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


# ── Bulk Refresh-Meta (Stufe 2) ───────────────────────────────────────────────

_BULK_META_REDIS_TTL = 6 * 3600  # 6 Stunden


class BulkRefreshRequest(BaseModel):
    entry_ids: list[uuid.UUID]
    force: bool = False  # True = auch bereits verbesserte Einträge erneut durchlaufen lassen


class BulkRefreshStartResponse(BaseModel):
    job_id: str
    total: int
    skipped_already_refreshed: int = 0  # für Frontend-Hinweis
    status: str  # "processing"


class BulkRefreshStatusResponse(BaseModel):
    job_id: str
    status: str  # "processing" | "done" | "error"
    total: int
    processed: int
    updated: int
    unchanged: int
    errors: int
    field_counts: dict[str, int]
    started_at: str
    completed_at: str | None = None
    error_msg: str | None = None
    can_undo: bool = False


class BulkRefreshUndoResponse(BaseModel):
    restored: int


def _bulk_redis_key(customer_id: uuid.UUID, job_id: str) -> str:
    return f"lit_bulk_meta:{customer_id}:{job_id}"


async def _bulk_meta_refresh_task(
    entry_ids: list[str],
    customer_id_str: str,
    job_id: str,
) -> None:
    """Background: für jeden Eintrag PDF-Meta extrahieren, Smart-Merge anwenden,
    Backup mit Job-ID setzen und committen. Status nach jedem Eintrag in Redis schreiben."""
    import redis.asyncio as aioredis
    from core.config import settings
    from core.database import AsyncSessionLocal

    customer_id = uuid.UUID(customer_id_str)
    redis_key = _bulk_redis_key(customer_id, job_id)
    r = aioredis.from_url(settings.redis_url)

    state: dict[str, Any] = {
        "job_id": job_id,
        "status": "processing",
        "total": len(entry_ids),
        "processed": 0,
        "updated": 0,
        "unchanged": 0,
        "errors": 0,
        "field_counts": {},
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "error_msg": None,
        "can_undo": False,
    }

    async def _publish() -> None:
        await r.set(redis_key, _json.dumps(state), ex=_BULK_META_REDIS_TTL)

    try:
        await _publish()

        for eid_str in entry_ids:
            try:
                async with AsyncSessionLocal() as db:
                    entry = await db.get(LiteratureEntry, uuid.UUID(eid_str))
                    if not entry or not entry.is_active or entry.customer_id != customer_id:
                        state["errors"] += 1
                        state["processed"] += 1
                        await _publish()
                        continue
                    if not entry.pdf_s3_key:
                        state["unchanged"] += 1
                        state["processed"] += 1
                        await _publish()
                        continue

                    extracted = await _extract_pdf_meta_for_entry(entry)
                    if extracted is None:
                        state["errors"] += 1
                        state["processed"] += 1
                        await _publish()
                        continue

                    proposed = _compute_proposed_changes(entry, extracted)
                    if not proposed:
                        # PDF angeschaut, keine Verbesserung nötig — gilt trotzdem als "durchgelaufen"
                        entry.meta_refreshed_count = (entry.meta_refreshed_count or 0) + 1
                        entry.meta_refreshed_at = datetime.utcnow()
                        await db.commit()
                        state["unchanged"] += 1
                        state["processed"] += 1
                        await _publish()
                        continue

                    # Backup vor Änderung — mit Job-ID für Bulk-Undo
                    entry.metadata_backup = _entry_to_meta_dict(entry)
                    entry.metadata_backup_at = datetime.utcnow()
                    entry.metadata_backup_job_id = job_id

                    for k, v in proposed.items():
                        setattr(entry, k, v)
                        state["field_counts"][k] = state["field_counts"].get(k, 0) + 1

                    entry.meta_refreshed_count = (entry.meta_refreshed_count or 0) + 1
                    entry.meta_refreshed_at = datetime.utcnow()

                    entry.extracted_text = _sanitize_pg_text(_build_extracted_text(entry))
                    _deindex_entry(entry)
                    _index_entry(entry)
                    await db.commit()

                    state["updated"] += 1
                    state["processed"] += 1
                    state["can_undo"] = True
                    await _publish()
            except Exception as exc:
                _log.warning("[Literatur/Bulk-Meta] Eintrag %s fehlgeschlagen: %s", eid_str, exc)
                state["errors"] += 1
                state["processed"] += 1
                await _publish()

        state["status"] = "done"
        state["completed_at"] = datetime.utcnow().isoformat()
        await _publish()
        _log.info(
            "[Literatur/Bulk-Meta] Job %s fertig: %d updated, %d unchanged, %d errors",
            job_id, state["updated"], state["unchanged"], state["errors"],
        )
    except Exception as exc:
        _log.error("[Literatur/Bulk-Meta] Job %s abgebrochen: %s", job_id, exc)
        state["status"] = "error"
        state["error_msg"] = str(exc)[:300]
        state["completed_at"] = datetime.utcnow().isoformat()
        await _publish()
    finally:
        await r.aclose()


@router.post("/refresh-meta-bulk", response_model=BulkRefreshStartResponse)
async def start_bulk_refresh_meta(
    req: BulkRefreshRequest,
    background_tasks: BackgroundTasks,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Startet Hintergrund-Job für Bulk-Refresh der PDF-Metadaten.
    Gilt nur für Einträge mit angehängter PDF; Conservative-Smart-Merge
    (übernimmt nur klare Verbesserungen automatisch)."""
    if not req.entry_ids:
        raise HTTPException(status_code=422, detail="Keine Einträge ausgewählt")

    # Filter: nur eigene aktive Einträge mit PDF; bereits verbesserte werden
    # standardmässig übersprungen (force=True hebt die Sperre auf).
    base_q = select(LiteratureEntry.id, LiteratureEntry.meta_refreshed_count).where(
        LiteratureEntry.id.in_(req.entry_ids),
        LiteratureEntry.customer_id == user.id,
        LiteratureEntry.is_active.is_(True),
        LiteratureEntry.pdf_s3_key.isnot(None),
    )
    rows = (await db.execute(base_q)).all()
    if not rows:
        raise HTTPException(status_code=422, detail="Keine der ausgewählten Einträge hat ein PDF angehängt")

    if req.force:
        valid_ids = [str(r[0]) for r in rows]
        skipped = 0
    else:
        valid_ids = [str(r[0]) for r in rows if (r[1] or 0) == 0]
        skipped = len(rows) - len(valid_ids)
        if not valid_ids:
            raise HTTPException(
                status_code=422,
                detail=f"Alle {skipped} ausgewählten Einträge wurden bereits verbessert. "
                       "Setze force=true um sie erneut zu prüfen.",
            )

    job_id = uuid.uuid4().hex
    redis_key = _bulk_redis_key(user.id, job_id)

    # Initial-State direkt setzen (synchron) damit Frontend sofort polln kann
    import redis.asyncio as aioredis
    from core.config import settings as _settings
    r = aioredis.from_url(_settings.redis_url)
    try:
        await r.set(redis_key, _json.dumps({
            "job_id": job_id,
            "status": "processing",
            "total": len(valid_ids),
            "processed": 0,
            "updated": 0,
            "unchanged": 0,
            "errors": 0,
            "field_counts": {},
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": None,
            "error_msg": None,
            "can_undo": False,
        }), ex=_BULK_META_REDIS_TTL)
    finally:
        await r.aclose()

    background_tasks.add_task(_bulk_meta_refresh_task, valid_ids, str(user.id), job_id)
    _log.info(
        "[Literatur/Bulk-Meta] Job %s gestartet (%d Einträge, %d übersprungen) für Kunde %s",
        job_id, len(valid_ids), skipped, user.id,
    )
    return BulkRefreshStartResponse(
        job_id=job_id, total=len(valid_ids),
        skipped_already_refreshed=skipped, status="processing",
    )


@router.get("/refresh-meta-bulk/{job_id}", response_model=BulkRefreshStatusResponse)
async def get_bulk_refresh_status(
    job_id: str,
    user: Customer = Depends(get_current_user),
):
    if not re.match(r'^[a-f0-9]{32}$', job_id):
        raise HTTPException(status_code=422, detail="Ungültige Job-ID")

    import redis.asyncio as aioredis
    from core.config import settings as _settings
    r = aioredis.from_url(_settings.redis_url)
    try:
        raw = await r.get(_bulk_redis_key(user.id, job_id))
    finally:
        await r.aclose()

    if not raw:
        raise HTTPException(status_code=404, detail="Job nicht gefunden oder abgelaufen")
    data = _json.loads(raw)
    return BulkRefreshStatusResponse(**data)


@router.post("/refresh-meta-bulk/{job_id}/undo", response_model=BulkRefreshUndoResponse)
async def undo_bulk_refresh_meta(
    job_id: str,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stellt alle Einträge wieder her, die in diesem Bulk-Job geändert wurden."""
    if not re.match(r'^[a-f0-9]{32}$', job_id):
        raise HTTPException(status_code=422, detail="Ungültige Job-ID")

    result = await db.execute(
        select(LiteratureEntry).where(
            LiteratureEntry.customer_id == user.id,
            LiteratureEntry.is_active.is_(True),
            LiteratureEntry.metadata_backup_job_id == job_id,
        )
    )
    entries = list(result.scalars().all())
    if not entries:
        raise HTTPException(status_code=404, detail="Keine wiederherstellbaren Einträge zu diesem Job")

    restored = 0
    for entry in entries:
        if not entry.metadata_backup:
            continue
        for k, v in entry.metadata_backup.items():
            if k in _META_FIELDS:
                setattr(entry, k, v)
        entry.metadata_backup = None
        entry.metadata_backup_at = None
        entry.metadata_backup_job_id = None
        entry.meta_refreshed_count = max(0, (entry.meta_refreshed_count or 0) - 1)
        entry.extracted_text = _sanitize_pg_text(_build_extracted_text(entry))
        _deindex_entry(entry)
        _index_entry(entry)
        restored += 1

    await db.commit()

    # Redis-Status auf undone setzen, damit Frontend Undo-Button entfernen kann
    import redis.asyncio as aioredis
    from core.config import settings as _settings
    r = aioredis.from_url(_settings.redis_url)
    try:
        raw = await r.get(_bulk_redis_key(user.id, job_id))
        if raw:
            data = _json.loads(raw)
            data["can_undo"] = False
            await r.set(_bulk_redis_key(user.id, job_id), _json.dumps(data), ex=_BULK_META_REDIS_TTL)
    finally:
        await r.aclose()

    _log.info("[Literatur/Bulk-Meta] Undo Job %s: %d wiederhergestellt", job_id, restored)
    return BulkRefreshUndoResponse(restored=restored)


# ── Bücher (Phase A.3 — OpenLibrary + DOAB) ───────────────────────────────────

class BookIndexEntry(BaseModel):
    isbn: str
    title: str | None
    subtitle: str | None
    authors: list[str] | None
    year: int | None
    publisher: str | None
    edition: str | None
    language: str | None
    page_count: int | None
    description: str | None
    cover_url: str | None
    oa_url: str | None
    oa_license: str | None
    enrichment_status: str
    in_my_library: bool = False

    model_config = {"from_attributes": True}


class BookSearchResponse(BaseModel):
    query: str
    total: int
    results: list[BookIndexEntry]


@router.get("/books/search", response_model=BookSearchResponse)
async def search_book_index(
    q: str,
    limit: int = 20,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Volltext-Suche im Bücher-Pool (Titel + Subtitle + Beschreibung)."""
    from models.book_global_index import BookGlobalIndex
    if not q.strip():
        raise HTTPException(status_code=422, detail="Suchbegriff darf nicht leer sein")
    limit = max(1, min(limit, 50))

    tsv = func.to_tsvector("simple",
        func.coalesce(BookGlobalIndex.title, "") + " " +
        func.coalesce(BookGlobalIndex.subtitle, "") + " " +
        func.coalesce(BookGlobalIndex.description, ""))
    tsq = func.plainto_tsquery("simple", q)
    rank = func.ts_rank(tsv, tsq)
    stmt = (
        select(BookGlobalIndex)
        .where(tsv.op("@@")(tsq))
        .where(BookGlobalIndex.enrichment_status == "enriched")
        .order_by(rank.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    my_isbns: set[str] = set()
    if rows:
        my_q = await db.execute(
            select(LiteratureEntry.isbn).where(
                LiteratureEntry.customer_id == user.id,
                LiteratureEntry.is_active.is_(True),
                LiteratureEntry.isbn.in_([r.isbn for r in rows]),
            )
        )
        from services.book_enrichment import normalize_isbn
        my_isbns = {n for raw in (i for (i,) in my_q.all() if i) if (n := normalize_isbn(raw))}

    out = []
    for r in rows:
        item = BookIndexEntry.model_validate(r, from_attributes=True)
        item.in_my_library = r.isbn in my_isbns
        out.append(item)
    return BookSearchResponse(query=q, total=len(out), results=out)


@router.get("/books/{isbn}", response_model=BookIndexEntry)
async def get_book_entry(
    isbn: str,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Buch-Details via ISBN. On-demand-Enrichment bei Bedarf."""
    from models.book_global_index import BookGlobalIndex
    from services.book_enrichment import enrich_isbn, normalize_isbn

    norm = normalize_isbn(isbn)
    if not norm:
        raise HTTPException(status_code=422, detail="Ungültige ISBN (erwarte 10 oder 13 Ziffern)")

    rec = await db.get(BookGlobalIndex, norm)
    if not rec or rec.enrichment_status == "pending":
        rec = await enrich_isbn(db, norm)
        await db.commit()
    if not rec or rec.enrichment_status == "failed_404":
        raise HTTPException(status_code=404, detail="ISBN in OpenLibrary/DOAB nicht gefunden")

    my_q = await db.execute(
        select(LiteratureEntry.id).where(
            LiteratureEntry.customer_id == user.id,
            LiteratureEntry.is_active.is_(True),
            LiteratureEntry.isbn == norm,
        ).limit(1)
    )
    in_my = my_q.scalar_one_or_none() is not None
    out = BookIndexEntry.model_validate(rec, from_attributes=True)
    out.in_my_library = in_my
    return out


# ── Schweizer Gesetze (Phase A.3 — Fedlex) ────────────────────────────────────

class LawIndexEntry(BaseModel):
    sr_number: str
    title: str | None
    short_title: str | None
    abbreviation: str | None
    language: str
    enacted_date: datetime | None = None
    in_force_date: datetime | None = None
    status: str | None
    html_url: str | None
    pdf_url: str | None
    eli_uri: str | None
    enrichment_status: str

    model_config = {"from_attributes": True}


@router.get("/laws/{sr_number:path}", response_model=LawIndexEntry)
async def get_law_entry(
    sr_number: str,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Schweizer Gesetz via SR-Nummer (z. B. '220' für OR). On-demand-Enrichment."""
    from models.law_global_index import LawGlobalIndex
    from services.law_enrichment import enrich_sr, normalize_sr_number

    norm = normalize_sr_number(sr_number)
    if not norm:
        raise HTTPException(status_code=422, detail="Ungültige SR-Nummer (erwarte z. B. '220' oder 'SR 220')")

    rec = await db.get(LawGlobalIndex, norm)
    if not rec or rec.enrichment_status == "pending":
        rec = await enrich_sr(db, norm)
        await db.commit()
    if not rec or rec.enrichment_status == "failed_404":
        raise HTTPException(status_code=404, detail=f"SR {norm} nicht via Fedlex auflösbar")
    return rec


# ── Globaler Wissenspool (Phase A) ────────────────────────────────────────────

class GlobalIndexEntry(BaseModel):
    doi: str
    title: str | None
    authors: list[str] | None
    year: int | None
    journal: str | None
    volume: str | None
    issue: str | None
    pages: str | None
    publisher: str | None
    entry_type: str | None
    isbn: str | None
    abstract: str | None
    oa_status: str | None
    oa_url: str | None
    oa_license: str | None
    source: str
    enrichment_status: str
    in_my_library: bool = False  # gesetzt vom Endpoint je nach User

    model_config = {"from_attributes": True}


class GlobalSearchResponse(BaseModel):
    query: str
    total: int
    results: list[GlobalIndexEntry]


class BackfillResponse(BaseModel):
    enqueued: bool
    estimated_dois: int
    task_id: str | None = None


@router.get("/global/search", response_model=GlobalSearchResponse)
async def search_global_index(
    q: str,
    limit: int = 20,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Volltext-Suche im globalen Wissenspool (Titel + Abstract).
    Markiert pro Treffer ob er bereits in der Library des Kunden liegt."""
    from models.literature_global_index import LiteratureGlobalIndex
    from sqlalchemy import func, text as sql_text

    if not q.strip():
        raise HTTPException(status_code=422, detail="Suchbegriff darf nicht leer sein")
    limit = max(1, min(limit, 50))

    # Postgres FTS — 'simple' (sprachneutral) damit DE/EN/Mischformen funktionieren
    tsv = func.to_tsvector("simple",
        func.coalesce(LiteratureGlobalIndex.title, "") + " " + func.coalesce(LiteratureGlobalIndex.abstract, ""))
    tsq = func.plainto_tsquery("simple", q)
    rank = func.ts_rank(tsv, tsq)

    stmt = (
        select(LiteratureGlobalIndex)
        .where(tsv.op("@@")(tsq))
        .where(LiteratureGlobalIndex.enrichment_status == "enriched")
        .order_by(rank.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    # Welche dieser DOIs hat der Kunde bereits?
    if rows:
        my_dois_q = await db.execute(
            select(LiteratureEntry.doi).where(
                LiteratureEntry.customer_id == user.id,
                LiteratureEntry.is_active.is_(True),
                LiteratureEntry.doi.in_([r.doi for r in rows]),
            )
        )
        my_dois = {(d or "").strip().lower() for (d,) in my_dois_q.all() if d}
    else:
        my_dois = set()

    results = []
    for r in rows:
        item = GlobalIndexEntry.model_validate(r, from_attributes=True)
        item.in_my_library = r.doi in my_dois
        results.append(item)

    return GlobalSearchResponse(query=q, total=len(results), results=results)


@router.get("/global/{doi:path}", response_model=GlobalIndexEntry)
async def get_global_entry(
    doi: str,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Details zu einem globalen Eintrag via DOI. Triggert bei Bedarf eine
    On-Demand-Anreicherung (synchron, max ~30s) wenn die DOI noch nicht im Pool ist.
    """
    from models.literature_global_index import LiteratureGlobalIndex
    from services.literature_enrichment import enrich_doi, normalize_doi

    norm = normalize_doi(doi)
    if not norm:
        raise HTTPException(status_code=422, detail="Ungültige DOI")

    rec = await db.get(LiteratureGlobalIndex, norm)
    if not rec or rec.enrichment_status == "pending":
        # On-demand anreichern
        rec = await enrich_doi(db, norm)
        await db.commit()
        if rec is None:
            raise HTTPException(status_code=422, detail="DOI konnte nicht aufgelöst werden")

    # In-Library-Check
    my_q = await db.execute(
        select(LiteratureEntry.id).where(
            LiteratureEntry.customer_id == user.id,
            LiteratureEntry.is_active.is_(True),
            LiteratureEntry.doi == norm,
        ).limit(1)
    )
    in_my = my_q.scalar_one_or_none() is not None

    out = GlobalIndexEntry.model_validate(rec, from_attributes=True)
    out.in_my_library = in_my
    return out


class AddFromGlobalRequest(BaseModel):
    doi: str
    fetch_oa_pdf: bool = False  # wenn True und oa_url vorhanden → PDF gleich mitziehen


@router.post("/global/add-to-library", response_model=LiteratureEntryOut, status_code=201)
async def add_global_entry_to_library(
    req: AddFromGlobalRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Erstellt einen Library-Eintrag aus einem globalen Pool-Treffer.
    Mit fetch_oa_pdf=True wird das offizielle OA-PDF gleich angehängt (falls verfügbar).
    Wirft 409 wenn der Kunde diese DOI bereits hat.
    """
    from models.literature_global_index import LiteratureGlobalIndex
    from services.literature_enrichment import enrich_doi, normalize_doi

    norm = normalize_doi(req.doi)
    if not norm:
        raise HTTPException(status_code=422, detail="Ungültige DOI")

    # Duplikat-Check
    dup = await db.execute(
        select(LiteratureEntry.id).where(
            LiteratureEntry.customer_id == user.id,
            LiteratureEntry.is_active.is_(True),
            LiteratureEntry.doi == norm,
        ).limit(1)
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Eintrag mit dieser DOI bereits in deiner Library")

    rec = await db.get(LiteratureGlobalIndex, norm)
    if not rec or rec.enrichment_status != "enriched":
        rec = await enrich_doi(db, norm)
        await db.commit()
    if not rec or rec.enrichment_status == "failed_404":
        raise HTTPException(status_code=404, detail="DOI in Crossref/Unpaywall nicht gefunden")

    data: dict[str, Any] = {
        "entry_type": rec.entry_type or "paper",
        "title": rec.title or norm,
        "authors": rec.authors,
        "year": rec.year,
        "abstract": rec.abstract,
        "journal": rec.journal,
        "volume": rec.volume,
        "issue": rec.issue,
        "pages": rec.pages,
        "doi": norm,
        "publisher": rec.publisher,
        "isbn": rec.isbn,
        "import_source": "global_pool",
    }
    entry = await _create_entry_from_dict(data, user.id, db, index=False)
    await db.flush()

    # Optional: OA-PDF gleich mitziehen
    if req.fetch_oa_pdf and rec.oa_url:
        import httpx
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
                r = await client.get(rec.oa_url, headers={"User-Agent": "Baddi-Literature/1.0"})
            content_type = r.headers.get("content-type", "").lower()
            if r.status_code == 200 and ("pdf" in content_type or r.content[:4] == b"%PDF"):
                pdf_bytes = r.content
                if len(pdf_bytes) <= _MAX_PDF_SIZE:
                    safe_filename = re.sub(r"[^\w\-. ]", "_", entry.title)[:120].strip() or "oa-paper"
                    s3_key = await s3_upload(
                        customer_id=user.id, doc_id=entry.id,
                        filename=f"{safe_filename}.pdf",
                        content=pdf_bytes, content_type="application/pdf",
                    )
                    entry.pdf_s3_key = s3_key
                    entry.pdf_size_bytes = len(pdf_bytes)
                    try:
                        from services.file_parser import parse_file
                        parsed = parse_file(pdf_bytes, f"{safe_filename}.pdf", "application/pdf")
                        if parsed.text.strip():
                            entry.extracted_text = _sanitize_pg_text(_build_extracted_text(entry) + "\n\n" + parsed.text[:8000])
                    except Exception as exc:
                        _log.warning("[Add-Global/OA] PDF-Parse fehlgeschlagen: %s", exc)
        except httpx.HTTPError as exc:
            _log.info("[Add-Global/OA] %s nicht erreichbar: %s", rec.oa_url, exc)
            # PDF-Fail bricht das Hinzufügen nicht — Eintrag ist schon erstellt

    _index_entry(entry)
    await db.commit()
    await db.refresh(entry)
    _log.info("[Add-Global] %s → Eintrag %s (mit_pdf=%s)", norm, entry.id, bool(entry.pdf_s3_key))
    return entry


@router.post("/global/backfill", response_model=BackfillResponse)
async def trigger_global_backfill(
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stösst die Anreicherung aller bestehenden Einträge mit DOI an.
    Läuft als Celery-Task, dauert je nach Bibliotheksgrösse 30-60 Min für 1000 DOIs."""
    from sqlalchemy import distinct
    count_q = await db.execute(
        select(func.count(distinct(LiteratureEntry.doi))).where(
            LiteratureEntry.is_active.is_(True),
            LiteratureEntry.doi.isnot(None),
        )
    )
    estimated = int(count_q.scalar() or 0)

    try:
        from tasks.literature_enrichment_task import backfill_global_index
        result = backfill_global_index.delay()
        return BackfillResponse(enqueued=True, estimated_dois=estimated, task_id=result.id)
    except Exception as exc:
        _log.error("[Global-Backfill] Trigger fehlgeschlagen: %s", exc)
        raise HTTPException(status_code=503, detail="Celery-Worker nicht erreichbar")


@router.post("/{entry_id}/fetch-oa-pdf", response_model=LiteratureEntryOut)
async def fetch_oa_pdf(
    entry_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Holt das offizielle Open-Access-PDF von Unpaywall (oa_url im globalen Index)
    und hängt es an den Eintrag. Ersetzt ein bereits vorhandenes PDF nicht — User
    muss erst löschen wenn er das will.
    Funktioniert nur wenn:
      - Eintrag eine DOI hat
      - Diese DOI im globalen Index steht und enriched ist
      - oa_url gesetzt ist
    """
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if entry.pdf_s3_key:
        raise HTTPException(status_code=409, detail="Eintrag hat bereits ein PDF — bitte zuerst entfernen")
    if not entry.doi:
        raise HTTPException(status_code=422, detail="Eintrag hat keine DOI")

    from models.literature_global_index import LiteratureGlobalIndex
    from services.literature_enrichment import enrich_doi, normalize_doi

    norm = normalize_doi(entry.doi)
    if not norm:
        raise HTTPException(status_code=422, detail="DOI ungültig")

    rec = await db.get(LiteratureGlobalIndex, norm)
    if not rec or rec.enrichment_status not in ("enriched", "failed_other"):
        # On-demand-Anreicherung bei Bedarf
        rec = await enrich_doi(db, norm)
        await db.commit()
    if not rec or not rec.oa_url:
        raise HTTPException(status_code=404, detail="Kein Open-Access-PDF für diese DOI verfügbar")

    # PDF von Unpaywall-OA-URL ziehen
    import httpx
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            r = await client.get(rec.oa_url, headers={"User-Agent": "Baddi-Literature/1.0"})
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"OA-Server lieferte HTTP {r.status_code}")
        content_type = r.headers.get("content-type", "").lower()
        if "pdf" not in content_type and not r.content[:4] == b"%PDF":
            raise HTTPException(status_code=415, detail="OA-URL liefert kein PDF (vermutlich HTML-Landingpage)")
        pdf_bytes = r.content
    except httpx.HTTPError as exc:
        _log.error("[OA-Fetch] HTTP-Fehler %s: %s", entry_id, exc)
        raise HTTPException(status_code=502, detail=f"OA-Server nicht erreichbar: {exc}")

    if len(pdf_bytes) > _MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail=f"PDF zu gross ({len(pdf_bytes) // (1024*1024)} MB > 50 MB)")

    # In S3 hochladen + Eintrag verlinken
    safe_filename = re.sub(r"[^\w\-. ]", "_", entry.title or norm)[:120].strip() or "oa-paper"
    s3_key = await s3_upload(
        customer_id=user.id, doc_id=entry_id,
        filename=f"{safe_filename}.pdf",
        content=pdf_bytes, content_type="application/pdf",
    )
    entry.pdf_s3_key = s3_key
    entry.pdf_size_bytes = len(pdf_bytes)

    # Text aus PDF extrahieren für Volltext-Suche
    try:
        from services.file_parser import parse_file
        parsed = parse_file(pdf_bytes, f"{safe_filename}.pdf", "application/pdf")
        if parsed.text.strip():
            entry.extracted_text = _sanitize_pg_text(_build_extracted_text(entry) + "\n\n" + parsed.text[:8000])
    except Exception as exc:
        _log.warning("[OA-Fetch] PDF-Text-Extraktion fehlgeschlagen %s: %s", entry_id, exc)

    _deindex_entry(entry)
    _index_entry(entry)
    await db.commit()
    await db.refresh(entry)
    _log.info("[OA-Fetch] %s (%d bytes) → %s", norm, len(pdf_bytes), entry_id)
    return entry


@router.get("/{entry_id}/oa-info")
async def get_entry_oa_info(
    entry_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Gibt Open-Access-Info für einen Eintrag zurück (für Frontend-Button-Anzeige).
    {available: bool, oa_url, oa_status, oa_license} oder {available: false, reason}.
    """
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if not entry.doi:
        return {"available": False, "reason": "no_doi"}

    from models.literature_global_index import LiteratureGlobalIndex
    from services.literature_enrichment import normalize_doi
    norm = normalize_doi(entry.doi)
    if not norm:
        return {"available": False, "reason": "invalid_doi"}

    rec = await db.get(LiteratureGlobalIndex, norm)
    if not rec:
        return {"available": False, "reason": "not_indexed_yet"}
    if rec.enrichment_status != "enriched":
        return {"available": False, "reason": rec.enrichment_status}
    if not rec.oa_url:
        return {"available": False, "reason": "no_oa_version"}
    return {
        "available": True,
        "oa_url": rec.oa_url,
        "oa_status": rec.oa_status,
        "oa_license": rec.oa_license,
    }


# ── Orphan PDFs (Stufe 3 — Postfach für nicht-zugeordnete PDFs) ───────────────

class OrphanPdfOut(BaseModel):
    id: uuid.UUID
    filename: str
    size_bytes: int
    extracted_meta: dict | None
    extracted_text_preview: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrphanAssignRequest(BaseModel):
    entry_id: uuid.UUID


class OrphanPromoteRequest(BaseModel):
    """Manuelles Anlegen eines neuen Eintrags aus einem Orphan-PDF.
    Felder die fehlen, kommen automatisch aus extracted_meta."""
    entry_type: str = "paper"
    title: str
    authors: list[str] | None = None
    year: int | None = None
    abstract: str | None = None
    journal: str | None = None
    volume: str | None = None
    issue: str | None = None
    pages: str | None = None
    doi: str | None = None
    publisher: str | None = None
    isbn: str | None = None
    edition: str | None = None
    tags: list[str] | None = None
    notes: str | None = None


@router.get("/orphans", response_model=list[OrphanPdfOut])
async def list_orphans(
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from models.literature_orphan_pdf import LiteratureOrphanPdf
    result = await db.execute(
        select(LiteratureOrphanPdf).where(
            LiteratureOrphanPdf.customer_id == user.id,
            LiteratureOrphanPdf.is_active.is_(True),
        ).order_by(LiteratureOrphanPdf.created_at.desc())
    )
    return result.scalars().all()


@router.get("/orphans/{orphan_id}/pdf")
async def download_orphan_pdf(
    orphan_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import Response
    from models.literature_orphan_pdf import LiteratureOrphanPdf
    orphan = await db.get(LiteratureOrphanPdf, orphan_id)
    if not orphan or not orphan.is_active or orphan.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Unbekanntes PDF nicht gefunden")
    try:
        file_bytes = await s3_download(orphan.s3_key)
    except Exception as exc:
        _log.error("[Literatur/Orphan] S3-Download fehlgeschlagen %s: %s", orphan_id, exc)
        raise HTTPException(status_code=503, detail="PDF vorübergehend nicht verfügbar")
    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition("inline", orphan.filename)},
    )


@router.post("/orphans/{orphan_id}/assign", response_model=LiteratureEntryOut)
async def assign_orphan_to_entry(
    orphan_id: uuid.UUID,
    req: OrphanAssignRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hängt das Orphan-PDF an einen bestehenden Literatur-Eintrag und entfernt
    den Orphan-Datensatz. Verschiebt nicht — kopiert den S3-Key. Falls der
    Ziel-Eintrag schon ein PDF hat, schlägt der Aufruf fehl (User soll bewusst
    entscheiden)."""
    from models.literature_orphan_pdf import LiteratureOrphanPdf
    orphan = await db.get(LiteratureOrphanPdf, orphan_id)
    if not orphan or not orphan.is_active or orphan.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Unbekanntes PDF nicht gefunden")

    entry = await db.get(LiteratureEntry, req.entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if entry.pdf_s3_key:
        raise HTTPException(status_code=409, detail="Eintrag hat bereits ein PDF angehängt")

    # PDF-Bytes laden, in den entry-spezifischen S3-Pfad re-uploaden, alten Key löschen,
    # extracted_text aktualisieren — analog zum normalen attach_pdf-Flow.
    try:
        pdf_bytes = await s3_download(orphan.s3_key)
    except Exception as exc:
        _log.error("[Literatur/Orphan-Assign] S3-Download fehlgeschlagen %s: %s", orphan_id, exc)
        raise HTTPException(status_code=503, detail="PDF konnte nicht geladen werden")

    new_s3_key = await s3_upload(
        customer_id=user.id,
        doc_id=entry.id,
        filename=orphan.filename,
        content=pdf_bytes,
        content_type="application/pdf",
    )
    entry.pdf_s3_key = new_s3_key
    entry.pdf_size_bytes = orphan.size_bytes

    if orphan.extracted_text_preview:
        combined = _build_extracted_text(entry) + "\n\n" + orphan.extracted_text_preview[:8000]
        entry.extracted_text = _sanitize_pg_text(combined)
    _deindex_entry(entry)
    _index_entry(entry)

    # Orphan-Aufräumen: Soft-Delete (DB) + S3-Bytes hard delete
    orphan.is_active = False
    try:
        await s3_delete(orphan.s3_key)
    except Exception as exc:
        _log.warning("[Literatur/Orphan-Assign] S3-Cleanup fehlgeschlagen %s: %s", orphan.s3_key, exc)

    await db.commit()
    await db.refresh(entry)
    _log.info("[Literatur/Orphan] Zugeordnet: %s → %s", orphan_id, entry.id)
    return entry


@router.post("/orphans/{orphan_id}/promote", response_model=LiteratureEntryOut, status_code=201)
async def promote_orphan_to_new_entry(
    orphan_id: uuid.UUID,
    req: OrphanPromoteRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Erstellt einen neuen Literatur-Eintrag aus dem Orphan-PDF.
    Felder vom User haben Vorrang; fehlende werden mit extracted_meta gefüllt."""
    from models.literature_orphan_pdf import LiteratureOrphanPdf
    orphan = await db.get(LiteratureOrphanPdf, orphan_id)
    if not orphan or not orphan.is_active or orphan.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Unbekanntes PDF nicht gefunden")
    if not req.title.strip():
        raise HTTPException(status_code=422, detail="Titel darf nicht leer sein")
    if req.entry_type not in _VALID_ENTRY_TYPES:
        raise HTTPException(status_code=422, detail=f"entry_type muss einer von {', '.join(_VALID_ENTRY_TYPES)} sein")

    # Felder zusammenführen — User hat Vorrang
    data = req.model_dump(exclude_none=True)
    if orphan.extracted_meta:
        for k, v in orphan.extracted_meta.items():
            if k in _META_FIELDS and k not in data and v not in (None, "", []):
                data[k] = v
    data["import_source"] = "orphan_pdf"

    entry = await _create_entry_from_dict(data, user.id, db, index=False)
    await db.flush()  # ID

    # PDF aus Orphan-Bucket in entry-Pfad re-uploaden
    try:
        pdf_bytes = await s3_download(orphan.s3_key)
    except Exception as exc:
        _log.error("[Literatur/Orphan-Promote] S3-Download fehlgeschlagen %s: %s", orphan_id, exc)
        raise HTTPException(status_code=503, detail="PDF konnte nicht geladen werden")

    new_s3_key = await s3_upload(
        customer_id=user.id,
        doc_id=entry.id,
        filename=orphan.filename,
        content=pdf_bytes,
        content_type="application/pdf",
    )
    entry.pdf_s3_key = new_s3_key
    entry.pdf_size_bytes = orphan.size_bytes
    if orphan.extracted_text_preview:
        combined = _build_extracted_text(entry) + "\n\n" + orphan.extracted_text_preview[:8000]
        entry.extracted_text = _sanitize_pg_text(combined)
    _index_entry(entry)

    orphan.is_active = False
    try:
        await s3_delete(orphan.s3_key)
    except Exception as exc:
        _log.warning("[Literatur/Orphan-Promote] S3-Cleanup fehlgeschlagen %s: %s", orphan.s3_key, exc)

    await db.commit()
    await db.refresh(entry)
    _log.info("[Literatur/Orphan] Befördert zu neuem Eintrag: %s → %s", orphan_id, entry.id)
    return entry


@router.delete("/orphans/{orphan_id}", status_code=204)
async def delete_orphan(
    orphan_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from models.literature_orphan_pdf import LiteratureOrphanPdf
    orphan = await db.get(LiteratureOrphanPdf, orphan_id)
    if not orphan or not orphan.is_active or orphan.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Unbekanntes PDF nicht gefunden")
    try:
        await s3_delete(orphan.s3_key)
    except Exception as exc:
        _log.warning("[Literatur/Orphan-Delete] S3-Cleanup fehlgeschlagen %s: %s", orphan.s3_key, exc)
    orphan.is_active = False
    await db.commit()


# ── PDF Anhang ────────────────────────────────────────────────────────────────

@router.post("/{entry_id}/pdf", response_model=LiteratureEntryOut)
async def attach_pdf(
    entry_id: uuid.UUID,
    file: UploadFile = File(...),
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    content = await file.read()
    if len(content) > _MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="PDF zu gross (max. 50 MB)")

    filename = file.filename or f"{entry_id}.pdf"
    mime = file.content_type or "application/pdf"

    # Altes PDF löschen
    if entry.pdf_s3_key:
        try:
            await s3_delete(entry.pdf_s3_key)
        except Exception:
            pass

    s3_key = await s3_upload(
        customer_id=user.id,
        doc_id=entry_id,
        filename=filename,
        content=content,
        content_type=mime,
    )
    entry.pdf_s3_key = s3_key
    entry.pdf_size_bytes = len(content)
    entry.pdf_sha256 = _sha256_bytes(content)

    # Text aus PDF extrahieren und Qdrant updaten
    try:
        from services.file_parser import parse_file
        parsed = parse_file(content, filename, mime)
        if parsed.text.strip():
            entry.extracted_text = _sanitize_pg_text(_build_extracted_text(entry) + "\n\n" + parsed.text[:8000])
    except Exception as e:
        _log.warning("PDF-Parsing fehlgeschlagen für Literatureintrag %s: %s", entry_id, e)

    _deindex_entry(entry)
    _index_entry(entry)

    await db.commit()
    await db.refresh(entry)
    _log.info("[Literatur] PDF angehängt: %s → %s", entry_id, s3_key)
    return entry


# ── Bulk PDF Import (ZIP) ─────────────────────────────────────────────────────

def _normalize_for_match(text: str) -> set[str]:
    """Wörter ≥4 Zeichen aus Text als Set — für Overlap-Berechnung."""
    return set(re.findall(r'[a-z]{4,}', text.lower()))


def _word_overlap(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _extract_doi_from_text(text: str) -> str | None:
    """DOI aus PDF-Text extrahieren (erste 3000 Zeichen reichen)."""
    m = re.search(r'10\.\d{4,9}/\S+', text[:3000])
    if not m:
        return None
    doi = m.group().rstrip('.,;)/>')
    return doi.lower()


def _match_entry(
    pdf_text: str,
    pdf_stem: str,
    doi_index: dict[str, LiteratureEntry],
    entries: list[LiteratureEntry],
) -> tuple[LiteratureEntry | None, str]:
    """
    Gibt (entry, method) zurück.
    method: "doi" | "filename" | "title_text" | ""
    """
    # 1. DOI aus PDF
    doi = _extract_doi_from_text(pdf_text)
    if doi:
        entry = doi_index.get(doi)
        if entry:
            return entry, "doi"
        # Auch partieller DOI-Match (Suffix-Toleranz)
        for key, e in doi_index.items():
            if doi.startswith(key[:20]) or key.startswith(doi[:20]):
                return e, "doi"

    # 2. Dateiname gegen Titel (Wort-Overlap)
    stem_words = _normalize_for_match(re.sub(r'[_\-\.]', ' ', pdf_stem))
    best_score = 0.0
    best_entry: LiteratureEntry | None = None
    for e in entries:
        title_words = _normalize_for_match(e.title)
        score = _word_overlap(stem_words, title_words)
        if score > best_score:
            best_score = score
            best_entry = e
    if best_score >= 0.45 and best_entry:
        return best_entry, "filename"

    # 3. Titelwörter im PDF-Anfang (erste 600 Zeichen = Titelbereich)
    text_head_words = _normalize_for_match(pdf_text[:600])
    best_score = 0.0
    best_entry = None
    for e in entries:
        title_words = _normalize_for_match(e.title)
        if len(title_words) < 3:
            continue
        # Mindestens 60% der Titelwörter im PDF-Anfang
        overlap = len(title_words & text_head_words) / len(title_words)
        if overlap > best_score:
            best_score = overlap
            best_entry = e
    if best_score >= 0.60 and best_entry:
        return best_entry, "title_text"

    return None, ""


def _match_extracted_meta(
    extracted: dict,
    entries: list[LiteratureEntry],
    doi_index: dict[str, LiteratureEntry],
) -> tuple[LiteratureEntry | None, str]:
    """LLM-Fallback-Matcher: extrahierte Meta gegen XML-Einträge prüfen.
    Strenger als Heuristik (Titel ≥ 0.75 Jaccard oder Substring + DOI exact + Autor+Jahr).
    Überspringt Einträge die schon ein PDF haben.
    """
    candidates = [e for e in entries if not e.pdf_s3_key]
    if not candidates:
        return None, ""

    # 1) DOI exakt aus extrahierter Meta
    doi = (extracted.get("doi") or "").strip().lower().rstrip(".,;)/>")
    if doi and doi in doi_index:
        target = doi_index[doi]
        if not target.pdf_s3_key:
            return target, "llm_doi"

    # 2) Titel-Fuzzy
    new_title = (extracted.get("title") or "").strip()
    if new_title and len(new_title) >= 15:
        new_words = _normalize_for_match(new_title)
        new_low = new_title.lower()
        best_score = 0.0
        best_entry: LiteratureEntry | None = None
        for e in candidates:
            cur_low = (e.title or "").strip().lower()
            cur_words = _normalize_for_match(e.title or "")
            if not cur_words:
                continue
            score = _word_overlap(new_words, cur_words)
            # Substring-Bonus (XML-Truncation oder 'Author - Title'-Pattern)
            if cur_low and (cur_low in new_low or new_low in cur_low):
                score = max(score, 0.85)
            if score > best_score:
                best_score = score
                best_entry = e
        if best_score >= 0.75 and best_entry:
            return best_entry, "llm_title"

    # 3) Autor (erster Nachname) + Jahr
    year = extracted.get("year")
    authors = extracted.get("authors") or []
    if isinstance(year, int) and authors:
        first_lastname = (authors[0] or "").split(",")[0].strip().lower()
        if first_lastname and len(first_lastname) >= 3:
            for e in candidates:
                if e.year != year or not e.authors:
                    continue
                e_first_last = (e.authors[0] or "").split(",")[0].strip().lower()
                if e_first_last == first_lastname:
                    return e, "llm_author_year"

    return None, ""


# Max. LLM-Aufrufe pro ZIP-Lauf — Sicherheitsnetz gegen Mega-ZIPs.
# Haiku-Cost ≈ 0.3 ¢/Call → 5000 Calls = ~CHF 15 worst case.
# Für eine 3800-Eintrag-Library mit ~1000 Unmatched ist das ausreichend.
_MAX_LLM_FALLBACKS_PER_ZIP = 5000


@router.get("/bulk-upload-url", response_model=BulkUploadUrlResponse)
@limiter.limit("5/hour")
async def get_bulk_upload_url(
    request: Request,
    user: Customer = Depends(get_current_user),
):
    """Presigned S3 PUT-URL für direkten ZIP-Upload vom Browser (Cloudflare umgehen)."""
    s3_key = f"literature-bulk-uploads/{user.id}/{uuid.uuid4()}.zip"
    upload_url = await s3_presigned_put(s3_key, content_type="application/zip", expires_in=7200)
    return BulkUploadUrlResponse(upload_url=upload_url, s3_key=s3_key, expires_in=7200)


@router.post("/import-pdfs-from-s3", response_model=BulkPdfResponse, status_code=200)
async def import_pdfs_bulk_from_s3(
    req: BulkPdfFromS3Request,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verarbeitet eine ZIP-Datei die bereits direkt auf S3 hochgeladen wurde."""
    if not req.s3_key.startswith(f"literature-bulk-uploads/{user.id}/"):
        raise HTTPException(status_code=403, detail="Zugriff verweigert")
    try:
        content = await s3_download(req.s3_key)
    except Exception:
        raise HTTPException(status_code=404, detail="ZIP nicht gefunden — Upload möglicherweise abgelaufen")
    finally:
        # Temp-Datei immer löschen, auch bei Fehler
        try:
            await s3_delete(req.s3_key)
        except Exception:
            pass
    return await _process_bulk_zip(content, user, db)


@router.post("/import-pdfs", response_model=BulkPdfResponse, status_code=200)
async def import_pdfs_bulk(
    file: UploadFile = File(...),
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Direkter ZIP-Upload (für kleine ZIPs ≤ 90 MB)."""
    filename = (file.filename or "").lower()
    if not filename.endswith(".zip"):
        raise HTTPException(status_code=415, detail="Nur .zip Dateien werden unterstützt")

    content = await file.read()
    if len(content) > 90 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="ZIP zu gross für Direktupload (max. 90 MB). Bitte S3-Upload-Flow verwenden.")

    return await _process_bulk_zip(content, user, db)


async def _save_pdf_as_orphan(
    pdf_bytes: bytes,
    basename: str,
    user: Customer,
    db: AsyncSession,
    extracted_meta: dict | None,
    pdf_text: str,
    pdf_hash: str | None = None,
) -> "uuid.UUID | None":
    """Speichert ein nicht zuordenbares PDF im Postfach (S3 + DB-Eintrag).
    Gibt die Orphan-ID zurück oder None bei Fehler."""
    from models.literature_orphan_pdf import LiteratureOrphanPdf
    orphan_id = uuid.uuid4()
    try:
        s3_key = await s3_upload(
            customer_id=user.id,
            doc_id=orphan_id,
            filename=basename,
            content=pdf_bytes,
            content_type="application/pdf",
        )
    except Exception as exc:
        _log.error("[Literatur/Orphan] S3-Upload fehlgeschlagen für %s: %s", basename, exc)
        return None

    try:
        orphan = LiteratureOrphanPdf(
            id=orphan_id,
            customer_id=user.id,
            filename=basename[:512],
            s3_key=s3_key,
            size_bytes=len(pdf_bytes),
            sha256=pdf_hash,
            extracted_meta=extracted_meta,
            extracted_text_preview=_sanitize_pg_text(pdf_text[:4000]) if pdf_text else None,
        )
        db.add(orphan)
        await db.commit()
        return orphan_id
    except Exception as exc:
        _log.error("[Literatur/Orphan] DB-Insert fehlgeschlagen für %s: %s", basename, exc)
        try: await db.rollback()
        except Exception: pass
        # PDF wieder aus S3 entfernen, wenn DB-Insert scheitert
        try: await s3_delete(s3_key)
        except Exception: pass
        return None


async def _run_zip_entries(
    zf: zipfile.ZipFile,
    user: Customer,
    db: AsyncSession,
) -> BulkPdfResponse:
    """Innere ZIP-Verarbeitung: matching, S3-Upload, DB-Update — shared zwischen allen ZIP-Import-Pfaden.
    Ablauf pro PDF:
      1) Heuristik-Match (DOI / Dateiname / Titel-Text)
      2) Bei Miss: Haiku-Metadaten-Extraktion + Re-Match (DOI exakt / Titel-Fuzzy / Autor+Jahr)
      3) Bei finalem Miss: PDF ins Postfach (Orphan) — User kann später manuell zuordnen
    """
    result_q = await db.execute(
        select(LiteratureEntry).where(
            LiteratureEntry.customer_id == user.id,
            LiteratureEntry.is_active.is_(True),
        )
    )
    entries: list[LiteratureEntry] = result_q.scalars().all()

    doi_index: dict[str, LiteratureEntry] = {
        e.doi.strip().lower(): e
        for e in entries
        if e.doi and e.doi.strip()
    }

    details: list[PdfMatchDetail] = []
    matched_count = 0
    already_count = 0
    orphan_count = 0
    skipped_by_hash = 0
    llm_calls = 0

    # Vor-Cache: alle bereits bekannten Hashes des Kunden in einer einzigen Query
    # ziehen → in-memory dict für O(1)-Lookups statt N+1 SQL-Calls.
    hash_to_entry_id: dict[str, uuid.UUID] = {}
    orphan_hashes: set[str] = set()
    try:
        ent_q = await db.execute(
            select(LiteratureEntry.id, LiteratureEntry.pdf_sha256).where(
                LiteratureEntry.customer_id == user.id,
                LiteratureEntry.is_active.is_(True),
                LiteratureEntry.pdf_sha256.isnot(None),
                LiteratureEntry.pdf_s3_key.isnot(None),
            )
        )
        hash_to_entry_id = {h: i for (i, h) in ent_q.all() if h}

        from models.literature_orphan_pdf import LiteratureOrphanPdf
        orph_q = await db.execute(
            select(LiteratureOrphanPdf.sha256).where(
                LiteratureOrphanPdf.customer_id == user.id,
                LiteratureOrphanPdf.is_active.is_(True),
                LiteratureOrphanPdf.sha256.isnot(None),
            )
        )
        orphan_hashes = {h for (h,) in orph_q.all() if h}
    except Exception as exc:
        _log.warning("[Literatur/ZIP] Hash-Cache laden fehlgeschlagen: %s", exc)

    pdf_names = [
        n for n in zf.namelist()
        if n.lower().endswith(".pdf") and not os.path.basename(n).startswith(".")
    ]

    for pdf_name in pdf_names:
        basename = os.path.basename(pdf_name)
        stem = os.path.splitext(basename)[0]

        try:
            pdf_bytes = zf.read(pdf_name)
        except Exception as e:
            _log.warning("[Literatur/ZIP] Fehler beim Lesen von %s: %s", pdf_name, e)
            details.append(PdfMatchDetail(filename=basename, status="unmatched"))
            continue

        # Fast-Skip via SHA256: PDF schon einem Eintrag oder einem Orphan zugeordnet
        pdf_hash = _sha256_bytes(pdf_bytes)
        existing_entry_id = hash_to_entry_id.get(pdf_hash)
        if existing_entry_id:
            already_count += 1
            skipped_by_hash += 1
            details.append(PdfMatchDetail(
                filename=basename, status="already_had_pdf",
                match_method="sha256", entry_id=str(existing_entry_id),
            ))
            continue
        if pdf_hash in orphan_hashes:
            already_count += 1  # ist schon im Postfach gelandet, nicht erneut
            skipped_by_hash += 1
            details.append(PdfMatchDetail(
                filename=basename, status="already_had_pdf", match_method="sha256_orphan",
            ))
            continue

        pdf_text = ""
        try:
            from services.file_parser import parse_file
            parsed = parse_file(pdf_bytes, basename, "application/pdf")
            pdf_text = parsed.text[:4000]
        except Exception:
            pass

        # Stufe 1: Heuristik-Match
        matched_entry, method = _match_entry(pdf_text, stem, doi_index, entries)
        extracted_meta_for_orphan: dict | None = None

        # Stufe 2: LLM-Fallback wenn Heuristik nichts findet
        if not matched_entry and pdf_text.strip() and llm_calls < _MAX_LLM_FALLBACKS_PER_ZIP:
            llm_calls += 1
            extracted_meta, _ = await _extract_pdf_meta_from_bytes(pdf_bytes, basename)
            extracted_meta_for_orphan = extracted_meta
            if extracted_meta:
                matched_entry, method = _match_extracted_meta(extracted_meta, entries, doi_index)

        # Stufe 3: Postfach (Orphan) — unmatched aber persistiert
        if not matched_entry:
            orphan_id = await _save_pdf_as_orphan(
                pdf_bytes, basename, user, db,
                extracted_meta=extracted_meta_for_orphan,
                pdf_text=pdf_text,
                pdf_hash=pdf_hash,
            )
            if orphan_id:
                orphan_count += 1
                orphan_hashes.add(pdf_hash)  # Live-Cache: gleiches PDF erneut → skip
                details.append(PdfMatchDetail(
                    filename=basename, status="orphan", orphan_id=str(orphan_id),
                ))
            else:
                details.append(PdfMatchDetail(filename=basename, status="unmatched"))
            continue

        if matched_entry.pdf_s3_key:
            # Optimistisch Hash am bestehenden Eintrag speichern (falls noch fehlt) —
            # bei Heuristik-Match auf Titel/DOI gehen wir davon aus, dass das ZIP-PDF
            # identisch zum bereits angehängten ist. Macht den nächsten Re-Upload schnell.
            if not matched_entry.pdf_sha256:
                matched_entry.pdf_sha256 = pdf_hash
                try:
                    await db.commit()
                    hash_to_entry_id[pdf_hash] = matched_entry.id
                except Exception:
                    await db.rollback()
            already_count += 1
            details.append(PdfMatchDetail(
                filename=basename,
                status="already_had_pdf",
                match_method=method,
                matched_title=matched_entry.title,
                entry_id=str(matched_entry.id),
            ))
            continue

        try:
            s3_key = await s3_upload(
                customer_id=user.id,
                doc_id=matched_entry.id,
                filename=basename,
                content=pdf_bytes,
                content_type="application/pdf",
            )
            matched_entry.pdf_s3_key = s3_key
            matched_entry.pdf_size_bytes = len(pdf_bytes)
            matched_entry.pdf_sha256 = pdf_hash

            if pdf_text.strip():
                combined = _build_extracted_text(matched_entry) + "\n\n" + pdf_text[:8000]
                matched_entry.extracted_text = _sanitize_pg_text(combined)
            _deindex_entry(matched_entry)
            _index_entry(matched_entry)

            try:
                await db.commit()
            except Exception as commit_err:
                _log.error("[Literatur/ZIP] Commit fehlgeschlagen für %s: %s — überspringe", basename, commit_err)
                await db.rollback()
                details.append(PdfMatchDetail(filename=basename, status="unmatched"))
                continue

            # Live-Cache aktualisieren — falls dasselbe PDF im ZIP nochmal vorkommt,
            # wird es jetzt sofort als "already_had_pdf" erkannt
            hash_to_entry_id[pdf_hash] = matched_entry.id

            matched_count += 1
            details.append(PdfMatchDetail(
                filename=basename,
                status="matched",
                match_method=method,
                matched_title=matched_entry.title,
                entry_id=str(matched_entry.id),
            ))
        except Exception as e:
            _log.error("[Literatur/ZIP] PDF-Verarbeitung fehlgeschlagen für %s: %s", basename, e)
            try: await db.rollback()
            except Exception: pass
            details.append(PdfMatchDetail(filename=basename, status="unmatched"))

    unmatched = sum(1 for d in details if d.status == "unmatched")
    _log.info(
        "[Literatur/ZIP] %d zugeordnet, %d hatte schon PDF (davon %d via Hash-Skip), "
        "%d ins Postfach, %d Lese-Fehler, %d LLM-Aufrufe — Kunde %s",
        matched_count, already_count, skipped_by_hash, orphan_count, unmatched, llm_calls, user.id,
    )
    return BulkPdfResponse(
        matched=matched_count,
        already_had_pdf=already_count,
        unmatched=unmatched,
        orphans=orphan_count,
        skipped_by_hash=skipped_by_hash,
        details=details,
    )


# ZIP-Sicherheitsgrenzen:
# - Max. unkomprimierte Gesamtgrösse: 50 GB (reicht für > 100k PDFs)
# - Max. Compression-Ratio: 200x (PDFs sind ≈1:1, normale Files ≤50x;
#   hohe Ratios deuten auf Zip-Bombs hin)
_MAX_ZIP_UNCOMPRESSED = 50 * 1024 * 1024 * 1024  # 50 GB
_MAX_ZIP_COMPRESSION_RATIO = 200


def _validate_zip_safety(zf: zipfile.ZipFile) -> None:
    total_uncompressed = 0
    total_compressed = 0
    for info in zf.infolist():
        total_uncompressed += info.file_size
        total_compressed += info.compress_size
    if total_uncompressed > _MAX_ZIP_UNCOMPRESSED:
        raise HTTPException(
            status_code=413,
            detail=f"ZIP-Inhalt zu gross (max. {_MAX_ZIP_UNCOMPRESSED // (1024**3)} GB unkomprimiert)",
        )
    # Zip-Bomb-Schutz: nur prüfen wenn komprimierte Grösse nicht vernachlässigbar ist
    if total_compressed > 1024 and total_uncompressed / total_compressed > _MAX_ZIP_COMPRESSION_RATIO:
        raise HTTPException(
            status_code=422,
            detail="ZIP-Datei verdächtig stark komprimiert — möglicher Zip-Bomb-Angriff",
        )


async def _process_bulk_zip(content: bytes, user: Customer, db: AsyncSession) -> BulkPdfResponse:
    """ZIP-Import von Bytes (kleines ZIP ≤ 90 MB)."""
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise HTTPException(status_code=422, detail="Ungültige ZIP-Datei")
    with zipfile.ZipFile(io.BytesIO(content)) as _zf_check:
        _validate_zip_safety(_zf_check)
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        return await _run_zip_entries(zf, user, db)


async def _process_bulk_zip_from_path(zip_path: pathlib.Path, user: Customer, db: AsyncSession) -> BulkPdfResponse:
    """ZIP-Import von Datei-Pfad (grosses ZIP — kein RAM für Gesamtinhalt nötig)."""
    if not zipfile.is_zipfile(zip_path):
        raise HTTPException(status_code=422, detail="Ungültige ZIP-Datei")
    with zipfile.ZipFile(zip_path) as _zf_check:
        _validate_zip_safety(_zf_check)
    with zipfile.ZipFile(zip_path) as zf:
        return await _run_zip_entries(zf, user, db)


async def _bulk_zip_background_task(zip_path_str: str, customer_id_str: str, upload_id: str) -> None:
    """Background: ZIP verarbeiten, Redis-Status schreiben, Temp-Verzeichnis aufräumen."""
    import redis.asyncio as aioredis
    from core.config import settings
    from core.database import AsyncSessionLocal
    from models.customer import Customer as CustomerModel

    zip_path = pathlib.Path(zip_path_str)
    customer_id = uuid.UUID(customer_id_str)
    redis_key = f"lit_bulk:{customer_id}:{upload_id}"
    r = aioredis.from_url(settings.redis_url)

    try:
        async with AsyncSessionLocal() as db:
            user = await db.get(CustomerModel, customer_id)
            if not user:
                await r.set(redis_key, _json.dumps({"status": "error", "upload_id": upload_id, "error": "Kunde nicht gefunden"}), ex=21600)
                return
            result = await _process_bulk_zip_from_path(zip_path, user, db)
        await r.set(redis_key, _json.dumps({"status": "done", "upload_id": upload_id, "result": result.model_dump(mode="json")}), ex=21600)
        _log.info("[Literatur/ZIP] Hintergrund-Verarbeitung abgeschlossen: %s", upload_id)
    except HTTPException as exc:
        await r.set(redis_key, _json.dumps({"status": "error", "upload_id": upload_id, "error": exc.detail}), ex=21600)
    except Exception as exc:
        _log.error("[Literatur/ZIP] Hintergrund-Verarbeitung fehlgeschlagen für %s: %s", upload_id, exc)
        await r.set(redis_key, _json.dumps({"status": "error", "upload_id": upload_id, "error": str(exc)[:200]}), ex=21600)
    finally:
        shutil.rmtree(zip_path.parent, ignore_errors=True)
        await r.aclose()


@router.post("/import-pdfs/upload-chunk", response_model=ChunkUploadResponse)
@limiter.limit("2000/hour")  # 2000 × 90 MB = ~180 GB/h — genug für sehr grosse Uploads
async def upload_pdf_chunk(
    request: Request,
    background_tasks: BackgroundTasks,
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    chunk: UploadFile = File(...),
    user: Customer = Depends(get_current_user),
):
    """Chunk eines ZIP-Uploads empfangen. Letzter Chunk startet Hintergrundverarbeitung."""
    if not re.match(r'^[a-f0-9]{32}$', upload_id):
        raise HTTPException(status_code=422, detail="Ungültige Upload-ID")
    if not (0 <= chunk_index < total_chunks):
        raise HTTPException(status_code=422, detail="Ungültiger Chunk-Index")
    if not (1 <= total_chunks <= 200):
        raise HTTPException(status_code=422, detail="total_chunks muss zwischen 1 und 200 liegen")

    chunk_dir = _CHUNK_TMP_BASE / f"{user.id}_{upload_id}"
    chunk_dir.mkdir(parents=True, exist_ok=True)

    chunk_data = await chunk.read()
    if len(chunk_data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Chunk zu gross (max. 100 MB)")

    (chunk_dir / f"chunk_{chunk_index:04d}").write_bytes(chunk_data)
    received = len(list(chunk_dir.glob("chunk_????")))

    if received < total_chunks:
        return ChunkUploadResponse(upload_id=upload_id, chunks_received=received, total_chunks=total_chunks, status="uploading")

    # Alle Chunks da — zusammensetzen
    assembled_path = chunk_dir / "assembled.zip"
    with assembled_path.open("wb") as f_out:
        for i in range(total_chunks):
            part = chunk_dir / f"chunk_{i:04d}"
            if not part.exists():
                raise HTTPException(status_code=422, detail=f"Chunk {i} fehlt — Upload erneut starten")
            f_out.write(part.read_bytes())
            part.unlink()

    # Redis-Status setzen BEVOR BackgroundTask startet
    import redis.asyncio as aioredis
    from core.config import settings as _settings
    r = aioredis.from_url(_settings.redis_url)
    await r.set(f"lit_bulk:{user.id}:{upload_id}", _json.dumps({"status": "processing", "upload_id": upload_id}), ex=21600)
    await r.aclose()

    background_tasks.add_task(_bulk_zip_background_task, str(assembled_path), str(user.id), upload_id)
    _log.info("[Literatur/ZIP] Alle %d Chunks erhalten, starte Verarbeitung: %s", total_chunks, upload_id)
    return ChunkUploadResponse(upload_id=upload_id, chunks_received=received, total_chunks=total_chunks, status="processing")


@router.get("/import-pdfs/status/{upload_id}", response_model=UploadStatusResponse)
async def get_upload_status(
    upload_id: str,
    user: Customer = Depends(get_current_user),
):
    """ZIP-Import-Status aus Redis lesen."""
    if not re.match(r'^[a-f0-9]{32}$', upload_id):
        raise HTTPException(status_code=422, detail="Ungültige Upload-ID")

    import redis.asyncio as aioredis
    from core.config import settings as _settings
    r = aioredis.from_url(_settings.redis_url)
    try:
        raw = await r.get(f"lit_bulk:{user.id}:{upload_id}")
    finally:
        await r.aclose()

    if not raw:
        raise HTTPException(status_code=404, detail="Upload nicht gefunden oder abgelaufen")

    data = _json.loads(raw)
    return UploadStatusResponse(
        status=data["status"],
        upload_id=upload_id,
        result=BulkPdfResponse(**data["result"]) if data.get("result") else None,
        error=data.get("error"),
    )


@router.get("/{entry_id}/pdf")
async def download_pdf(
    entry_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import Response

    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or not entry.is_active or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if not entry.pdf_s3_key:
        raise HTTPException(status_code=404, detail="Kein PDF angehängt")

    try:
        file_bytes = await s3_download(entry.pdf_s3_key)
    except Exception as e:
        _log.error("S3-Download fehlgeschlagen für Literatur-PDF %s: %s", entry_id, e)
        raise HTTPException(status_code=503, detail="PDF vorübergehend nicht verfügbar")

    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition("inline", entry.title, ".pdf")},
    )
