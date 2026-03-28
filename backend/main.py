import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import init_db
from api.v1 import agent, customers, workflows, credentials, oauth, dev_tasks, documents, events, auth, chat, finance, transport, entwicklung, billing, router_admin, llm_admin, system_prompts_admin, tools_admin, integrations_admin, analytics_admin, user_preferences, windows, knowledge
from api.v1 import settings as portal_settings
import models.chat      # noqa: F401 — register ChatMessage & MemoryItem with Base.metadata
import models.finance   # noqa: F401 — register CostEntry with Base.metadata
import models.capability_request  # noqa: F401 — register CapabilityRequest with Base.metadata
import models.payment             # noqa: F401 — register Payment & InvoiceCounter with Base.metadata
import models.window              # noqa: F401 — register WindowBoard with Base.metadata
import models.knowledge           # noqa: F401 — register KnowledgeSource & KnowledgeDocument with Base.metadata

# OpenAI-kompatibler Endpunkt für DALL-E (openai SDK)
os.environ["OPENAI_API_KEY"] = settings.openai_api_key or "NA"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="AI Buddy", version="2.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://baddi.ch",
        "https://www.baddi.ch",
        "https://baddi.me",
        "https://www.baddi.me",
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(agent.router)
app.include_router(customers.router, prefix="/v1")
app.include_router(workflows.router, prefix="/v1")
app.include_router(credentials.router, prefix="/v1")
app.include_router(oauth.router, prefix="/v1")
app.include_router(dev_tasks.router, prefix="/v1")
app.include_router(documents.router, prefix="/v1")
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
app.include_router(integrations_admin.router)
app.include_router(analytics_admin.router, prefix="/v1")
app.include_router(user_preferences.router, prefix="/v1")
app.include_router(windows.router, prefix="/v1")
app.include_router(knowledge.router, prefix="/v1")


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

    # Backend selbst ist erreichbar (sonst käme dieser Handler gar nicht)
    results["backend"] = {"ok": True}

    # Datenbank
    try:
        async with AsyncSessionLocal() as session:
            await asyncio.wait_for(session.execute(text("SELECT 1")), timeout=2.0)
        results["db"] = {"ok": True}
    except Exception as e:
        results["db"] = {"ok": False, "error": str(e)[:80]}

    # Redis
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        await asyncio.wait_for(r.ping(), timeout=2.0)
        await r.aclose()
        results["redis"] = {"ok": True}
    except Exception as e:
        results["redis"] = {"ok": False, "error": str(e)[:80]}

    # KI-Modelle: Anthropic oder Bedrock konfiguriert?
    ai_ok = bool(settings.anthropic_api_key or settings.aws_bedrock_api_key or settings.aws_access_key_id)
    results["ai"] = {"ok": ai_ok}

    overall = all(v["ok"] for v in results.values())
    return {"ok": overall, "services": results}
