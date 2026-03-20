from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.security import hash_password, verify_password, create_access_token
from core.dependencies import get_current_user
from models.customer import Customer
from models.buddy import AiBuddy

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    segment: str = "personal"
    birth_year: int | None = None
    birth_date: date | None = None
    usecase_id: str | None = None   # wird beim Registrieren mitgeschickt → default Buddy


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
    existing = await db.execute(select(Customer).where(Customer.email == data.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="E-Mail bereits registriert")

    user = Customer(
        name=data.name,
        email=data.email.lower(),
        segment=data.segment,
        birth_year=data.birth_date.year if data.birth_date else data.birth_year,
        birth_date=data.birth_date,
        hashed_password=hash_password(data.password),
        role="customer",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Persönlichen Baddi immer automatisch erstellen (1:1 mit Kunde)
    first_name = data.name.split()[0] if data.name else "Dein"
    default_buddy = AiBuddy(
        customer_id=user.id,
        usecase_id=data.usecase_id,   # optional, für Admin-Info
        name=f"{first_name}s Baddi",
        segment=data.segment,
        qdrant_collection=f"buddy_{str(user.id)[:8]}",
        persona_config={
            "tone": "warm",
            "language": "de",
            "preferred_model": "claude-haiku-4-5-20251001",
            "fallback_model": "gemini-2.5-flash",
            "system_prompt_template": (
                f"Du bist der persönliche KI-Begleiter von {data.name}. "
                "Du kennst diese Person und ihre Bedürfnisse. "
                "Du bist direkt, ehrlich, praktisch und empathisch. "
                "Du hilfst bei allem — von Alltag bis komplexen Aufgaben. "
                "Antworte auf Deutsch, ausser die Person schreibt in einer anderen Sprache."
            ),
            "capabilities": ["conversation"],
            "agents": [],
        },
    )
    db.add(default_buddy)
    await db.commit()

    token = create_access_token(subject=user.email, role=user.role)
    return TokenResponse(access_token=token, role=user.role, name=user.name, email=user.email)


@router.get("/me")
async def me(user: Customer = Depends(get_current_user)):
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "segment": user.segment,
    }
