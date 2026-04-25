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
from sqlalchemy import select
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
    group_id: uuid.UUID | None
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


class EntryGroupAssign(BaseModel):
    group_id: uuid.UUID | None = None


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
    status: str          # "matched" | "already_has_pdf" | "unmatched"
    match_method: str | None = None
    matched_title: str | None = None
    entry_id: str | None = None


class BulkPdfResponse(BaseModel):
    matched: int
    already_had_pdf: int
    unmatched: int
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


@router.patch("/{entry_id}/group", response_model=LiteratureEntryOut)
async def assign_entry_group(
    entry_id: uuid.UUID,
    req: EntryGroupAssign,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(LiteratureEntry, entry_id)
    if not entry or entry.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    if req.group_id is not None:
        grp = await db.get(LiteratureGroup, req.group_id)
        if not grp or grp.customer_id != user.id:
            raise HTTPException(status_code=404, detail="Gruppe nicht gefunden")
    entry.group_id = req.group_id
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
    # Einträge aus der Gruppe lösen (SET NULL via FK-Constraint, aber explizit für Subordner)
    await db.execute(
        select(LiteratureEntry)
        .where(LiteratureEntry.group_id == group_id)
    )
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
        safe_title = re.sub(r"[^\w\-. ]", "_", e.title)[:120].strip() or "literatur"
        filename = f"{safe_title}.pdf"
        return StreamingResponse(
            io.BytesIO(content), media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
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


async def _run_zip_entries(
    zf: zipfile.ZipFile,
    user: Customer,
    db: AsyncSession,
) -> BulkPdfResponse:
    """Innere ZIP-Verarbeitung: matching, S3-Upload, DB-Update — shared zwischen allen ZIP-Import-Pfaden."""
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

        pdf_text = ""
        try:
            from services.file_parser import parse_file
            parsed = parse_file(pdf_bytes, basename, "application/pdf")
            pdf_text = parsed.text[:4000]
        except Exception:
            pass

        matched_entry, method = _match_entry(pdf_text, stem, doi_index, entries)

        if not matched_entry:
            details.append(PdfMatchDetail(filename=basename, status="unmatched"))
            continue

        if matched_entry.pdf_s3_key:
            already_count += 1
            details.append(PdfMatchDetail(
                filename=basename,
                status="already_has_pdf",
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

            if pdf_text.strip():
                combined = _build_extracted_text(matched_entry) + "\n\n" + pdf_text[:8000]
                matched_entry.extracted_text = _sanitize_pg_text(combined)
            _deindex_entry(matched_entry)
            _index_entry(matched_entry)

            # Per-PDF-Commit — ein Fehler bei einem PDF zerschmettert nicht den Batch
            try:
                await db.commit()
            except Exception as commit_err:
                _log.error("[Literatur/ZIP] Commit fehlgeschlagen für %s: %s — überspringe", basename, commit_err)
                await db.rollback()
                details.append(PdfMatchDetail(filename=basename, status="unmatched"))
                continue

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
        "[Literatur/ZIP] %d zugeordnet, %d hatte schon PDF, %d unbekannt — Kunde %s",
        matched_count, already_count, unmatched, user.id,
    )
    return BulkPdfResponse(
        matched=matched_count,
        already_had_pdf=already_count,
        unmatched=unmatched,
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
        headers={"Content-Disposition": f'inline; filename="{entry.title[:60]}.pdf"'},
    )
