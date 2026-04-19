"""
Document Upload & Management API
POST /v1/documents/upload      → Datei hochladen + parsen + speichern
GET  /v1/documents/{customer_id}  → Alle Dokumente eines Kunden
GET  /v1/documents/file/{doc_id}  → Einzelnes Dokument
DELETE /v1/documents/file/{doc_id} → Dokument löschen
POST /v1/documents/search          → Semantische Suche in Kundendokumenten
"""
import logging
import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Query

_log = logging.getLogger(__name__)
from core.exceptions import not_found, file_too_large, storage_limit_exceeded
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from sqlalchemy import update as sa_update
from core.database import get_db
from core.dependencies import get_current_user
from schemas.base import BaseAPIModel
from models.document import CustomerDocument
from models.customer import Customer
from services.file_parser import parse_file, is_supported, get_file_extension, SUPPORTED_EXTENSIONS
from services.vector_store import store_document_vectors, search_customer_documents, delete_document_vectors
from services.s3_storage import upload_file as s3_upload, download_file as s3_download, delete_file as s3_delete

router = APIRouter(prefix="/documents", tags=["documents"])

# Maximale Dateigröße: 50 MB
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


# ─── Upload Endpoint ─────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    customer_id: uuid.UUID = Form(...),
    store_postgres: bool = Form(True),    # Text in PostgreSQL speichern
    store_qdrant: bool = Form(True),      # Vektoren in Qdrant speichern
    qdrant_collection: str = Form("customer_documents"),  # Qdrant Collection
    db: AsyncSession = Depends(get_db),
):
    """
    Lädt eine Datei hoch, extrahiert den Text und speichert ihn
    wahlweise in PostgreSQL (strukturiert) und/oder Qdrant (semantisch).
    """
    # Datei-Größe prüfen
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise file_too_large()

    # Speicherlimit prüfen
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

    # Dateityp prüfen
    if not is_supported(filename, mime_type):
        raise HTTPException(
            status_code=415,
            detail=f"Dateityp '{ext}' nicht unterstützt. Erlaubt: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    # Text extrahieren
    try:
        parse_result = parse_file(content, filename, mime_type)
    except Exception as e:
        _log.error("Datei-Parsing fehlgeschlagen für '%s': %s", filename, e)
        raise HTTPException(status_code=422, detail=f"Datei konnte nicht verarbeitet werden: {e}")

    # Eindeutiger Dateiname für interne Referenz
    unique_filename = f"{customer_id}_{uuid.uuid4().hex[:8]}_{filename}"

    # PostgreSQL: Dokument-Record erstellen (ohne Binärdaten — gehen nach S3)
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

    # Storage-Zähler erhöhen
    try:
        await db.execute(
            sa_update(Customer)
            .where(Customer.id == customer_id)
            .values(storage_used_bytes=Customer.storage_used_bytes + len(content))
        )
        await db.commit()
    except Exception as e:
        _log.warning("Storage-Zähler konnte nicht aktualisiert werden für Kunde %s: %s", customer_id, e)

    # S3: Binärdatei hochladen
    try:
        s3_key = s3_upload(
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
        # Upload-Fehler blockiert nicht — Dokument existiert mit extrahiertem Text

    # Qdrant: Vektoren speichern
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
            # Qdrant-Fehler dürfen den Upload nicht blockieren
            _log.error("Qdrant-Speicherung fehlgeschlagen für Dokument %s: %s", doc.id, e)

    return doc


# ─── Eigene Dokumente (auth) ──────────────────────────────────────────────────

@router.get("/mine", response_model=list[DocumentOut])
async def list_my_documents(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Gibt alle aktiven Dokumente des eingeloggten Kunden zurück."""
    result = await db.execute(
        select(CustomerDocument).where(
            CustomerDocument.customer_id == customer.id,
            CustomerDocument.is_active == True,
        ).order_by(CustomerDocument.created_at.desc())
    )
    return result.scalars().all()


@router.get("/mine/{doc_id}/content")
async def get_my_document_content(
    doc_id: uuid.UUID,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Gibt die Originaldatei als Binary zurück (für den File-Viewer)."""
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active or doc.customer_id != customer.id:
        raise not_found("Dokument")

    if doc.stored_in_s3 and doc.s3_key:
        try:
            file_bytes = s3_download(doc.s3_key)
        except Exception as e:
            _log.error("S3-Download fehlgeschlagen für Dokument %s: %s", doc_id, e)
            raise HTTPException(status_code=503, detail="Datei vorübergehend nicht verfügbar")
    elif doc.file_content:
        file_bytes = doc.file_content
    else:
        raise HTTPException(status_code=404, detail="Datei-Inhalt nicht gespeichert")

    return Response(
        content=file_bytes,
        media_type=doc.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{doc.original_filename}"'},
    )


@router.patch("/mine/{doc_id}/visibility")
async def set_document_visibility(
    doc_id: uuid.UUID,
    body: dict,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Setzt ob Baddi das Dokument lesen darf (baddi_readable)."""
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active or doc.customer_id != customer.id:
        raise not_found("Dokument")
    doc.baddi_readable = bool(body.get("baddi_readable", True))
    await db.commit()
    return {"id": str(doc_id), "baddi_readable": doc.baddi_readable}


class SaveImageRequest(BaseModel):
    url: str
    filename: str = "bild.png"


@router.post("/save_image", response_model=DocumentOut, status_code=201)
async def save_image_from_url(
    body: SaveImageRequest,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lädt ein Bild von einer URL herunter und speichert es als Dokument."""
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
        s3_key = s3_upload(
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


@router.delete("/mine/{doc_id}")
async def delete_my_document(
    doc_id: uuid.UUID,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Löscht ein Dokument des eingeloggten Kunden."""
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active or doc.customer_id != customer.id:
        raise not_found("Dokument")

    if doc.stored_in_qdrant and doc.qdrant_collection:
        delete_document_vectors(str(doc_id), doc.qdrant_collection)

    if doc.stored_in_s3 and doc.s3_key:
        try:
            s3_delete(doc.s3_key)
        except Exception as e:
            _log.warning("S3-Löschen fehlgeschlagen für Dokument %s: %s", doc_id, e)

    doc.is_active = False
    await db.commit()

    await db.execute(
        sa_update(Customer)
        .where(Customer.id == customer.id)
        .values(storage_used_bytes=Customer.storage_used_bytes - doc.file_size_bytes)
    )
    await db.commit()
    return {"status": "deleted", "id": str(doc_id)}


# ─── List Documents ───────────────────────────────────────────────────────────

@router.get("/customer/{customer_id}", response_model=list[DocumentOut])
async def list_customer_documents(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Gibt alle aktiven Dokumente eines Kunden zurück."""
    result = await db.execute(
        select(CustomerDocument).where(
            CustomerDocument.customer_id == customer_id,
            CustomerDocument.is_active == True,
        ).order_by(CustomerDocument.created_at.desc())
    )
    return result.scalars().all()


# ─── Get Single Document ──────────────────────────────────────────────────────

@router.get("/file/{doc_id}", response_model=DocumentWithText)
async def get_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Gibt ein einzelnes Dokument mit dem extrahierten Text zurück."""
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active:
        raise not_found("Dokument")
    return doc


# ─── Delete Document ──────────────────────────────────────────────────────────

@router.delete("/file/{doc_id}")
async def delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Soft-löscht ein Dokument und entfernt Qdrant-Vektoren und S3-Datei."""
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active:
        raise not_found("Dokument")

    if doc.stored_in_qdrant and doc.qdrant_collection:
        delete_document_vectors(str(doc_id), doc.qdrant_collection)

    if doc.stored_in_s3 and doc.s3_key:
        try:
            s3_delete(doc.s3_key)
        except Exception as e:
            _log.warning("S3-Löschen fehlgeschlagen für Dokument %s: %s", doc_id, e)

    doc.is_active = False
    await db.commit()

    # Storage-Zähler verringern
    await db.execute(
        sa_update(Customer)
        .where(Customer.id == doc.customer_id)
        .values(storage_used_bytes=Customer.storage_used_bytes - doc.file_size_bytes)
    )
    await db.commit()

    return {"status": "deleted", "id": str(doc_id)}


# ─── Semantic Search ──────────────────────────────────────────────────────────

@router.post("/search", response_model=list[SearchResult])
async def search_documents(request: SearchRequest):
    """
    Semantische Suche in den Kundendokumenten via Qdrant.
    Gibt die relevantesten Text-Chunks sortiert nach Score zurück.
    """
    results = search_customer_documents(
        customer_id=str(request.customer_id),
        query=request.query,
        top_k=request.top_k,
    )
    return results


# ─── Supported Types ─────────────────────────────────────────────────────────

@router.get("/supported-types")
async def get_supported_types():
    """Gibt alle unterstützten Datei-Typen zurück (für das Frontend)."""
    return {
        "extensions": sorted(SUPPORTED_EXTENSIONS),
        "max_size_mb": MAX_FILE_SIZE // 1024 // 1024,
        "description": {
            "pdf": "PDF-Dokumente",
            "docx": "Word-Dokumente",
            "doc": "Ältere Word-Dokumente",
            "xlsx": "Excel-Tabellen",
            "xls": "Ältere Excel-Tabellen",
            "pptx": "PowerPoint-Präsentationen",
            "ppt": "Ältere PowerPoint-Präsentationen",
            "csv": "CSV-Dateien",
            "txt": "Textdateien",
            "md": "Markdown",
            "json": "JSON-Dateien",
            "xml": "XML-Dateien",
            "html": "HTML-Dateien",
            "log": "Log-Dateien",
        }
    }
