"""Window/Whiteboard-Boards API."""
import uuid
from datetime import datetime,timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from core.database import get_db
from core.dependencies import get_current_user
from models.window import WindowBoard

router = APIRouter(tags=["windows"])


# --- Schemas ---

class BoardCreate(BaseModel):
    name: str = "Neues Board"
    board_type: str = "whiteboard"


class BoardUpdate(BaseModel):
    name: str | None = None
    data: dict[str, Any] | None = None


class BoardResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID | None
    name: str
    board_type: str
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Endpoints ---

@router.get("/windows/boards", response_model=list[BoardResponse])
async def list_boards(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alle Boards des aktuellen Users."""
    result = await db.execute(
        select(WindowBoard)
        .where(WindowBoard.customer_id == current_user.id)
        .order_by(WindowBoard.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/windows/boards", response_model=BoardResponse, status_code=201)
async def create_board(
    body: BoardCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Neues Board erstellen."""
    board = WindowBoard(
        customer_id=current_user.id,
        name=body.name,
        board_type=body.board_type,
    )
    db.add(board)
    await db.commit()
    await db.refresh(board)
    return board


@router.get("/windows/boards/{board_id}", response_model=BoardResponse)
async def get_board(
    board_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Einzelnes Board laden (inkl. data)."""
    result = await db.execute(
        select(WindowBoard).where(
            WindowBoard.id == board_id,
            WindowBoard.customer_id == current_user.id,
        )
    )
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail="Board nicht gefunden")
    return board


@router.put("/windows/boards/{board_id}", response_model=BoardResponse)
async def update_board(
    board_id: uuid.UUID,
    body: BoardUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Board-Name und/oder Daten aktualisieren."""
    result = await db.execute(
        select(WindowBoard).where(
            WindowBoard.id == board_id,
            WindowBoard.customer_id == current_user.id,
        )
    )
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail="Board nicht gefunden")

    if body.name is not None:
        board.name = body.name
    if body.data is not None:
        board.data = body.data
        # flag_modified ist notwendig damit SQLAlchemy JSONB-Ersatz als dirty markiert
        flag_modified(board, "data")
    board.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.commit()
    await db.refresh(board)
    return board


@router.get("/windows/boards/singleton/{board_type}", response_model=BoardResponse)
async def get_or_create_singleton_board(
    board_type: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Gibt das einzige Board dieses Typs für den User zurück.
    Existiert noch keines, wird es atomar erstellt.
    Verhindert doppelte Boards und Data-Loss durch Netzwerkfehler.
    """
    result = await db.execute(
        select(WindowBoard)
        .where(
            WindowBoard.customer_id == current_user.id,
            WindowBoard.board_type == board_type,
        )
        .order_by(WindowBoard.updated_at.desc())
        .limit(1)
    )
    board = result.scalar_one_or_none()
    if board:
        return board

    board = WindowBoard(
        customer_id=current_user.id,
        name=board_type.capitalize(),
        board_type=board_type,
    )
    db.add(board)
    await db.commit()
    await db.refresh(board)
    return board


@router.delete("/windows/boards/{board_id}", status_code=204)
async def delete_board(
    board_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Board löschen."""
    result = await db.execute(
        select(WindowBoard).where(
            WindowBoard.id == board_id,
            WindowBoard.customer_id == current_user.id,
        )
    )
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail="Board nicht gefunden")

    await db.delete(board)
    await db.commit()
