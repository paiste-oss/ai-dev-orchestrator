import os
import requests
import base64
import sqlite3
import asyncio
import websockets
import json
from datetime import datetime
from crewai.tools import BaseTool
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from anthropic import Anthropic
from apscheduler.schedulers.background import BackgroundScheduler

# --- KONFIGURATION ---
os.environ["OPENAI_API_KEY"] = "NA"
os.environ["OPENAI_API_BASE"] = "http://host.docker.internal:11434/v1"
os.environ["OPENAI_BASE_URL"] = "http://host.docker.internal:11434/v1"

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- 1. DATENBANK SETUP ---
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

init_db()

# --- 2. TOOLS ---
class FolderSensorTool(BaseTool):
    name: str = "Folder Sensor"
    description: str = "Liest alle Dateien im Projektordner, um den aktuellen Stand des Codes zu verstehen."
    def _run(self) -> str:
        root_dir = ".."
        project_summary = ""
        ignore = ["node_modules", ".next", "__pycache__", ".git", "venv", "memory.db"]
        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ignore]
            for file in files:
                if file.endswith(('.py', '.tsx', '.json', '.yml')):
                    file_path = os.path.join(root, file)
                    project_summary += f"\n--- DATEI: {file_path} ---\n"
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            project_summary += f.read()[:500]
                    except: pass
        return project_summary

class GitHubUploadTool(BaseTool):
    name: str = "GitHub Code Uploader"
    description: str = "Lädt Code auf GitHub hoch."
    def _run(self, code: str, filename: str) -> str:
        token = os.getenv("GITHUB_TOKEN")
        repo_name = "paiste-oss/ai-test"  # BITTE ANPASSEN
        url = f"https://api.github.com/repos/{repo_name}/contents/{filename}"
        headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
        encoded_code = base64.b64encode(code.encode("utf-8")).decode("utf-8")
        data = {"message": f"KI-Upload: {filename}", "content": encoded_code}
        res = requests.put(url, headers=headers, json=data)
        return "Erfolg!" if res.status_code in [200, 201] else f"Fehler: {res.text}"

# --- 3. HILFSFUNKTION: In DB speichern ---
def save_to_db(prompt_text, model_name, result):
    conn = sqlite3.connect("memory.db")
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO projects (timestamp, prompt, model, result) VALUES (?, ?, ?, ?)",
        (datetime.now().isoformat(), prompt_text, model_name, result)
    )
    conn.commit()
    conn.close()

# --- 4. OLLAMA / CREWAI AGENT ---
def execute_agent_task(prompt_text, model_name="llama3.1"):
    local_llm = ChatOpenAI(model=model_name, api_key="NA", base_url="http://host.docker.internal:11434/v1")
    sensor = FolderSensorTool()
    gh = GitHubUploadTool()

    agent = Agent(
        role='Senior System Architect',
        goal='Analysiere das Projekt und führe Aufgaben präzise aus.',
        backstory='Du hast vollen Zugriff auf den Code via Folder Sensor.',
        llm=local_llm, tools=[sensor, gh], verbose=True
    )

    task = Task(
        description=f"Nutze den Folder Sensor für Kontext. Dann: {prompt_text}",
        expected_output='Eine detaillierte Zusammenfassung oder Erfolgsmeldung.',
        agent=agent
    )

    crew = Crew(agents=[agent], tasks=[task], process=Process.sequential)
    result = str(crew.kickoff())
    save_to_db(prompt_text, model_name, result)
    return result

# --- 5. CLAUDE (Anthropic API) ---
def execute_claude_task(prompt_text, model_name="claude-sonnet-4-6"):
    client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    message = client.messages.create(
        model=model_name,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt_text}]
    )
    result = message.content[0].text
    save_to_db(prompt_text, model_name, result)
    return result

# --- 6. OPENCLAW (WebSocket Gateway) ---
async def execute_openclaw_task_async(prompt_text: str) -> str:
    gateway_url = "ws://127.0.0.1:18789"
    token = os.getenv("OPENCLAW_TOKEN")

    if not token:
        raise Exception("OPENCLAW_TOKEN nicht in .env gesetzt!")

    headers = {"Authorization": f"Bearer {token}"}

    async with websockets.connect(gateway_url, additional_headers=headers) as ws:
        payload = {
            "type": "agent.run",
            "message": prompt_text,
            "stream": False
        }
        await ws.send(json.dumps(payload))

        full_response = ""
        async for message in ws:
            data = json.loads(message)
            msg_type = data.get("type", "")

            if msg_type in ("agent.response", "agent.done"):
                full_response = data.get("content", data.get("text", str(data)))
                break
            elif msg_type == "error":
                raise Exception(f"OpenClaw Fehler: {data.get('message', str(data))}")

        return full_response if full_response else "Keine Antwort von OpenClaw erhalten."

def execute_openclaw_task(prompt_text: str) -> str:
    result = asyncio.run(execute_openclaw_task_async(prompt_text))
    save_to_db(prompt_text, "openclaw", result)
    return result

# --- 7. AUTOMATISCHER WECKER (Scheduler) ---
def daily_job():
    print(f"[{datetime.now()}] Starte automatische Zusammenfassung...")
    execute_agent_task("Erstelle eine JSON-Zusammenfassung des aktuellen Projektstands basierend auf den Dateien, die du im Folder Sensor siehst.")

scheduler = BackgroundScheduler()
scheduler.add_job(daily_job, 'cron', hour=20, minute=0)
scheduler.start()

# --- 8. API ENDPUNKTE ---
class AIRequest(BaseModel):
    prompt: str
    model: str = "llama3.1"

@app.post("/agent/run")
async def run_api_agent(request: AIRequest):
    try:
        if request.model == "openclaw":
            output = execute_openclaw_task(request.prompt)
        elif request.model.startswith("claude"):
            output = execute_claude_task(request.prompt, request.model)
        else:
            output = execute_agent_task(request.prompt, request.model)
        return {"status": "success", "output": output}
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