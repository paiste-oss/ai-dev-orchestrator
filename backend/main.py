import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import init_db
from api.v1 import agent, customers, buddies, workflows, credentials, oauth, dev_tasks, documents, events, auth, chat, finance, transport, buddy_tools
from api.v1 import settings as portal_settings
import models.chat      # noqa: F401 — register ChatMessage & MemoryItem with Base.metadata
import models.finance   # noqa: F401 — register CostEntry with Base.metadata
import models.buddy_tool  # noqa: F401 — register BuddyTool with Base.metadata

# Ollama als OpenAI-kompatibler Endpunkt für CrewAI/LangChain
os.environ["OPENAI_API_KEY"] = "NA"
os.environ["OPENAI_API_BASE"] = f"{settings.ollama_base_url}/v1"
os.environ["OPENAI_BASE_URL"] = f"{settings.ollama_base_url}/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="AI Buddy", version="2.0.0", lifespan=lifespan)

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
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agent.router)
app.include_router(customers.router, prefix="/v1")
app.include_router(buddies.router, prefix="/v1")
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
app.include_router(buddy_tools.router, prefix="/v1")


@app.get("/")
async def health():
    return {"status": "ok", "service": "AI Buddy API", "version": "2.0.0"}
