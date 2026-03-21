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
from models.buddy_tool import BuddyTool
from models.customer import Customer
from models.chat import ChatMessage

router = APIRouter(prefix="/buddies", tags=["buddies"])


class BuddyCreate(BaseModel):
    customer_id: uuid.UUID
    usecase_id: Optional[str] = None
    name: str
    segment: str = "personal"
    persona_config: dict = {}


class BuddyAdminOut(BaseModel):
    """Erweitertes Buddy-Modell mit Kunden-Info für Admin-Liste."""
    id: uuid.UUID
    name: str
    customer_id: uuid.UUID
    customer_name: str
    customer_email: str
    usecase_id: Optional[str] = None
    segment: str
    is_active: bool
    avatar_url: Optional[str] = None
    created_at: datetime
    last_message_at: Optional[datetime] = None
    message_count: int = 0

    class Config:
        from_attributes = True


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


class AvatarUpdate(BaseModel):
    avatar_url: str | None = None


class ChatRequest(BaseModel):
    message: str
    model: str = "auto"


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


@router.get("/admin/list", response_model=list[BuddyAdminOut])
async def admin_list_buddies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query("", alias="q"),
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Admin: Alle Baddis mit Kunden-Info — wie die Kunden-Liste."""
    offset = (page - 1) * page_size

    # Alle aktiven Baddis mit zugehörigen Kunden laden
    q = (
        select(AiBuddy, Customer)
        .join(Customer, AiBuddy.customer_id == Customer.id)
        .where(AiBuddy.is_active == True)
    )
    if search:
        q = q.where(
            Customer.name.ilike(f"%{search}%") |
            Customer.email.ilike(f"%{search}%") |
            AiBuddy.name.ilike(f"%{search}%")
        )

    q = q.order_by(AiBuddy.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(q)
    rows = result.all()

    out = []
    for buddy, customer in rows:
        # Letzte Nachricht + Anzahl Nachrichten
        last_msg_result = await db.execute(
            select(ChatMessage.created_at)
            .where(ChatMessage.buddy_id == str(buddy.id))
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        last_msg_at = last_msg_result.scalar_one_or_none()

        count_result = await db.execute(
            select(func.count()).select_from(ChatMessage)
            .where(ChatMessage.buddy_id == str(buddy.id))
        )
        msg_count = count_result.scalar() or 0

        out.append(BuddyAdminOut(
            id=buddy.id,
            name=buddy.name,
            customer_id=customer.id,
            customer_name=customer.name,
            customer_email=customer.email,
            usecase_id=buddy.usecase_id,
            segment=buddy.segment,
            is_active=buddy.is_active,
            avatar_url=buddy.avatar_url,
            created_at=buddy.created_at,
            last_message_at=last_msg_at,
            message_count=msg_count,
        ))
    return out


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


@router.patch("/{buddy_id}/avatar", response_model=BuddyOut)
async def update_buddy_avatar(
    buddy_id: uuid.UUID,
    data: AvatarUpdate,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Setzt oder entfernt die Ready Player Me Avatar-URL eines Buddys."""
    buddy = await db.get(AiBuddy, buddy_id)
    if not buddy:
        raise HTTPException(status_code=404, detail="Buddy not found")
    buddy.avatar_url = data.avatar_url
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

    persona = buddy.persona_config
    system_prompt = persona.get("system_prompt_template", "Du bist {name}, ein freundlicher KI-Begleiter.").replace("{name}", buddy.name)

    # Zugewiesene Tools laden
    tools_result = await db.execute(
        select(BuddyTool).where(BuddyTool.buddy_id == buddy_id, BuddyTool.is_active == True)
    )
    active_tools = tools_result.scalars().all()
    tool_keys = [t.tool_key for t in active_tools]

    try:
        if tool_keys:
            # Tool-fähiger Agent (Anthropic Claude mit Tool Use)
            from services.buddy_agent import run_buddy_chat
            result = await run_buddy_chat(
                message=request.message,
                buddy_name=buddy.name,
                system_prompt=system_prompt,
                tool_keys=tool_keys,
                model=persona.get("fallback_model", "claude-sonnet-4-6"),
            )
            return {
                "status": "success",
                "output": result["output"],
                "model_used": result["model_used"],
                "buddy": buddy.name,
                "tools_used": result["tool_calls"],
            }
        else:
            # Kein Tool → Ollama direkt
            import httpx
            from core.config import settings as app_settings
            model = request.model if request.model != "auto" else persona.get("preferred_model", app_settings.ollama_chat_model)
            resp = httpx.post(
                f"{app_settings.ollama_base_url}/api/chat",
                json={"model": model, "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": request.message},
                ], "stream": False},
                timeout=60.0,
            )
            output = resp.json().get("message", {}).get("content", "")
            return {"status": "success", "output": output, "model_used": model, "buddy": buddy.name, "tools_used": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
