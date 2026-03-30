"""
Diktate — API für Sprachaufnahmen + Transkripte.
Speichert Audio und Text in customer_documents (file_type="audio", is_dictation=true).
"""
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from models.document import CustomerDocument

router = APIRouter(prefix="/dictations", tags=["dictations"])


@router.post("/", status_code=201)
async def save_dictation(
    audio: UploadFile = File(...),
    transcript: str = Form(...),
    title: str = Form("Diktat"),
    duration_seconds: float = Form(0),
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Speichert ein Diktat (Audio + Transkript)."""
    audio_bytes = await audio.read()
    ext = audio.filename.rsplit(".", 1)[-1] if audio.filename and "." in audio.filename else "webm"

    doc = CustomerDocument(
        customer_id=customer.id,
        filename=f"diktat_{uuid.uuid4().hex[:8]}.{ext}",
        original_filename=f"{title}.{ext}",
        file_type=ext,
        file_size_bytes=len(audio_bytes),
        mime_type=audio.content_type or "audio/webm",
        file_content=audio_bytes,
        extracted_text=transcript,
        stored_in_postgres=True,
        doc_metadata={
            "is_dictation": True,
            "duration_seconds": duration_seconds,
            "title": title,
        },
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {
        "id": str(doc.id),
        "title": title,
        "transcript": transcript,
        "duration_seconds": duration_seconds,
        "created_at": doc.created_at.isoformat(),
    }


@router.get("/mine")
async def list_my_dictations(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CustomerDocument)
        .where(
            CustomerDocument.customer_id == customer.id,
            CustomerDocument.is_active.is_(True),
            CustomerDocument.doc_metadata["is_dictation"].as_boolean() == True,
        )
        .order_by(CustomerDocument.created_at.desc())
        .limit(100)
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "title": (d.doc_metadata or {}).get("title") or d.original_filename,
            "transcript": d.extracted_text or "",
            "duration_seconds": (d.doc_metadata or {}).get("duration_seconds", 0),
            "file_size_bytes": d.file_size_bytes,
            "mime_type": d.mime_type,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


@router.get("/{dictation_id}/audio")
async def get_dictation_audio(
    dictation_id: uuid.UUID,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(CustomerDocument, dictation_id)
    if not doc or doc.customer_id != customer.id or not doc.is_active:
        raise HTTPException(status_code=404, detail="Diktat nicht gefunden")
    if not doc.file_content:
        raise HTTPException(status_code=404, detail="Audio nicht gespeichert")
    return Response(
        content=doc.file_content,
        media_type=doc.mime_type or "audio/webm",
        headers={"Content-Disposition": f'inline; filename="{doc.filename}"'},
    )


@router.delete("/{dictation_id}")
async def delete_dictation(
    dictation_id: uuid.UUID,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(CustomerDocument, dictation_id)
    if not doc or doc.customer_id != customer.id or not doc.is_active:
        raise HTTPException(status_code=404, detail="Diktat nicht gefunden")
    doc.is_active = False
    await db.commit()
    return {"status": "deleted", "id": str(dictation_id)}
