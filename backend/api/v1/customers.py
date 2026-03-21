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
from models.credential import CustomerCredential
from models.document import CustomerDocument
from models.buddy_event import BuddyEvent
from models.chat import ChatMessage, MemoryItem

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
    primary_usecase_id: str | None = None

    # Kontakt
    phone: str | None = None
    phone_secondary: str | None = None

    # Adresse
    address_street: str | None = None
    address_zip: str | None = None
    address_city: str | None = None
    address_country: str | None = None

    # Beruf & Umfeld
    workplace: str | None = None
    job_title: str | None = None
    language: str | None = None
    notes: str | None = None
    interests: list | None = None
    memory_consent: bool = True

    class Config:
        from_attributes = True


class CustomerUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    segment: str | None = None
    is_active: bool | None = None

    # Kontakt
    phone: str | None = None
    phone_secondary: str | None = None

    # Adresse
    address_street: str | None = None
    address_zip: str | None = None
    address_city: str | None = None
    address_country: str | None = None

    # Beruf & Umfeld
    workplace: str | None = None
    job_title: str | None = None
    language: str | None = None
    notes: str | None = None
    interests: list | None = None
    memory_consent: bool | None = None


class CustomerListResponse(BaseModel):
    items: list[CustomerOut]
    total: int
    page: int
    page_size: int


# ─── Credential-Schemas (für den Kunden-Kontext) ──────────────────────────────

# Welche Services unterstützt werden und welche Felder sie brauchen
SERVICE_SCHEMAS: dict[str, dict] = {
    "smtp": {
        "label": "E-Mail (SMTP)",
        "icon": "📧",
        "fields": [
            {"key": "host",     "label": "SMTP-Server",    "placeholder": "smtp.gmail.com",    "type": "text"},
            {"key": "port",     "label": "Port",           "placeholder": "587",               "type": "number"},
            {"key": "username", "label": "Benutzername",   "placeholder": "deine@email.ch",    "type": "text"},
            {"key": "password", "label": "Passwort",       "placeholder": "",                  "type": "password"},
        ],
    },
    "google": {
        "label": "Google (OAuth)",
        "icon": "🔵",
        "fields": [
            {"key": "client_id",     "label": "Client ID",     "placeholder": "", "type": "text"},
            {"key": "client_secret", "label": "Client Secret", "placeholder": "", "type": "password"},
            {"key": "refresh_token", "label": "Refresh Token", "placeholder": "", "type": "password"},
        ],
    },
    "twitter_x": {
        "label": "X / Twitter",
        "icon": "🐦",
        "fields": [
            {"key": "api_key",         "label": "API Key",         "placeholder": "", "type": "text"},
            {"key": "api_secret",      "label": "API Secret",      "placeholder": "", "type": "password"},
            {"key": "access_token",    "label": "Access Token",    "placeholder": "", "type": "password"},
            {"key": "access_secret",   "label": "Access Secret",   "placeholder": "", "type": "password"},
        ],
    },
    "facebook": {
        "label": "Facebook / Meta",
        "icon": "👤",
        "fields": [
            {"key": "page_id",      "label": "Seiten-ID",     "placeholder": "", "type": "text"},
            {"key": "access_token", "label": "Access Token",  "placeholder": "", "type": "password"},
        ],
    },
    "whatsapp": {
        "label": "WhatsApp Business",
        "icon": "💬",
        "fields": [
            {"key": "phone_number_id", "label": "Telefonnummer-ID", "placeholder": "", "type": "text"},
            {"key": "access_token",    "label": "Access Token",     "placeholder": "", "type": "password"},
        ],
    },
    "slack": {
        "label": "Slack",
        "icon": "💼",
        "fields": [
            {"key": "webhook_url", "label": "Webhook URL", "placeholder": "https://hooks.slack.com/…", "type": "text"},
        ],
    },
    "twilio": {
        "label": "Twilio (SMS/Anrufe)",
        "icon": "📞",
        "fields": [
            {"key": "account_sid", "label": "Account SID", "placeholder": "", "type": "text"},
            {"key": "auth_token",  "label": "Auth Token",  "placeholder": "", "type": "password"},
            {"key": "from_number", "label": "Absender-Nr.", "placeholder": "+41…", "type": "text"},
        ],
    },
    "instagram": {
        "label": "Instagram",
        "icon": "📸",
        "fields": [
            {"key": "access_token", "label": "Access Token", "placeholder": "", "type": "password"},
            {"key": "account_id",   "label": "Konto-ID",     "placeholder": "", "type": "text"},
        ],
    },
}


# ─── Kunden-Liste ──────────────────────────────────────────────────────────────

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
    query = select(Customer)

    if search:
        term = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(Customer.name).like(term),
                func.lower(Customer.email).like(term),
            )
        )
    if segment:
        query = query.where(Customer.segment == segment)
    if role:
        query = query.where(Customer.role == role)
    if is_active is not None:
        query = query.where(Customer.is_active == is_active)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.order_by(Customer.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    customers = (await db.execute(query)).scalars().all()

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

    return CustomerListResponse(items=items, total=total, page=page, page_size=page_size)


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
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer.is_active = not customer.is_active
    await db.commit()
    await db.refresh(customer)
    return customer


# ─── Zugangsdaten (Credentials) pro Kunde ─────────────────────────────────────

@router.get("/{customer_id}/credentials")
async def list_customer_credentials(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Gibt zurück welche Services konfiguriert sind (nie Klartextdaten)."""
    result = await db.execute(
        select(CustomerCredential.service, CustomerCredential.updated_at)
        .where(CustomerCredential.customer_id == customer_id)
    )
    rows = result.all()
    configured = {row.service: str(row.updated_at) for row in rows}
    return {
        "customer_id": str(customer_id),
        "services": SERVICE_SCHEMAS,
        "configured": configured,
    }


class CredentialSave(BaseModel):
    data: dict


@router.put("/{customer_id}/credentials/{service}")
async def save_customer_credential(
    customer_id: uuid.UUID,
    service: str,
    body: CredentialSave,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    if service not in SERVICE_SCHEMAS:
        raise HTTPException(status_code=400, detail=f"Unbekannter Service: {service}")
    from services import credential_service
    await credential_service.save_credential(db, customer_id, service, body.data)
    return {"status": "saved", "service": service}


@router.delete("/{customer_id}/credentials/{service}", status_code=204)
async def delete_customer_credential(
    customer_id: uuid.UUID,
    service: str,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    result = await db.execute(
        select(CustomerCredential)
        .where(CustomerCredential.customer_id == customer_id, CustomerCredential.service == service)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential nicht gefunden")
    await db.delete(cred)
    await db.commit()
    return Response(status_code=204)


# ─── Kunden löschen ───────────────────────────────────────────────────────────

@router.delete("/{customer_id}", status_code=204)
async def delete_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    buddy_result = await db.execute(select(AiBuddy.id).where(AiBuddy.customer_id == customer_id))
    buddy_ids = [row[0] for row in buddy_result.all()]
    if buddy_ids:
        thread_result = await db.execute(
            select(ConversationThread.id).where(ConversationThread.buddy_id.in_(buddy_ids))
        )
        thread_ids = [row[0] for row in thread_result.all()]
        if thread_ids:
            await db.execute(Message.__table__.delete().where(Message.thread_id.in_(thread_ids)))
        await db.execute(ConversationThread.__table__.delete().where(ConversationThread.buddy_id.in_(buddy_ids)))
        await db.execute(AiBuddy.__table__.delete().where(AiBuddy.customer_id == customer_id))

    await db.execute(CustomerCredential.__table__.delete().where(CustomerCredential.customer_id == customer_id))
    await db.execute(CustomerDocument.__table__.delete().where(CustomerDocument.customer_id == customer_id))
    await db.execute(BuddyEvent.__table__.delete().where(BuddyEvent.customer_id == customer_id))
    await db.execute(ChatMessage.__table__.delete().where(ChatMessage.customer_id == customer_id))
    await db.execute(MemoryItem.__table__.delete().where(MemoryItem.customer_id == customer_id))

    await db.delete(customer)
    await db.commit()
    return Response(status_code=204)
