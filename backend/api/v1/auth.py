from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.security import hash_password, verify_password, create_access_token
from core.dependencies import get_current_user
from models.customer import Customer

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    birth_year: int | None = None
    birth_date: date | None = None
    usecase_id: str | None = None   # wird beim Registrieren mitgeschickt → default Buddy
    tos_accepted: bool = False       # Pflicht: AGB & Datenschutz
    memory_consent: bool = True      # Optional: Langzeitgedächtnis


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str
    email: str


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Customer).where(Customer.email == data.email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="E-Mail oder Passwort falsch")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deaktiviert")

    token = create_access_token(subject=user.email, role=user.role)
    return TokenResponse(access_token=token, role=user.role, name=user.name, email=user.email)


@router.post("/register", status_code=201, response_model=TokenResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if not data.tos_accepted:
        raise HTTPException(status_code=422, detail="AGB und Datenschutzerklärung müssen akzeptiert werden.")

    existing = await db.execute(select(Customer).where(Customer.email == data.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="E-Mail bereits registriert")

    user = Customer(
        name=data.name,
        email=data.email.lower(),
        birth_year=data.birth_date.year if data.birth_date else data.birth_year,
        birth_date=data.birth_date,
        hashed_password=hash_password(data.password),
        role="customer",
        tos_accepted_at=datetime.utcnow(),
        memory_consent=data.memory_consent,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(subject=user.email, role=user.role)
    return TokenResponse(access_token=token, role=user.role, name=user.name, email=user.email)


@router.get("/me")
async def me(user: Customer = Depends(get_current_user)):
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "memory_consent": user.memory_consent,
    }
