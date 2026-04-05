from datetime import date, datetime,timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from pydantic import BaseModel, EmailStr, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.security import hash_password, verify_password, create_access_token, create_temp_token, decode_temp_token, token_blacklist_key
from core.dependencies import get_current_user
from models.customer import Customer

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("CF-Connecting-IP") or request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_get_real_ip)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    name: str                        # Rufname (wie Baddi den User anspricht)
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr
    password: str
    birth_year: int | None = None
    birth_date: date | None = None
    tos_accepted: bool = False       # Pflicht: AGB & Datenschutz
    memory_consent: bool = True      # Optional: Langzeitgedächtnis
    phone: str | None = None         # Mobilnummer für 2FA

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Passwort muss mindestens 8 Zeichen lang sein")
        if not any(c.isupper() for c in v):
            raise ValueError("Passwort muss mindestens einen Grossbuchstaben enthalten")
        if not any(c.isdigit() for c in v):
            raise ValueError("Passwort muss mindestens eine Ziffer enthalten")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str
    email: str


class TwoFAResponse(BaseModel):
    requires_2fa: bool = True
    temp_token: str
    phone_hint: str   # z.B. "+41 79 ***  ** 23"


# ─── Login ────────────────────────────────────────────────────────────────────

@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Customer).where(Customer.email == data.email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="E-Mail oder Passwort falsch")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deaktiviert")

    # Admin-Accounts müssen zwingend 2FA aktiviert haben
    if user.role == "admin" and not (user.two_fa_enabled and user.phone_verified):
        raise HTTPException(
            status_code=403,
            detail="Admin-Login erfordert aktivierte 2FA. Bitte zuerst 2FA via POST /v1/auth/2fa/send-otp und /v1/auth/2fa/enable einrichten.",
        )

    # 2FA aktiv und Telefonnummer verifiziert → OTP senden
    if user.two_fa_enabled and user.phone_verified and user.phone:
        from services.twilio_service import generate_and_send_otp
        generate_and_send_otp(user.phone, str(user.id))
        temp_token = create_temp_token(user.email)
        return TwoFAResponse(
            temp_token=temp_token,
            phone_hint=_mask_phone(user.phone),
        )

    token = create_access_token(subject=user.email, role=user.role)
    return TokenResponse(access_token=token, role=user.role, name=user.name, email=user.email)


# ─── 2FA Verify (zweiter Login-Schritt) ───────────────────────────────────────

class Verify2FARequest(BaseModel):
    temp_token: str
    code: str


@router.post("/verify-2fa", response_model=TokenResponse)
@limiter.limit("10/minute")
async def verify_2fa(request: Request, data: Verify2FARequest, db: AsyncSession = Depends(get_db)):
    try:
        email = decode_temp_token(data.temp_token)
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Ungültiger oder abgelaufener Token")

    result = await db.execute(select(Customer).where(Customer.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Benutzer nicht gefunden")

    from services.twilio_service import verify_otp
    if not verify_otp(str(user.id), data.code):
        raise HTTPException(status_code=401, detail="Ungültiger oder abgelaufener Code")

    token = create_access_token(subject=user.email, role=user.role)
    return TokenResponse(access_token=token, role=user.role, name=user.name, email=user.email)


# ─── Register ─────────────────────────────────────────────────────────────────

@router.post("/register", status_code=201, response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if not data.tos_accepted:
        raise HTTPException(status_code=422, detail="AGB und Datenschutzerklärung müssen akzeptiert werden.")

    existing = await db.execute(select(Customer).where(Customer.email == data.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="E-Mail bereits registriert")

    user = Customer(
        name=data.name,
        first_name=data.first_name or None,
        last_name=data.last_name or None,
        email=data.email.lower(),
        birth_year=data.birth_date.year if data.birth_date else data.birth_year,
        birth_date=data.birth_date,
        hashed_password=hash_password(data.password),
        role="customer",
        tos_accepted_at=datetime.now(timezone.utc).replace(tzinfo=None),
        memory_consent=data.memory_consent,
        phone=data.phone or None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(subject=user.email, role=user.role)
    return TokenResponse(access_token=token, role=user.role, name=user.name, email=user.email)


# ─── Logout ───────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=204)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
):
    """Revoziert den aktuellen JWT-Token (Blacklist via Redis, TTL = Restlaufzeit)."""
    from core.redis_client import get_async_redis
    from jose import jwt as _jwt
    token = credentials.credentials
    try:
        payload = _jwt.decode(token, "", algorithms=[settings.algorithm], options={"verify_signature": False})
        import time
        ttl = max(1, int(payload.get("exp", 0) - time.time()))
    except Exception:
        ttl = settings.access_token_expire_minutes * 60
    r = await get_async_redis()
    await r.setex(token_blacklist_key(token), ttl, "1")


# ─── Passwort ändern ──────────────────────────────────────────────────────────

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password", status_code=204)
async def change_password(
    data: ChangePasswordRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Aktuelles Passwort falsch")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=422, detail="Passwort muss mindestens 8 Zeichen lang sein")
    user.hashed_password = hash_password(data.new_password)
    await db.commit()


# ─── Profil ───────────────────────────────────────────────────────────────────

@router.get("/me")
async def me(user: Customer = Depends(get_current_user)):
    return {
        "id": str(user.id),
        "name": user.name,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "role": user.role,
        "memory_consent": user.memory_consent,
        "language": user.language or "de",
        "phone": user.phone,
        "address_street": user.address_street,
        "address_zip": user.address_zip,
        "address_city": user.address_city,
        "address_country": user.address_country,
        "billing_same_as_address": user.billing_same_as_address,
        "billing_street": user.billing_street,
        "billing_zip": user.billing_zip,
        "billing_city": user.billing_city,
        "billing_country": user.billing_country,
        "two_fa_enabled": user.two_fa_enabled,
        "phone_verified": user.phone_verified,
        "notification_channel": user.notification_channel or "sms",
    }


# ─── 2FA Verwaltung ───────────────────────────────────────────────────────────

class SendOtpRequest(BaseModel):
    phone: str   # Telefonnummer für die 2FA (E.164)


@router.post("/2fa/send-otp", status_code=204)
async def send_otp(
    data: SendOtpRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sendet OTP an die angegebene Nummer. Zum Verifizieren/Aktivieren der 2FA."""
    from services.twilio_service import generate_and_send_otp
    ok = generate_and_send_otp(data.phone, str(user.id))
    if not ok:
        raise HTTPException(status_code=500, detail="SMS-Versand fehlgeschlagen")
    # Nummer vormerken (noch nicht verifiziert)
    user.phone = data.phone
    await db.commit()


class EnableTwoFARequest(BaseModel):
    code: str


@router.post("/2fa/enable", status_code=204)
async def enable_2fa(
    data: EnableTwoFARequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aktiviert 2FA nachdem OTP bestätigt wurde."""
    from services.twilio_service import verify_otp
    if not verify_otp(str(user.id), data.code):
        raise HTTPException(status_code=400, detail="Ungültiger oder abgelaufener Code")
    user.phone_verified = True
    user.two_fa_enabled = True
    await db.commit()


class DisableTwoFARequest(BaseModel):
    current_password: str


@router.post("/2fa/disable", status_code=204)
async def disable_2fa(
    data: DisableTwoFARequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deaktiviert 2FA nach Passwortbestätigung."""
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Passwort falsch")
    user.two_fa_enabled = False
    await db.commit()


# ─── Helper ───────────────────────────────────────────────────────────────────

def _mask_phone(phone: str) -> str:
    """Maskiert Telefonnummer für Frontend-Anzeige, z.B. '+41 79 *** ** 23'.
    Zeigt die ersten 4 und letzten 2 Zeichen, der Rest wird mit * ersetzt.
    """
    if len(phone) < 6:
        return "***"
    visible_prefix = phone[:4]
    visible_suffix = phone[-2:]
    masked_middle = "*" * (len(phone) - 6)
    return f"{visible_prefix}{masked_middle}{visible_suffix}"
