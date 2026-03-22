import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from core.database import get_db
from core.dependencies import require_admin, get_current_user
from models.buddy import AiBuddy
from models.customer import Customer

router = APIRouter(prefix="/buddies", tags=["buddies"])


class BuddyCreate(BaseModel):
    customer_id: uuid.UUID
    usecase_id: Optional[str] = None
    name: str
    segment: str = "personal"
    persona_config: dict = {}



class BuddyOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    usecase_id: str | None
    name: str
    segment: str
    persona_config: dict
    is_active: bool
    avatar_url: str | None = None

    class Config:
        from_attributes = True



@router.get("/me", response_model=list[BuddyOut])
async def my_buddies(
    current_user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alle Baddis des eingeloggten Users."""
    result = await db.execute(
        select(AiBuddy).where(AiBuddy.customer_id == current_user.id, AiBuddy.is_active == True)
    )
    return result.scalars().all()


@router.get("", response_model=list[BuddyOut])
async def list_buddies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AiBuddy).where(AiBuddy.is_active == True))
    return result.scalars().all()



@router.get("/customer/{customer_id}", response_model=list[BuddyOut])
async def list_customer_buddies(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Alle Baddis eines bestimmten Kunden."""
    result = await db.execute(
        select(AiBuddy).where(AiBuddy.customer_id == customer_id, AiBuddy.is_active == True)
    )
    return result.scalars().all()


@router.post("", response_model=BuddyOut, status_code=201)
async def create_buddy(data: BuddyCreate, db: AsyncSession = Depends(get_db)):
    default_config = {
        "tone": "warm",
        "language": "de",
        "preferred_model": "mistral",
        "fallback_model": "claude-sonnet-4-6",
        "system_prompt_template": f"Du bist {data.name}, ein freundlicher KI-Begleiter.",
        "capabilities": ["conversation"],
    }
    default_config.update(data.persona_config)

    buddy = AiBuddy(
        customer_id=data.customer_id,
        usecase_id=data.usecase_id,
        name=data.name,
        segment=data.segment,
        persona_config=default_config,
        qdrant_collection=f"buddy_{str(uuid.uuid4())[:8]}",
    )
    db.add(buddy)
    await db.commit()
    await db.refresh(buddy)
    return buddy


@router.delete("/{buddy_id}", status_code=204)
async def remove_buddy(
    buddy_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Entfernt einen Buddy von einem Kunden (soft-delete)."""
    buddy = await db.get(AiBuddy, buddy_id)
    if not buddy:
        raise HTTPException(status_code=404, detail="Buddy not found")
    buddy.is_active = False
    await db.commit()



@router.get("/{buddy_id}", response_model=BuddyOut)
async def get_buddy(buddy_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    buddy = await db.get(AiBuddy, buddy_id)
    if not buddy:
        raise HTTPException(status_code=404, detail="Buddy not found")
    return buddy


