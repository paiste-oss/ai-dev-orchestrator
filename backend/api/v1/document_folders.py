"""
Document Folders API

GET    /v1/document-folders              → Alle Ordner des Kunden
POST   /v1/document-folders              → Ordner erstellen
PATCH  /v1/document-folders/{id}         → Umbenennen / Farbe ändern
DELETE /v1/document-folders/{id}         → Ordner löschen (Dateien bleiben)
PATCH  /v1/documents/mine/{id}/folder    → Datei in Ordner verschieben
POST   /v1/documents/save-from-chat      → Chat-Text als Dokument speichern
"""
import logging
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from core.exceptions import not_found
from models.customer import Customer
from models.document import CustomerDocument
from models.document_folder import DocumentFolder
from services.s3_storage import upload_file as s3_upload

_log = logging.getLogger(__name__)

router = APIRouter(tags=["document-folders"])

FOLDER_COLORS = {"indigo", "blue", "green", "amber", "red", "pink", "purple", "cyan", "gray"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class FolderOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    parent_id: uuid.UUID | None
    created_at: datetime
    document_count: int = 0

    class Config:
        from_attributes = True


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    color: str = "indigo"
    parent_id: uuid.UUID | None = None


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    color: str | None = None


class MoveToFolder(BaseModel):
    folder_id: uuid.UUID | None


class SaveFromChatRequest(BaseModel):
    content: str = Field(min_length=1)
    filename: str = Field(default="Chat-Notiz.md", max_length=256)
    folder_id: uuid.UUID | None = None


# ── Ordner CRUD ───────────────────────────────────────────────────────────────

@router.get("/document-folders", response_model=list[FolderOut])
async def list_folders(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DocumentFolder).where(
            DocumentFolder.customer_id == customer.id,
            DocumentFolder.is_active == True,
        ).order_by(DocumentFolder.created_at)
    )
    folders = result.scalars().all()

    # Anzahl Dokumente pro Ordner zählen
    counts: dict[uuid.UUID, int] = {}
    if folders:
        folder_ids = [f.id for f in folders]
        count_result = await db.execute(
            select(CustomerDocument.folder_id, CustomerDocument.id).where(
                CustomerDocument.customer_id == customer.id,
                CustomerDocument.folder_id.in_(folder_ids),
                CustomerDocument.is_active == True,
            )
        )
        for row in count_result:
            counts[row.folder_id] = counts.get(row.folder_id, 0) + 1

    return [
        FolderOut(
            id=f.id, name=f.name, color=f.color,
            parent_id=f.parent_id, created_at=f.created_at,
            document_count=counts.get(f.id, 0),
        )
        for f in folders
    ]


@router.post("/document-folders", response_model=FolderOut, status_code=201)
async def create_folder(
    body: FolderCreate,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.color not in FOLDER_COLORS:
        body.color = "indigo"

    if body.parent_id:
        parent = await db.get(DocumentFolder, body.parent_id)
        if not parent or parent.customer_id != customer.id or not parent.is_active:
            raise HTTPException(status_code=404, detail="Überordner nicht gefunden")

    folder = DocumentFolder(
        customer_id=customer.id,
        name=body.name,
        color=body.color,
        parent_id=body.parent_id,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderOut(id=folder.id, name=folder.name, color=folder.color,
                     parent_id=folder.parent_id, created_at=folder.created_at)


@router.patch("/document-folders/{folder_id}", response_model=FolderOut)
async def update_folder(
    folder_id: uuid.UUID,
    body: FolderUpdate,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = await db.get(DocumentFolder, folder_id)
    if not folder or folder.customer_id != customer.id or not folder.is_active:
        raise not_found("Ordner")
    if body.name is not None:
        folder.name = body.name
    if body.color is not None and body.color in FOLDER_COLORS:
        folder.color = body.color
    await db.commit()
    await db.refresh(folder)
    return FolderOut(id=folder.id, name=folder.name, color=folder.color,
                     parent_id=folder.parent_id, created_at=folder.created_at)


@router.delete("/document-folders/{folder_id}")
async def delete_folder(
    folder_id: uuid.UUID,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = await db.get(DocumentFolder, folder_id)
    if not folder or folder.customer_id != customer.id or not folder.is_active:
        raise not_found("Ordner")

    # Dateien aus dem Ordner in Root verschieben (nicht löschen)
    await db.execute(
        sa_update(CustomerDocument)
        .where(CustomerDocument.folder_id == folder_id)
        .values(folder_id=None)
    )
    folder.is_active = False
    await db.commit()
    return {"status": "deleted", "id": str(folder_id)}


# ── Datei verschieben ─────────────────────────────────────────────────────────

@router.patch("/documents/mine/{doc_id}/folder")
async def move_to_folder(
    doc_id: uuid.UUID,
    body: MoveToFolder,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(CustomerDocument, doc_id)
    if not doc or not doc.is_active or doc.customer_id != customer.id:
        raise not_found("Dokument")

    if body.folder_id is not None:
        folder = await db.get(DocumentFolder, body.folder_id)
        if not folder or folder.customer_id != customer.id or not folder.is_active:
            raise HTTPException(status_code=404, detail="Ordner nicht gefunden")

    doc.folder_id = body.folder_id
    await db.commit()
    return {"id": str(doc_id), "folder_id": str(body.folder_id) if body.folder_id else None}


# ── Chat → Dokument speichern ─────────────────────────────────────────────────

@router.post("/documents/save-from-chat", status_code=201)
async def save_from_chat(
    body: SaveFromChatRequest,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Speichert Chat-Text als Markdown-Datei in Dokumente."""
    filename = body.filename.strip()
    if not filename.endswith(".md"):
        filename += ".md"

    content_bytes = body.content.encode("utf-8")

    if body.folder_id:
        folder = await db.get(DocumentFolder, body.folder_id)
        if not folder or folder.customer_id != customer.id or not folder.is_active:
            raise HTTPException(status_code=404, detail="Ordner nicht gefunden")

    doc_id = uuid.uuid4()
    unique_filename = f"{customer.id}_{doc_id.hex[:8]}_{filename}"

    doc = CustomerDocument(
        id=doc_id,
        customer_id=customer.id,
        filename=unique_filename,
        original_filename=filename,
        file_type="md",
        file_size_bytes=len(content_bytes),
        mime_type="text/markdown",
        file_content=None,
        extracted_text=body.content,
        page_count=1,
        char_count=len(body.content),
        stored_in_postgres=True,
        stored_in_qdrant=False,
        stored_in_s3=False,
        folder_id=body.folder_id,
        doc_metadata={"source": "chat", "saved_at": datetime.utcnow().isoformat()},
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Storage-Zähler
    try:
        await db.execute(
            sa_update(Customer)
            .where(Customer.id == customer.id)
            .values(storage_used_bytes=Customer.storage_used_bytes + len(content_bytes))
        )
        await db.commit()
    except Exception as e:
        _log.warning("Storage-Zähler konnte nicht aktualisiert werden: %s", e)

    # S3 Upload
    try:
        s3_key = await s3_upload(
            customer_id=customer.id,
            doc_id=doc.id,
            filename=filename,
            content=content_bytes,
            content_type="text/markdown",
        )
        doc.s3_key = s3_key
        doc.stored_in_s3 = True
        await db.commit()
    except Exception as e:
        _log.error("S3-Upload fehlgeschlagen für Chat-Notiz %s: %s", doc.id, e)

    return {
        "id": str(doc.id),
        "filename": filename,
        "folder_id": str(body.folder_id) if body.folder_id else None,
    }
