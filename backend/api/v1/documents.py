"""
Document Upload & Management API
POST /v1/documents/upload      → Datei hochladen + parsen + speichern
GET  /v1/documents/{customer_id}  → Alle Dokumente eines Kunden
GET  /v1/documents/file/{doc_id}  → Einzelnes Dokument
DELETE /v1/documents/file/{doc_id} → Dokument löschen
POST /v1/documents/search          → Semantische Suche in Kundendokumenten
"""
import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from models.document import CustomerDocument
from services.file_parser import parse_file, is_supported, get_file_extension, SUPPORTED_EXTENSIONS
from services.vector_store import store_document_vectors, search_customer_documents, delete_document_vectors

router = APIRouter(prefix="/documents", tags=["documents"])

# Maximale Dateigröße: 50 MB
MAX_FILE_SIZE = 50 * 1024 * 1024


# ─── Response Schemas ────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
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
    qdrant_collection: str | None
    created_at: datetime
    doc_metadata: dict | None

    class Config:
        from_attributes = True


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
        raise HTTPException(
            status_code=413,
            detail=f"Datei zu groß. Maximum: {MAX_FILE_SIZE // 1024 // 1024} MB"
        )

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
    parse_result = parse_file(content, filename, mime_type)

    # Eindeutiger Dateiname für interne Referenz
    unique_filename = f"{customer_id}_{uuid.uuid4().hex[:8]}_{filename}"

    # PostgreSQL: Dokument-Record erstellen
    doc = CustomerDocument(
        customer_id=customer_id,
        filename=unique_filename,
        original_filename=filename,
        file_type=ext or "unknown",
        file_size_bytes=len(content),
        mime_type=mime_type,
        extracted_text=parse_result.text if store_postgres else None,
        page_count=parse_result.page_count,
        char_count=len(parse_result.text),
        stored_in_postgres=store_postgres,
        stored_in_qdrant=False,  # wird nach Qdrant-Speicherung aktualisiert
        doc_metadata=parse_result.metadata,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

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
            print(f"[Documents] Qdrant-Speicherung fehlgeschlagen: {e}")

    return doc


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
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    return doc


# ─── Delete Document ──────────────────────────────────────────────────────────

@router.delete("/file/{doc_id}")
async def delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Soft-löscht ein Dokument und entfernt Qdrant-Vektoren."""
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    # Qdrant-Vektoren löschen
    if doc.stored_in_qdrant and doc.qdrant_collection:
        delete_document_vectors(str(doc_id), doc.qdrant_collection)

    # Soft-Delete
    doc.is_active = False
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
