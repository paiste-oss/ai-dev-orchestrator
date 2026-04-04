import uuid
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from core.security import decode_access_token, token_blacklist_key
from core.database import get_db
from models.customer import Customer

bearer = HTTPBearer()

_AUTH_CACHE_TTL = 60  # Sekunden


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        email: str = payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Ungültiger oder abgelaufener Token")

    # Token-Blacklist prüfen (Logout / revozierte Sessions)
    from core.redis_client import get_async_redis
    r = await get_async_redis()
    if await r.exists(token_blacklist_key(token)):
        raise HTTPException(status_code=401, detail="Token wurde abgemeldet")

    # Cache: Email → User-UUID (vermeidet Full-Table-Scan auf customers.email pro Request)
    cache_key = f"auth:uid:{email}"
    cached_uid = await r.get(cache_key)

    if cached_uid:
        user = await db.get(Customer, uuid.UUID(cached_uid))
    else:
        result = await db.execute(select(Customer).where(Customer.email == email))
        user = result.scalar_one_or_none()
        if user:
            await r.setex(cache_key, _AUTH_CACHE_TTL, str(user.id))

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Benutzer nicht gefunden oder deaktiviert")
    return user


async def require_admin(user: Customer = Depends(get_current_user)) -> Customer:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin-Zugang erforderlich")
    return user
