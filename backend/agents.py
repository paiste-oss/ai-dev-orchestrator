import asyncio
import httpx
import json
import websockets
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from anthropic import Anthropic
from tools import FolderSensorTool, GitHubUploadTool
from core.config import settings


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


def execute_ollama_direct(prompt_text: str, model_name: str = None, system_prompt: str = None) -> str:
    """Direkte Ollama-Anfrage ohne Agent-Overhead — für einfache Prompts."""
    model = model_name or settings.ollama_chat_model
    sys_prompt = system_prompt if system_prompt else get_language_system_prompt(prompt_text)
    response = httpx.post(
        f"{settings.ollama_base_url}/api/chat",
        json={
            "model": model,
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


def execute_agent_with_tools(prompt_text: str, model_name: str = None) -> str:
    """CrewAI Agent mit Folder Sensor und GitHub Upload — für Code/Projektaufgaben."""
    model = model_name or settings.ollama_code_model
    local_llm = ChatOpenAI(
        model=model,
        api_key="NA",
        base_url=f"{settings.ollama_base_url}/v1"
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
    client = Anthropic(api_key=settings.anthropic_api_key)
    message = client.messages.create(
        model=model_name,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt_text}],
        system=get_language_system_prompt(prompt_text)
    )
    return message.content[0].text


async def execute_openclaw_task_async(prompt_text: str) -> str:
    """OpenClaw WebSocket Gateway — ACP-Protokoll v3."""
    import uuid as _uuid

    if not settings.openclaw_token:
        raise Exception("OPENCLAW_TOKEN nicht in .env gesetzt!")

    token = settings.openclaw_token
    url = settings.openclaw_gateway_url

    def _req(method: str, params: dict) -> dict:
        return {"type": "req", "id": str(_uuid.uuid4()), "method": method, "params": params}

    connect_frame = _req("connect", {
        "minProtocol": 3,
        "maxProtocol": 3,
        "client": {
            "id": "gateway-client",
            "version": "1.0.0",
            "platform": "linux",
            "mode": "backend",
        },
        "caps": [],
        "auth": {"token": token},
        "role": "operator",
        "scopes": ["operator.admin"],
    })

    async with websockets.connect(url) as ws:
        # 1. Challenge empfangen
        raw = await asyncio.wait_for(ws.recv(), timeout=10)
        challenge = json.loads(raw)
        if challenge.get("event") != "connect.challenge":
            raise Exception(f"Unerwartetes erstes Frame: {challenge}")

        # 2. Authenticate
        await ws.send(json.dumps(connect_frame))
        raw = await asyncio.wait_for(ws.recv(), timeout=10)
        auth_res = json.loads(raw)
        if not auth_res.get("ok"):
            raise Exception(f"OpenClaw Auth fehlgeschlagen: {auth_res.get('error', {}).get('message', str(auth_res))}")

        # 3. Nachricht senden
        chat_frame = _req("chat.send", {
            "message": prompt_text,
            "sessionKey": "agent:main:main",
            "idempotencyKey": str(_uuid.uuid4()),
        })
        await ws.send(json.dumps(chat_frame))

        # 4. Auf Antwort warten
        # Gateway antwortet async: chat.send-res liefert nur {runId, status:"started"},
        # danach kommen event-Frames: agent(stream=assistant), chat(state=final/delta)
        result_text = ""
        got_started = False
        deadline = asyncio.get_event_loop().time() + 120
        async for raw_msg in ws:
            if asyncio.get_event_loop().time() > deadline:
                break
            data = json.loads(raw_msg)
            event = data.get("event", "")
            msg_type = data.get("type", "")

            if msg_type == "res" and data.get("id") == chat_frame["id"]:
                if not data.get("ok"):
                    raise Exception(f"OpenClaw Fehler: {data.get('error', {}).get('message', str(data))}")
                got_started = True  # async start bestätigt, weiter auf Events warten
                continue

            # chat(state=final) → vollständige Antwort
            if event == "chat":
                payload = data.get("payload", {})
                if payload.get("state") == "final":
                    msg = payload.get("message", {})
                    content = msg.get("content", "")
                    if isinstance(content, list):
                        # content blocks: [{type:"text", text:"..."}]
                        result_text = " ".join(
                            b.get("text", "") for b in content if isinstance(b, dict)
                        )
                    elif isinstance(content, str):
                        result_text = content
                    break
                continue

            # agent(stream=assistant) → streaming delta (als Fallback akkumulieren)
            if event == "agent":
                payload = data.get("payload", {})
                if payload.get("stream") == "assistant":
                    data_block = payload.get("data", {})
                    result_text = data_block.get("text", result_text)  # überschreibe mit akkumuliertem Text
                elif payload.get("stream") == "lifecycle":
                    phase = payload.get("data", {}).get("phase", "")
                    if phase == "end" and result_text:
                        break  # Antwort vollständig
                continue

    return result_text or "Keine Antwort von OpenClaw erhalten."


def execute_openclaw_task(prompt_text: str) -> str:
    return asyncio.run(execute_openclaw_task_async(prompt_text))
