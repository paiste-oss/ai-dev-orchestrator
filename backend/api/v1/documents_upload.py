"""
Document Upload Endpoints — gemountet unter dem documents-Router.

  POST /v1/documents/upload       — Datei hochladen, parsen, in S3/Qdrant/PG speichern
  POST /v1/documents/save_image   — Bild von URL herunterladen und als Dokument speichern
"""
from __future__ import annotations
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from core.exceptions import file_too_large, storage_limit_exceeded
from models.customer import Customer
from models.document import CustomerDocument
from schemas.base import BaseAPIModel
from services.file_parser import SUPPORTED_EXTENSIONS, get_file_extension, is_supported, parse_file
from services.s3_storage import upload_file as s3_upload
from services.vector_store import store_document_vectors

_log = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024


# ─── Response Schemas ────────────────────────────────────────────────────────

class DocumentOut(BaseAPIModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    filename: str
    original_filename: str
    file_type: str
    file_size_bytes: int
    page_count: int
    char_count: int
    stored_in_postgres: bool
    stored_in_qdrant: bool
    stored_in_s3: bool
    qdrant_collection: str | None
    folder_id: uuid.UUID | None
    baddi_readable: bool
    created_at: datetime
    doc_metadata: dict | None


class DocumentWithText(DocumentOut):
    extracted_text: str | None


class SearchRequest(BaseModel):
    customer_id: uuid.UUID
    query: str
    top_k: int = 5


class SearchResult(BaseModel):
    score: float
    text: str
    filename: str
    document_id: str


class SaveImageRequest(BaseModel):
    url: str
    filename: str = "bild.png"


# ─── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    customer_id: uuid.UUID = Form(...),
    store_postgres: bool = Form(True),
    store_qdrant: bool = Form(True),
    qdrant_collection: str = Form("customer_documents"),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise file_too_large()

    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    total_limit = (customer.storage_limit_bytes or 0) + (customer.storage_extra_bytes or 0)
    used = customer.storage_used_bytes or 0
    if used + len(content) > total_limit:
        raise storage_limit_exceeded(max(0, total_limit - used) / 1024 / 1024)

    filename = file.filename or "unknown"
    mime_type = file.content_type or ""
    ext = get_file_extension(filename)

    if not is_supported(filename, mime_type):
        raise HTTPException(
            status_code=415,
            detail=f"Dateityp '{ext}' nicht unterstützt. Erlaubt: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    try:
        parse_result = parse_file(content, filename, mime_type)
    except Exception as e:
        _log.error("Datei-Parsing fehlgeschlagen für '%s': %s", filename, e)
        raise HTTPException(status_code=422, detail=f"Datei konnte nicht verarbeitet werden: {e}")

    unique_filename = f"{customer_id}_{uuid.uuid4().hex[:8]}_{filename}"

    doc = CustomerDocument(
        customer_id=customer_id,
        filename=unique_filename,
        original_filename=filename,
        file_type=ext or "unknown",
        file_size_bytes=len(content),
        mime_type=mime_type,
        file_content=None,
        extracted_text=parse_result.text if store_postgres else None,
        page_count=parse_result.page_count,
        char_count=len(parse_result.text),
        stored_in_postgres=store_postgres,
        stored_in_qdrant=False,
        stored_in_s3=False,
        doc_metadata=parse_result.metadata,
    )
    db.add(doc)
    try:
        await db.commit()
        await db.refresh(doc)
    except Exception as e:
        _log.error("Dokument konnte nicht in DB gespeichert werden ('%s'): %s", filename, e)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Dokument konnte nicht gespeichert werden")

    try:
        await db.execute(
            sa_update(Customer)
            .where(Customer.id == customer_id)
            .values(storage_used_bytes=Customer.storage_used_bytes + len(content))
        )
        await db.commit()
    except Exception as e:
        _log.warning("Storage-Zähler konnte nicht aktualisiert werden für Kunde %s: %s", customer_id, e)

    try:
        s3_key = await s3_upload(
            customer_id=customer_id,
            doc_id=doc.id,
            filename=filename,
            content=content,
            content_type=mime_type,
        )
        doc.s3_key = s3_key
        doc.stored_in_s3 = True
        await db.commit()
    except Exception as e:
        _log.error("S3-Upload fehlgeschlagen für Dokument %s: %s", doc.id, e)

    if store_qdrant and parse_result.text.strip():
        try:
            point_ids = store_document_vectors(
                customer_id=str(customer_id),
                document_id=str(doc.id),
                filename=filename,
                text=parse_result.text,
                collection_name=qdrant_collection,
            )
            doc.stored_in_qdrant = True
            doc.qdrant_point_ids = point_ids
            doc.qdrant_collection = qdrant_collection
            await db.commit()
            await db.refresh(doc)
        except Exception as e:
            _log.error("Qdrant-Speicherung fehlgeschlagen für Dokument %s: %s", doc.id, e)

    return doc


# ─── Save Image from URL ──────────────────────────────────────────────────────

@router.post("/save_image", response_model=DocumentOut, status_code=201)
async def save_image_from_url(
    body: SaveImageRequest,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(body.url)
            resp.raise_for_status()
            content = resp.content
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Bild konnte nicht heruntergeladen werden: {e}")

    content_type = resp.headers.get("content-type", "image/png").split(";")[0].strip()
    ext = "png" if "png" in content_type else "jpg"
    filename = body.filename if body.filename.strip() else f"bild.{ext}"
    if not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        filename = filename + "." + ext

    total_limit = (customer.storage_limit_bytes or 0) + (customer.storage_extra_bytes or 0)
    used = customer.storage_used_bytes or 0
    if total_limit > 0 and used + len(content) > total_limit:
        raise storage_limit_exceeded(max(0, total_limit - used) / 1024 / 1024)

    doc_id = uuid.uuid4()
    unique_filename = f"{customer.id}_{doc_id.hex[:8]}_{filename}"
    doc = CustomerDocument(
        id=doc_id,
        customer_id=customer.id,
        filename=unique_filename,
        original_filename=filename,
        file_type=ext,
        file_size_bytes=len(content),
        mime_type=content_type,
        file_content=None,
        extracted_text="",
        page_count=1,
        char_count=0,
        stored_in_postgres=True,
        stored_in_qdrant=False,
        stored_in_s3=False,
        doc_metadata={"source": "DALL-E 3", "original_url": body.url},
    )
    db.add(doc)
    try:
        await db.commit()
        await db.refresh(doc)
    except Exception as e:
        _log.error("Bild-Dokument konnte nicht gespeichert werden: %s", e)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Bild konnte nicht gespeichert werden")

    try:
        s3_key = await s3_upload(
            customer_id=customer.id,
            doc_id=doc.id,
            filename=filename,
            content=content,
            content_type=content_type,
        )
        doc.s3_key = s3_key
        doc.stored_in_s3 = True
        await db.commit()
    except Exception as e:
        _log.error("S3-Upload fehlgeschlagen für Bild %s: %s", doc.id, e)

    try:
        await db.execute(
            sa_update(Customer)
            .where(Customer.id == customer.id)
            .values(storage_used_bytes=Customer.storage_used_bytes + len(content))
        )
        await db.commit()
    except Exception as e:
        _log.warning("Storage-Zähler konnte nicht aktualisiert werden: %s", e)

    return doc
