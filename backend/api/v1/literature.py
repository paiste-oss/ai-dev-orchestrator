"""
Literatur-Endpunkte — persönliche Literaturdatenbank pro Kunde.

  GET    /v1/literature/mine              — eigene Einträge
  POST   /v1/literature/                  — manuell anlegen
  PUT    /v1/literature/{id}              — bearbeiten
  DELETE /v1/literature/{id}             — löschen
  POST   /v1/literature/import            — .ris / .xml Datei importieren
  GET    /v1/literature/bulk-upload-url    — Presigned S3-URL für direkten ZIP-Upload
  POST   /v1/literature/import-pdfs-from-s3 — ZIP aus S3 verarbeiten (nach S3-Upload)
  POST   /v1/literature/import-pdfs       — ZIP direkt hochladen (≤ 90 MB)
  POST   /v1/literature/{id}/pdf          — PDF anhängen
  GET    /v1/literature/{id}/pdf          — PDF herunterladen
"""
from __future__ import annotations

import io
import logging
import os
import re
import uuid
import zipfile
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
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
from services.literature_parser import parse_endnote_xml, parse_ris
from services.s3_storage import delete_file as s3_delete
from services.s3_storage import download_file as s3_download
from services.s3_storage import generate_presigned_put_url as s3_presigned_put
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
    entry.extracted_text = _build_extracted_text(entry)
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


# ── Bulk PDF Import (ZIP) ─────────────────────────────────────────────────────

class PdfMatchDetail(BaseModel):
    filename: str
    status: str          # "matched" | "already_has_pdf" | "unmatched"
    match_method: str | None = None   # "doi" | "filename" | "title_text"
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


async def _process_bulk_zip(
    content: bytes,
    user: Customer,
    db: AsyncSession,
) -> BulkPdfResponse:
    """Kern-Logik für den ZIP-PDF-Import — shared zwischen direktem Upload und S3-Flow."""
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise HTTPException(status_code=422, detail="Ungültige ZIP-Datei")

    # Alle aktiven Einträge des Users laden
    result = await db.execute(
        select(LiteratureEntry).where(
            LiteratureEntry.customer_id == user.id,
            LiteratureEntry.is_active.is_(True),
        )
    )
    entries: list[LiteratureEntry] = result.scalars().all()

    doi_index: dict[str, LiteratureEntry] = {
        e.doi.strip().lower(): e
        for e in entries
        if e.doi and e.doi.strip()
    }

    details: list[PdfMatchDetail] = []
    matched_count = 0
    already_count = 0

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
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

            # Text extrahieren (nur für Matching — Fehler sind unkritisch)
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

            # S3-Upload
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
                    matched_entry.extracted_text = (
                        _build_extracted_text(matched_entry) + "\n\n" + pdf_text[:8000]
                    )
                _deindex_entry(matched_entry)
                _index_entry(matched_entry)

                matched_count += 1
                details.append(PdfMatchDetail(
                    filename=basename,
                    status="matched",
                    match_method=method,
                    matched_title=matched_entry.title,
                    entry_id=str(matched_entry.id),
                ))
            except Exception as e:
                _log.error("[Literatur/ZIP] S3-Upload fehlgeschlagen für %s: %s", basename, e)
                details.append(PdfMatchDetail(filename=basename, status="unmatched"))

    if matched_count:
        await db.commit()

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
