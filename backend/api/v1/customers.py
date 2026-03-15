import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from models.customer import Customer

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
    is_active: bool

    class Config:
        from_attributes = True


@router.get("", response_model=list[CustomerOut])
async def list_customers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Customer).where(Customer.is_active == True))
    return result.scalars().all()


@router.post("", response_model=CustomerOut, status_code=201)
async def create_customer(data: CustomerCreate, db: AsyncSession = Depends(get_db)):
    customer = Customer(
        name=data.name,
        email=data.email,
        segment=data.segment,
        hashed_password=data.password,
    )
    db.add(customer)
    await db.commit()
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
