import logging
import os
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from core.config import settings
from core.database import init_db
from api.v1 import (
    agent, customers, workflows, credentials, oauth, dev_tasks, documents,
    document_folders, literature,
    events, auth, chat, finance, transport, entwicklung, billing,
    router_admin, llm_admin, system_prompts_admin, tools_admin,
    integrations_admin, analytics_admin, user_preferences, windows,
    knowledge, stocks, transcribe, health_admin, dictations, assistenz,
    support_admin, flights, email, calendar, invoices, user_home,
)
from api.v1 import settings as portal_settings
from api.v1 import push
import models.chat              # noqa: F401
import models.document_folder   # noqa: F401
import models.finance           # noqa: F401
import models.capability_request  # noqa: F401
import models.payment           # noqa: F401
import models.window            # noqa: F401
import models.knowledge         # noqa: F401
import models.stock_portfolio   # noqa: F401
import models.daily_summary     # noqa: F401
import models.support_ticket    # noqa: F401
import models.email_message    # noqa: F401
import models.device_token      # noqa: F401
import models.literature_entry  # noqa: F401

os.environ["OPENAI_API_KEY"] = settings.openai_api_key or "NA"

# ── Sentry (nur wenn DSN konfiguriert) ───────────────────────────────────────
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,
        profiles_sample_rate=0.05,
        environment="production",
        send_default_pii=False,  # Keine PII senden (DSG-konform)
    )

# ── Rate Limiter ──────────────────────────────────────────────────────────────
def _get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("CF-Connecting-IP") or request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)

limiter = Limiter(key_func=_get_real_ip)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    from services.fcm_service import init_firebase
    from services.s3_storage import setup_bucket_cors
    init_firebase()
    await setup_bucket_cors()
    yield


app = FastAPI(title="AI Buddy", version="2.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)

# Rate-Limit-Handler registrieren
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_PROD_ORIGINS = [
    "https://baddi.ch",
    "https://www.baddi.ch",
    "https://baddi.me",
    "https://www.baddi.me",
]
_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
]
_CORS_ORIGINS = _PROD_ORIGINS + _DEV_ORIGINS  # localhost immer erlaubt (lokale Entwicklung → VPS-Backend)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=60,
)

app.include_router(agent.router)
app.include_router(customers.router, prefix="/v1")
app.include_router(workflows.router, prefix="/v1")
app.include_router(credentials.router, prefix="/v1")
app.include_router(oauth.router, prefix="/v1")
app.include_router(dev_tasks.router, prefix="/v1")
app.include_router(documents.router, prefix="/v1")
app.include_router(document_folders.router, prefix="/v1")
app.include_router(literature.router, prefix="/v1")
app.include_router(events.router, prefix="/v1")
app.include_router(auth.router, prefix="/v1")
app.include_router(portal_settings.router, prefix="/v1")
app.include_router(chat.router, prefix="/v1")
app.include_router(finance.router, prefix="/v1")
app.include_router(transport.router, prefix="/v1")
app.include_router(entwicklung.router, prefix="/v1")
app.include_router(billing.router, prefix="/v1")
app.include_router(router_admin.router, prefix="/v1")
app.include_router(llm_admin.router, prefix="/v1")
app.include_router(system_prompts_admin.router, prefix="/v1")
app.include_router(tools_admin.router, prefix="/v1")
app.include_router(integrations_admin.router, prefix="/v1")
app.include_router(analytics_admin.router, prefix="/v1")
app.include_router(user_preferences.router, prefix="/v1")
app.include_router(user_home.router, prefix="/v1")
app.include_router(windows.router, prefix="/v1")
app.include_router(knowledge.router, prefix="/v1")
app.include_router(stocks.router, prefix="/v1")
app.include_router(transcribe.router, prefix="/v1")
app.include_router(dictations.router, prefix="/v1")
app.include_router(health_admin.router, prefix="/v1")
app.include_router(assistenz.router, prefix="/v1")
app.include_router(support_admin.router, prefix="/v1")
app.include_router(flights.router, prefix="/v1")
app.include_router(email.router, prefix="/v1")
app.include_router(calendar.router, prefix="/v1")
app.include_router(invoices.router, prefix="/v1")
app.include_router(push.router, prefix="/v1")


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    """Hängt eine Request-ID an jeden Request und jede Response.
    Wird von Uvicorn-Logs via request.state.correlation_id referenzierbar.
    """
    cid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.correlation_id = cid
    response = await call_next(request)
    response.headers["X-Request-ID"] = cid
    return response


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Globaler Fallback — verhindert, dass unbehandelte Fehler den Server zum Absturz bringen."""
    cid = getattr(request.state, "correlation_id", "—")
    logging.getLogger("uvicorn.error").exception(
        "[%s] Unbehandelter Fehler: %s %s", cid, request.method, request.url.path, exc_info=exc
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Interner Serverfehler"},
        headers={"X-Request-ID": cid},
    )


@app.get("/")
async def health():
    return {"status": "ok", "service": "AI Buddy API", "version": "2.0.0"}


@app.get("/v1/system/status")
async def system_status():
    """Prüft den Status aller kritischen Dienste (DB, Redis, KI)."""
    import asyncio
    from sqlalchemy import text
    from core.database import AsyncSessionLocal
    import redis.asyncio as aioredis

    results: dict[str, dict] = {}
    results["backend"] = {"ok": True}

    try:
        async with AsyncSessionLocal() as session:
            await asyncio.wait_for(session.execute(text("SELECT 1")), timeout=2.0)
        results["db"] = {"ok": True}
    except Exception as e:
        results["db"] = {"ok": False, "error": str(e)[:80]}

    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        await asyncio.wait_for(r.ping(), timeout=2.0)
        await r.aclose()
        results["redis"] = {"ok": True}
    except Exception as e:
        results["redis"] = {"ok": False, "error": str(e)[:80]}

    ai_ok = bool(settings.anthropic_api_key or settings.aws_bedrock_api_key)
    results["ai"] = {"ok": ai_ok}

    overall = all(v["ok"] for v in results.values())
    return {"ok": overall, "services": results}
