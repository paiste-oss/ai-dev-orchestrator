import os
import asyncio
import httpx
import json
import websockets
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from anthropic import Anthropic
from tools import FolderSensorTool, GitHubUploadTool


OLLAMA_BASE_URL = "http://host.docker.internal:11434"


def detect_language_simple(text: str) -> str:
    german_chars = set("äöüÄÖÜß")
    german_words = {"ich", "du", "ist", "bitte", "danke", "wie", "was", "wo", "wer", "und", "oder", "nicht", "das", "die", "der"}
    words = set(text.lower().split())
    if any(c in text for c in german_chars) or len(words & german_words) >= 1:
        return "de"
    return "en"

def get_language_system_prompt(prompt_text: str) -> str:
    lang = detect_language_simple(prompt_text)
    hints = {
        "de": "Antworte ausschließlich auf Deutsch. Keine andere Sprache.",
        "en": "Reply exclusively in English. No other language.",
    }
    return hints.get(lang, hints["en"])

def execute_ollama_direct(prompt_text: str, model_name: str = "llama3.1", system_prompt: str = None) -> str:
    """Direkte Ollama-Anfrage ohne Agent-Overhead — für einfache Prompts."""
    sys_prompt = system_prompt if system_prompt else get_language_system_prompt(prompt_text)
    response = httpx.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json={
            "model": model_name,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": prompt_text}
            ],
            "stream": False
        },
        timeout=120
    )
    response.raise_for_status()
    return response.json()["message"]["content"]


def execute_agent_with_tools(prompt_text: str, model_name: str = "llama3.1") -> str:
    """CrewAI Agent mit Folder Sensor und GitHub Upload — für Code/Projektaufgaben."""
    local_llm = ChatOpenAI(
        model=model_name,
        api_key="NA",
        base_url=f"{OLLAMA_BASE_URL}/v1"
    )

    agent = Agent(
        role='Senior System Architect',
        goal='Analysiere das Projekt und führe Code-Aufgaben präzise aus.',
        backstory='Du bist ein erfahrener Entwickler mit Zugriff auf den Projektordner. Antworte immer in der Sprache des Nutzers.',
        llm=local_llm,
        tools=[FolderSensorTool(), GitHubUploadTool()],
        verbose=True,
        allow_delegation=False
    )

    task = Task(
        description=prompt_text,
        expected_output='Eine saubere Antwort in der Sprache des Nutzers, ohne technische Protokolle oder JSON-Strukturen.',
        agent=agent
    )

    crew = Crew(agents=[agent], tasks=[task], process=Process.sequential)
    return str(crew.kickoff())


def execute_claude_task(prompt_text: str, model_name: str = "claude-sonnet-4-6") -> str:
    """Anthropic Claude API — für komplexe Aufgaben."""
    client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    message = client.messages.create(
        model=model_name,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt_text}],
        system=get_language_system_prompt(prompt_text)
    )
    return message.content[0].text


async def execute_openclaw_task_async(prompt_text: str) -> str:
    """OpenClaw WebSocket Gateway."""
    gateway_url = "ws://127.0.0.1:18789"
    token = os.getenv("OPENCLAW_TOKEN")

    if not token:
        raise Exception("OPENCLAW_TOKEN nicht in .env gesetzt!")

    headers = {"Authorization": f"Bearer {token}"}

    async with websockets.connect(gateway_url, additional_headers=headers) as ws:
        payload = {"type": "agent.run", "message": prompt_text, "stream": False}
        await ws.send(json.dumps(payload))

        async for message in ws:
            data = json.loads(message)
            msg_type = data.get("type", "")
            if msg_type in ("agent.response", "agent.done"):
                return data.get("content", data.get("text", str(data)))
            elif msg_type == "error":
                raise Exception(f"OpenClaw Fehler: {data.get('message', str(data))}")

    return "Keine Antwort von OpenClaw erhalten."


def execute_openclaw_task(prompt_text: str) -> str:
    return asyncio.run(execute_openclaw_task_async(prompt_text))
