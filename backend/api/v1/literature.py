"""
Literatur-Endpunkte — persönliche Literaturdatenbank pro Kunde.

  GET    /v1/literature/mine              — eigene Einträge
  POST   /v1/literature/                  — manuell anlegen
  PUT    /v1/literature/{id}              — bearbeiten
  DELETE /v1/literature/{id}             — löschen
  POST   /v1/literature/import            — .ris / .xml Datei importieren
  POST   /v1/literature/{id}/pdf          — PDF anhängen
  GET    /v1/literature/{id}/pdf          — PDF herunterladen
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from models.literature_entry import LiteratureEntry
from services.literature_parser import parse_endnote_xml, parse_ris
from services.s3_storage import delete_file as s3_delete
from services.s3_storage import download_file as s3_download
from services.s3_storage import upload_file as s3_upload

_log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/literature", tags=["literature"])

_QDRANT_COLLECTION = "literature"
_MAX_PDF_SIZE = 50 * 1024 * 1024


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
    import_source: str
    created_at: datetime

    model_config = {"from_attributes": True}


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


class ImportResponse(BaseModel):
    imported: int
    skipped: int
    entries: list[LiteratureEntryOut]


# ── Helpers ───────────────────────────────────────────────────────────────────

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


async def _create_entry_from_dict(
    data: dict[str, Any],
    customer_id: uuid.UUID,
    db: AsyncSession,
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
    entry.extracted_text = _build_extracted_text(entry)
    db.add(entry)
    await db.flush()  # get ID before indexing
    _index_entry(entry)
    return entry


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

    for field, value in req.model_dump(exclude_none=True).items():
        setattr(entry, field, value)

    entry.extracted_text = _build_extracted_text(entry)
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


# ── Import ────────────────────────────────────────────────────────────────────

@router.post("/import", response_model=ImportResponse, status_code=201)
async def import_literature(
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
        entry = await _create_entry_from_dict(data, user.id, db)
        existing_titles.add(data["title"].lower())
        created.append(entry)

    if created:
        await db.commit()
        for e in created:
            await db.refresh(e)

    _log.info("[Literatur] Import: %d neu, %d übersprungen für Kunde %s", len(created), skipped, user.id)
    return ImportResponse(imported=len(created), skipped=skipped, entries=created)


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

    # Text aus PDF extrahieren und Qdrant updaten
    try:
        from services.file_parser import parse_file
        parsed = parse_file(content, filename, mime)
        if parsed.text.strip():
            entry.extracted_text = _build_extracted_text(entry) + "\n\n" + parsed.text[:8000]
    except Exception as e:
        _log.warning("PDF-Parsing fehlgeschlagen für Literatureintrag %s: %s", entry_id, e)

    _deindex_entry(entry)
    _index_entry(entry)

    await db.commit()
    await db.refresh(entry)
    _log.info("[Literatur] PDF angehängt: %s → %s", entry_id, s3_key)
    return entry


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
        headers={"Content-Disposition": f'inline; filename="{entry.title[:60]}.pdf"'},
    )
