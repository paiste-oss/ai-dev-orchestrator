import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, delete as sa_delete
from core.pagination import paginate, PageParams
from core.database import get_db
from core.dependencies import require_admin, get_current_user
from core.security import hash_password
from models.customer import Customer, SubscriptionPlan
from models.credential import CustomerCredential
from models.document import CustomerDocument
from models.buddy_event import BuddyEvent
from models.chat import ChatMessage, MemoryItem
from .customers_schemas import (
    CustomerCreate, CustomerOut, CustomerUpdate, SelfUpdateRequest,
    CustomerListResponse,
)

router = APIRouter()


# ─── Kunden-Liste ──────────────────────────────────────────────────────────────

@router.get("/", response_model=CustomerListResponse)
async def list_customers(
    search: Optional[str] = Query(None, description="Suche in Name und E-Mail"),
    role: Optional[str] = Query(None, description="Filter nach Rolle: admin, customer"),
    is_active: Optional[bool] = Query(None, description="Filter nach aktivem Status"),
    p: PageParams = Depends(),
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
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
    if role:
        query = query.where(Customer.role == role)
    if is_active is not None:
        query = query.where(Customer.is_active == is_active)

    query = query.order_by(Customer.created_at.desc())
    customers, total = await paginate(db, query, p)
    page, page_size = p.page, p.page_size

    # Abo-Pläne laden
    plan_ids = {c.subscription_plan_id for c in customers if c.subscription_plan_id}
    plans_by_id: dict[uuid.UUID, str] = {}
    if plan_ids:
        plan_result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id.in_(plan_ids)))
        for p in plan_result.scalars().all():
            plans_by_id[p.id] = p.name

    items = [
        CustomerOut(
            id=c.id, name=c.name, email=c.email,
            role=c.role, is_active=c.is_active, created_at=c.created_at,
            subscription_plan_name=plans_by_id.get(c.subscription_plan_id) if c.subscription_plan_id else None,
            subscription_status=c.subscription_status,
        )
        for c in customers
    ]

    return CustomerListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/", response_model=CustomerOut, status_code=201)
async def create_customer(data: CustomerCreate, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
    from sqlalchemy.exc import IntegrityError
    from services.email_service import provision_baddi_email
    from services.calendar_service import provision_caldav_account, generate_caldav_password

    first = (data.name or "").split()[0] or "user"
    customer = Customer(
        name=data.name,
        email=data.email.lower(),
        hashed_password=hash_password(data.password) if data.password else "",
        baddi_email=provision_baddi_email(first),
    )
    db.add(customer)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")
    await db.refresh(customer)

    try:
        caldav_user = customer.baddi_email.split("@")[0]
        caldav_pass = generate_caldav_password()
        provision_caldav_account(caldav_user, caldav_pass)
        customer.caldav_username = caldav_user
        customer.caldav_password = caldav_pass
        await db.commit()
    except Exception:
        pass

    return customer


@router.get("/lookup", response_model=CustomerOut)
async def lookup_customer_by_email(email: str, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
    result = await db.execute(select(Customer).where(Customer.email == email.lower()))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(customer_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.patch("/me", response_model=CustomerOut)
async def update_self(
    data: SelfUpdateRequest,
    current_user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Eingeloggter Kunde aktualisiert sein eigenes Profil."""
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: uuid.UUID,
    data: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    # Admin darf jeden Kunden bearbeiten; Kunde darf nur sich selbst
    if current_user.role != "admin" and str(current_user.id) != str(customer_id):
        raise HTTPException(status_code=403, detail="Nicht erlaubt")
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(customer, field, value)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.patch("/{customer_id}/toggle-active", response_model=CustomerOut)
async def toggle_customer_active(customer_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer.is_active = not customer.is_active
    await db.commit()
    await db.refresh(customer)
    return customer


async def _do_revoke_memory(customer: Customer, db: AsyncSession):
    try:
        from services.memory_vector_store import delete_customer_memories
        delete_customer_memories(str(customer.id))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Qdrant delete failed: %s", e)
    await db.execute(sa_delete(MemoryItem).where(MemoryItem.customer_id == str(customer.id)))
    customer.memory_consent = False
    await db.commit()
    await db.refresh(customer)
    return customer


@router.delete("/me/memory-consent", response_model=CustomerOut)
async def revoke_my_memory_consent(
    current_user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Eingeloggter Kunde widerruft eigenen Memory-Consent."""
    return await _do_revoke_memory(current_user, db)


@router.delete("/{customer_id}/memory-consent", response_model=CustomerOut)
async def revoke_memory_consent(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Admin: widerruft Memory-Consent eines Kunden."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    return await _do_revoke_memory(customer, db)


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

    await db.execute(CustomerCredential.__table__.delete().where(CustomerCredential.customer_id == customer_id))
    await db.execute(CustomerDocument.__table__.delete().where(CustomerDocument.customer_id == customer_id))
    await db.execute(BuddyEvent.__table__.delete().where(BuddyEvent.customer_id == customer_id))
    await db.execute(ChatMessage.__table__.delete().where(ChatMessage.customer_id == customer_id))
    await db.execute(MemoryItem.__table__.delete().where(MemoryItem.customer_id == customer_id))

    await db.delete(customer)
    await db.commit()


# ─── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard/stats")
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    from datetime import datetime, timedelta,timezone
    online_threshold = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=15)

    total_result = await db.execute(select(func.count()).select_from(Customer).where(Customer.role == "customer"))
    total = total_result.scalar() or 0

    online_result = await db.execute(
        select(func.count()).select_from(Customer)
        .where(Customer.role == "customer", Customer.last_seen >= online_threshold)
    )
    online = online_result.scalar() or 0

    recent_result = await db.execute(
        select(Customer).where(Customer.role == "customer")
        .order_by(Customer.created_at.desc()).limit(8)
    )
    recent = recent_result.scalars().all()

    return {
        "total_customers": total,
        "online_now": online,
        "recent": [
            {
                "id": str(c.id),
                "name": c.name,
                "email": c.email,
                "created_at": c.created_at.isoformat(),
                "last_seen": c.last_seen.isoformat() if c.last_seen else None,
                "subscription_status": c.subscription_status,
            }
            for c in recent
        ],
    }
