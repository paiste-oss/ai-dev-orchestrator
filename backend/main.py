import os
import sqlite3
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler
from router import route_prompt
from agents import execute_agent_with_tools

# --- KONFIGURATION ---
os.environ["OPENAI_API_KEY"] = "NA"
os.environ["OPENAI_API_BASE"] = "http://host.docker.internal:11434/v1"
os.environ["OPENAI_BASE_URL"] = "http://host.docker.internal:11434/v1"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# --- DATENBANK ---
def init_db():
    conn = sqlite3.connect("memory.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT, prompt TEXT, model TEXT, result TEXT, code_state TEXT
        )
    """)
    conn.commit()
    conn.close()

def save_to_db(prompt_text, model_name, result):
    conn = sqlite3.connect("memory.db")
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO projects (timestamp, prompt, model, result) VALUES (?, ?, ?, ?)",
        (datetime.now().isoformat(), prompt_text, model_name, result)
    )
    conn.commit()
    conn.close()

init_db()

# --- SCHEDULER ---
def daily_job():
    print(f"[{datetime.now()}] Starte automatische Zusammenfassung...")
    result = execute_agent_with_tools("Erstelle eine JSON-Zusammenfassung des aktuellen Projektstands.")
    save_to_db("daily_summary", "llama3.2", result)

scheduler = BackgroundScheduler()
scheduler.add_job(daily_job, 'cron', hour=20, minute=0)
scheduler.start()

# --- API ---
class AIRequest(BaseModel):
    prompt: str
    model: str = "auto"  # "auto" = Router entscheidet, sonst Modell erzwingen

@app.post("/agent/run")
async def run_api_agent(request: AIRequest):
    try:
        forced = None if request.model == "auto" else request.model
        output, model_used = route_prompt(request.prompt, forced_model=forced)
        save_to_db(request.prompt, model_used, output)
        return {"status": "success", "output": output, "model_used": model_used}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/agent/history")
async def get_history():
    conn = sqlite3.connect("memory.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM projects ORDER BY id DESC LIMIT 10")
    rows = cursor.fetchall()
    conn.close()
    return {"history": [dict(row) for row in rows]}
