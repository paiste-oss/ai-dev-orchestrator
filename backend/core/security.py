from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": subject, "role": role, "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def decode_access_token(token: str) -> dict:
    """Raises JWTError on invalid or expired token."""
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


def create_temp_token(subject: str) -> str:
    """Kurzlebiger Token (5 Min) für den 2FA-Pending-State nach erstem Login-Schritt."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=5)
    return jwt.encode(
        {"sub": subject, "scope": "2fa_pending", "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def decode_temp_token(token: str) -> str:
    """Gibt die E-Mail zurück oder wirft JWTError. Prüft scope=2fa_pending."""
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    if payload.get("scope") != "2fa_pending":
        raise ValueError("Ungültiger Token-Scope")
    return payload["sub"]
