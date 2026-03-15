import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.database import init_db
from api.v1 import agent, customers, buddies, workflows

os.environ["OPENAI_API_KEY"] = "NA"
os.environ["OPENAI_API_BASE"] = "http://host.docker.internal:11434/v1"
os.environ["OPENAI_BASE_URL"] = "http://host.docker.internal:11434/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="AI Buddy", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Legacy endpoints (keep for n8n compatibility)
app.include_router(agent.router)

# v1 API
app.include_router(customers.router, prefix="/v1")
app.include_router(buddies.router, prefix="/v1")
app.include_router(workflows.router, prefix="/v1")


@app.get("/")
async def health():
    return {"status": "ok", "service": "AI Buddy API", "version": "2.0.0"}
