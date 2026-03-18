import uuid
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from core.database import get_db
from core.dependencies import require_admin
from models.customer import Customer
from models.buddy import AiBuddy, ConversationThread, Message

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerCreate(BaseModel):
    name: str
    email: str
    segment: str = "personal"
    password: str = ""


class CustomerOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    segment: str
    role: str
    is_active: bool
    created_at: datetime
    birth_year: int | None = None
    birth_date: date | None = None
    primary_usecase_id: str | None = None   # usecase_id des ersten aktiven Buddys

    class Config:
        from_attributes = True


class CustomerUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    segment: str | None = None
    is_active: bool | None = None


class CustomerListResponse(BaseModel):
    items: list[CustomerOut]
    total: int
    page: int
    page_size: int


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    search: Optional[str] = Query(None, description="Suche in Name und E-Mail"),
    segment: Optional[str] = Query(None, description="Filter nach Segment: personal, elderly, corporate"),
    role: Optional[str] = Query(None, description="Filter nach Rolle: admin, customer"),
    is_active: Optional[bool] = Query(None, description="Filter nach aktivem Status"),
    page: int = Query(1, ge=1, description="Seitennummer"),
    page_size: int = Query(20, ge=1, le=100, description="Einträge pro Seite"),
    db: AsyncSession = Depends(get_db),
):
    """Gibt alle Kunden mit optionalen Filtern und Paginierung zurück."""
    query = select(Customer)

    # Suchfilter über Name und E-Mail
    if search:
        term = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(Customer.name).like(term),
                func.lower(Customer.email).like(term),
            )
        )

    # Segment-Filter
    if segment:
        query = query.where(Customer.segment == segment)

    # Rollen-Filter
    if role:
        query = query.where(Customer.role == role)

    # Aktiv-Filter
    if is_active is not None:
        query = query.where(Customer.is_active == is_active)

    # Gesamtanzahl für Paginierung
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Sortierung und Paginierung
    query = query.order_by(Customer.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    customers = result.scalars().all()

    # Primary BaddiD pro Kunde laden (erster aktiver Buddy mit Nummer)
    customer_ids = [c.id for c in customers]
    buddy_result = await db.execute(
        select(AiBuddy)
        .where(AiBuddy.customer_id.in_(customer_ids), AiBuddy.is_active == True)
        .order_by(AiBuddy.created_at)
    )
    buddies_by_customer: dict[uuid.UUID, str | None] = {}
    for buddy in buddy_result.scalars().all():
        if buddy.customer_id not in buddies_by_customer:
            buddies_by_customer[buddy.customer_id] = buddy.usecase_id

    items = [
        CustomerOut(
            id=c.id, name=c.name, email=c.email, segment=c.segment,
            role=c.role, is_active=c.is_active, created_at=c.created_at,
            primary_usecase_id=buddies_by_customer.get(c.id),
        )
        for c in customers
    ]

    return CustomerListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=CustomerOut, status_code=201)
async def create_customer(data: CustomerCreate, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.exc import IntegrityError
    customer = Customer(
        name=data.name,
        email=data.email,
        segment=data.segment,
        hashed_password=data.password,
    )
    db.add(customer)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")
    await db.refresh(customer)
    return customer


@router.get("/lookup", response_model=CustomerOut)
async def lookup_customer_by_email(email: str, db: AsyncSession = Depends(get_db)):
    """Findet einen Kunden anhand seiner E-Mail-Adresse (für SSE-Subscription)."""
    result = await db.execute(select(Customer).where(Customer.email == email))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(customer_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: uuid.UUID,
    data: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Aktualisiert Felder eines Kunden (Admin)."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(customer, field, value)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.get("/{customer_id}/stats")
async def get_customer_stats(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Token-Nutzung und Konversations-Statistiken eines Kunden."""


    buddy_result = await db.execute(
        select(AiBuddy.id).where(AiBuddy.customer_id == customer_id)
    )
    buddy_ids = [row[0] for row in buddy_result.all()]

    if not buddy_ids:
        return {"threads": 0, "messages": 0, "total_tokens": 0, "by_model": {}}

    thread_count = await db.scalar(
        select(func.count(ConversationThread.id))
        .where(ConversationThread.buddy_id.in_(buddy_ids))
    )

    rows = await db.execute(
        select(
            Message.model_used,
            func.count().label("n"),
            func.coalesce(func.sum(Message.tokens_used), 0).label("t"),
        )
        .join(ConversationThread, Message.thread_id == ConversationThread.id)
        .where(ConversationThread.buddy_id.in_(buddy_ids))
        .group_by(Message.model_used)
    )

    by_model: dict = {}
    total_tokens = 0
    total_messages = 0
    for model, n, t in rows.all():
        key = model or "unbekannt"
        by_model[key] = {"messages": n, "tokens": int(t)}
        total_tokens += int(t)
        total_messages += n

    return {
        "threads": thread_count or 0,
        "messages": total_messages,
        "total_tokens": total_tokens,
        "by_model": by_model,
    }


@router.patch("/{customer_id}/toggle-active", response_model=CustomerOut)
async def toggle_customer_active(customer_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Aktiviert oder deaktiviert einen Kunden."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer.is_active = not customer.is_active
    await db.commit()
    await db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=204)
async def delete_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Löscht einen Kunden permanent (nur Admin)."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Delete messages → threads → buddies first to satisfy FK constraints
    buddy_result = await db.execute(select(AiBuddy.id).where(AiBuddy.customer_id == customer_id))
    buddy_ids = [row[0] for row in buddy_result.all()]
    if buddy_ids:
        thread_result = await db.execute(
            select(ConversationThread.id).where(ConversationThread.buddy_id.in_(buddy_ids))
        )
        thread_ids = [row[0] for row in thread_result.all()]
        if thread_ids:
            await db.execute(
                Message.__table__.delete().where(Message.thread_id.in_(thread_ids))
            )
        await db.execute(
            ConversationThread.__table__.delete().where(ConversationThread.buddy_id.in_(buddy_ids))
        )
        await db.execute(
            AiBuddy.__table__.delete().where(AiBuddy.customer_id == customer_id)
        )

    await db.delete(customer)
    await db.commit()
    return Response(status_code=204)
