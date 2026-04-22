"""
Document Management API
GET    /v1/documents/mine                    → eigene Dokumente
GET    /v1/documents/mine/{doc_id}/content   → Datei-Download
PATCH  /v1/documents/mine/{doc_id}/visibility → Baddi-Lesbarkeit
DELETE /v1/documents/mine/{doc_id}           → Dokument löschen
GET    /v1/documents/customer/{customer_id}  → Alle Dokumente eines Kunden (Admin)
GET    /v1/documents/file/{doc_id}           → Einzeldokument mit Text
DELETE /v1/documents/file/{doc_id}           → Admin-Löschen
POST   /v1/documents/search                  → Semantische Suche
GET    /v1/documents/supported-types         → Erlaubte Dateitypen

Upload-Endpunkte → documents_upload.py
"""
from __future__ import annotations
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from core.exceptions import not_found
from models.customer import Customer
from models.document import CustomerDocument
from services.file_parser import SUPPORTED_EXTENSIONS
from services.s3_storage import delete_file as s3_delete, download_file as s3_download
from services.vector_store import delete_document_vectors, search_customer_documents
from api.v1.documents_upload import (  # noqa: F401 — re-export schemas
    router as upload_router,
    DocumentOut,
    DocumentWithText,
    SearchRequest,
    SearchResult,
    MAX_FILE_SIZE,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])
router.include_router(upload_router)


# ─── Eigene Dokumente (auth) ──────────────────────────────────────────────────

@router.get("/mine", response_model=list[DocumentOut])
async def list_my_documents(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active or doc.customer_id != customer.id:
        raise not_found("Dokument")

    if doc.stored_in_s3 and doc.s3_key:
        try:
            file_bytes = await s3_download(doc.s3_key)
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
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active or doc.customer_id != customer.id:
        raise not_found("Dokument")
    doc.baddi_readable = bool(body.get("baddi_readable", True))
    await db.commit()
    return {"id": str(doc_id), "baddi_readable": doc.baddi_readable}


@router.delete("/mine/{doc_id}")
async def delete_my_document(
    doc_id: uuid.UUID,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active or doc.customer_id != customer.id:
        raise not_found("Dokument")

    if doc.stored_in_qdrant and doc.qdrant_collection:
        delete_document_vectors(str(doc_id), doc.qdrant_collection)

    if doc.stored_in_s3 and doc.s3_key:
        try:
            await s3_delete(doc.s3_key)
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


# ─── Admin / List ─────────────────────────────────────────────────────────────

@router.get("/customer/{customer_id}", response_model=list[DocumentOut])
async def list_customer_documents(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CustomerDocument).where(
            CustomerDocument.customer_id == customer_id,
            CustomerDocument.is_active == True,
        ).order_by(CustomerDocument.created_at.desc())
    )
    return result.scalars().all()


@router.get("/file/{doc_id}", response_model=DocumentWithText)
async def get_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active:
        raise not_found("Dokument")
    return doc


@router.delete("/file/{doc_id}")
async def delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active:
        raise not_found("Dokument")

    if doc.stored_in_qdrant and doc.qdrant_collection:
        delete_document_vectors(str(doc_id), doc.qdrant_collection)

    if doc.stored_in_s3 and doc.s3_key:
        try:
            await s3_delete(doc.s3_key)
        except Exception as e:
            _log.warning("S3-Löschen fehlgeschlagen für Dokument %s: %s", doc_id, e)

    doc.is_active = False
    await db.commit()

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
    results = search_customer_documents(
        customer_id=str(request.customer_id),
        query=request.query,
        top_k=request.top_k,
    )
    return results


# ─── Supported Types ─────────────────────────────────────────────────────────

@router.get("/supported-types")
async def get_supported_types():
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
