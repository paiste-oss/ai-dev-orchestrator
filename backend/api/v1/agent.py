from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from router import route_prompt

router = APIRouter()


class AIRequest(BaseModel):
    prompt: str
    model: str = "auto"
    system_prompt: str | None = None


@router.post("/agent/run")
async def run_agent(request: AIRequest):
    try:
        forced = None if request.model == "auto" else request.model
        output, model_used = route_prompt(
            request.prompt,
            forced_model=forced,
            system_prompt_override=request.system_prompt,
        )
        return {"status": "success", "output": output, "model_used": model_used}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agent/history")
async def get_history():
    """Legacy endpoint — returns last 10 messages from PostgreSQL."""
    try:
        from sqlalchemy import text
        from core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT id, created_at AS timestamp, content AS prompt, model_used AS model, content AS result FROM messages ORDER BY created_at DESC LIMIT 10")
            )
            rows = result.mappings().all()
            return {"history": [dict(r) for r in rows]}
    except Exception:
        return {"history": []}
