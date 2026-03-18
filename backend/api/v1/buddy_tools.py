"""
Buddy-Tool-Zuweisung — Welcher Buddy hat welche Tools?

Routen:
  GET  /v1/buddies/{buddy_id}/tools          → Liste der zugewiesenen Tools
  POST /v1/buddies/{buddy_id}/tools          → Tool zuweisen
  DELETE /v1/buddies/{buddy_id}/tools/{key}  → Tool entfernen
  GET  /v1/tools                             → Alle verfügbaren Tools (Katalog)
"""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.dependencies import require_admin
from models.buddy import AiBuddy
from models.buddy_tool import BuddyTool
from models.customer import Customer
from services.tool_registry import TOOL_CATALOG, list_tools

router = APIRouter(tags=["buddy-tools"])


class ToolAssignRequest(BaseModel):
    tool_key: str
    config: dict = {}


class ToolAssignOut(BaseModel):
    id: uuid.UUID
    buddy_id: uuid.UUID
    tool_key: str
    tool_name: str
    tool_description: str
    tool_category: str
    config: dict
    is_active: bool

    class Config:
        from_attributes = True


def _enrich(bt: BuddyTool) -> dict:
    catalog = TOOL_CATALOG.get(bt.tool_key, {})
    return {
        "id": bt.id,
        "buddy_id": bt.buddy_id,
        "tool_key": bt.tool_key,
        "tool_name": catalog.get("name", bt.tool_key),
        "tool_description": catalog.get("description", ""),
        "tool_category": catalog.get("category", ""),
        "config": bt.config or {},
        "is_active": bt.is_active,
    }


@router.get("/tools")
async def available_tools():
    """Alle im System verfügbaren Tools (Katalog)."""
    return list_tools()


@router.get("/buddies/{buddy_id}/tools")
async def list_buddy_tools(buddy_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Alle einem Buddy zugewiesenen Tools."""
    buddy = await db.get(AiBuddy, buddy_id)
    if not buddy:
        raise HTTPException(status_code=404, detail="Buddy not found")

    result = await db.execute(
        select(BuddyTool).where(BuddyTool.buddy_id == buddy_id, BuddyTool.is_active == True)
    )
    tools = result.scalars().all()
    return [_enrich(t) for t in tools]


@router.post("/buddies/{buddy_id}/tools", status_code=201)
async def assign_tool(
    buddy_id: uuid.UUID,
    data: ToolAssignRequest,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Tool einem Buddy zuweisen (Admin)."""
    buddy = await db.get(AiBuddy, buddy_id)
    if not buddy:
        raise HTTPException(status_code=404, detail="Buddy not found")

    if data.tool_key not in TOOL_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unbekanntes Tool: '{data.tool_key}'")

    # Duplikat prüfen
    existing = await db.execute(
        select(BuddyTool).where(
            BuddyTool.buddy_id == buddy_id,
            BuddyTool.tool_key == data.tool_key,
        )
    )
    bt = existing.scalar_one_or_none()
    if bt:
        # Re-aktivieren falls vorher deaktiviert
        bt.is_active = True
        bt.config = data.config
        await db.commit()
        await db.refresh(bt)
        return _enrich(bt)

    bt = BuddyTool(
        buddy_id=buddy_id,
        tool_key=data.tool_key,
        config=data.config,
    )
    db.add(bt)
    await db.commit()
    await db.refresh(bt)
    return _enrich(bt)


@router.delete("/buddies/{buddy_id}/tools/{tool_key}", status_code=204)
async def remove_tool(
    buddy_id: uuid.UUID,
    tool_key: str,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Tool von einem Buddy entfernen (Admin)."""
    result = await db.execute(
        select(BuddyTool).where(
            BuddyTool.buddy_id == buddy_id,
            BuddyTool.tool_key == tool_key,
        )
    )
    bt = result.scalar_one_or_none()
    if not bt:
        raise HTTPException(status_code=404, detail="Tool-Zuweisung nicht gefunden")
    bt.is_active = False
    await db.commit()
