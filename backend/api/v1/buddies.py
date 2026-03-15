import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from models.buddy import AiBuddy

router = APIRouter(prefix="/buddies", tags=["buddies"])


class BuddyCreate(BaseModel):
    customer_id: uuid.UUID
    name: str
    segment: str = "personal"
    persona_config: dict = {}


class BuddyOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    name: str
    segment: str
    persona_config: dict
    is_active: bool

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str
    model: str = "auto"


@router.get("", response_model=list[BuddyOut])
async def list_buddies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AiBuddy).where(AiBuddy.is_active == True))
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
        name=data.name,
        segment=data.segment,
        persona_config=default_config,
        qdrant_collection=f"buddy_{str(uuid.uuid4())[:8]}",
    )
    db.add(buddy)
    await db.commit()
    await db.refresh(buddy)
    return buddy


@router.get("/{buddy_id}", response_model=BuddyOut)
async def get_buddy(buddy_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    buddy = await db.get(AiBuddy, buddy_id)
    if not buddy:
        raise HTTPException(status_code=404, detail="Buddy not found")
    return buddy


@router.post("/{buddy_id}/chat")
async def chat_with_buddy(buddy_id: uuid.UUID, request: ChatRequest, db: AsyncSession = Depends(get_db)):
    buddy = await db.get(AiBuddy, buddy_id)
    if not buddy:
        raise HTTPException(status_code=404, detail="Buddy not found")

    from router import route_prompt
    persona = buddy.persona_config
    model = request.model if request.model != "auto" else persona.get("preferred_model", "mistral")
    system_prompt = persona.get("system_prompt_template", "").replace("{name}", buddy.name)

    try:
        output, model_used = route_prompt(
            request.message,
            forced_model=model,
            system_prompt_override=system_prompt,
        )
        return {"status": "success", "output": output, "model_used": model_used, "buddy": buddy.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
