import uuid
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.dependencies import require_admin
from models.customer import Customer
from .customers_schemas import NoteCreate

router = APIRouter()


@router.get("/{customer_id}/notes")
async def list_notes(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    from sqlalchemy import text as sql_text
    result = await db.execute(
        sql_text("SELECT id, text, created_at FROM customer_notes WHERE customer_id = :cid ORDER BY created_at DESC"),
        {"cid": str(customer_id)},
    )
    return [{"id": str(r.id), "text": r.text, "created_at": r.created_at.isoformat()} for r in result]


@router.post("/{customer_id}/notes", status_code=201)
async def create_note(
    customer_id: uuid.UUID,
    body: NoteCreate,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    from sqlalchemy import text as sql_text
    result = await db.execute(
        sql_text("INSERT INTO customer_notes (customer_id, text) VALUES (:cid, :text) RETURNING id, text, created_at"),
        {"cid": str(customer_id), "text": body.text.strip()},
    )
    await db.commit()
    r = result.one()
    return {"id": str(r.id), "text": r.text, "created_at": r.created_at.isoformat()}


@router.delete("/{customer_id}/notes/{note_id}", status_code=204)
async def delete_note(
    customer_id: uuid.UUID,
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    from sqlalchemy import text as sql_text
    await db.execute(
        sql_text("DELETE FROM customer_notes WHERE id = :nid AND customer_id = :cid"),
        {"nid": str(note_id), "cid": str(customer_id)},
    )
    await db.commit()
    return Response(status_code=204)
