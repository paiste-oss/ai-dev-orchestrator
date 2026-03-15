"""
AI Dev Task Runner
==================
Führt Entwicklungsaufgaben mit Claude Sonnet aus.
Claude hat Zugriff auf das gesamte Projekt via Tools (read/write/bash/search).

Unterstützt Resume: bei Rate-Limit wird der Gesprächsverlauf gespeichert
und beim nächsten Start genau dort fortgesetzt.

Verwendung (aus Celery-Task):
    result = run_task(description="Erstelle einen neuen Endpoint...", messages_snapshot=None)
    # result = {"status": "completed"|"paused"|"failed", "output": "...", ...}
"""

import os
import glob
import subprocess
import anthropic
from core.config import settings

PROJECT_ROOT = settings.project_root

# ---------------------------------------------------------------------------
# Tool-Definitionen (Anthropic Tool Use Format)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "read_file",
        "description": "Liest eine Datei aus dem Projekt. Pfad relativ zum Projekt-Root.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Pfad zur Datei, z.B. backend/main.py"}
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Erstellt oder überschreibt eine Datei im Projekt.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Pfad zur Datei"},
                "content": {"type": "string", "description": "Vollständiger Datei-Inhalt"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "run_bash",
        "description": "Führt einen Shell-Befehl im Projekt-Root aus (git, npm, python, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell-Befehl"},
            },
            "required": ["command"],
        },
    },
    {
        "name": "list_files",
        "description": "Listet Dateien die einem Glob-Muster entsprechen, z.B. backend/**/*.py",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Glob-Muster"},
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "search_code",
        "description": "Sucht nach Text/Code in Projektdateien (grep).",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Suchbegriff oder Regex"},
                "file_pattern": {"type": "string", "description": "Dateifilter, z.B. *.py (optional)", "default": ""},
            },
            "required": ["query"],
        },
    },
]

SYSTEM_PROMPT = """Du bist ein Senior Full-Stack Developer der am "AI Buddy" Projekt arbeitet.

## Projekt-Übersicht
AI Buddy ist eine SaaS-Plattform für KI-Agenten mit folgenden Rollen:
- Admin (Systemverwaltung), Enterprise (Firmenkunden), User (Endnutzer mit UseCases)

Stack:
- Backend: FastAPI (Python), PostgreSQL (asyncpg), Redis, Celery, Qdrant
- Frontend: Next.js 16 App Router, TypeScript, Tailwind CSS
- KI: Ollama lokal (Mistral=Chat, Llama3.2=Code, Phi3=Router), Claude Sonnet 4.6 (Cloud)
- Automation: n8n als Microservice-Executor (service-send-email etc.)
- Infra: Docker Compose, Cloudflare Tunnel, WSL2

## Projekt-Struktur
- /project/backend/          → FastAPI Backend
- /project/frontend/         → Next.js Frontend
- /project/docker-compose.yml
- /project/.env              → ALLE Secrets (niemals Werte ändern, nur lesen)

## Deine Arbeitsweise
1. Immer zuerst relevante Dateien lesen (read_file) bevor du etwas änderst
2. Präziser, sauberer Code — keine unnötigen Abstraktionen
3. Nach Code-Änderungen: git add + commit via run_bash (auf Englisch)
4. Am Ende: kurze Zusammenfassung was du gemacht hast

## Wichtige Regeln
- Keine Secrets oder Tokens in Code schreiben — alles kommt aus .env
- Bestehenden Code verstehen bevor du ihn änderst
- Deutsche Kommentare im Code sind ok, git-Messages auf Englisch
- Bei Unsicherheit: lieber nachfragen als falsch machen
"""


# ---------------------------------------------------------------------------
# Tool-Implementierungen
# ---------------------------------------------------------------------------

def _read_file(path: str) -> str:
    # Absoluten Pfad direkt verwenden, relativen an PROJECT_ROOT hängen
    full = path if os.path.isabs(path) else os.path.join(PROJECT_ROOT, path)
    try:
        with open(full, encoding="utf-8") as f:
            content = f.read()
        if len(content) > 12000:
            return content[:12000] + f"\n\n... [abgeschnitten, {len(content)} Zeichen total]"
        return content
    except FileNotFoundError:
        return f"FEHLER: Datei nicht gefunden: {path}"
    except Exception as e:
        return f"FEHLER: {e}"


def _write_file(path: str, content: str) -> str:
    full = path if os.path.isabs(path) else os.path.join(PROJECT_ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Geschrieben: {path} ({len(content)} Zeichen)"


def _run_bash(command: str) -> str:
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True,
            cwd=PROJECT_ROOT, timeout=120,
        )
        out = (result.stdout + result.stderr).strip()
        if len(out) > 4000:
            out = out[:4000] + "\n... [abgeschnitten]"
        return out or "(kein Output)"
    except subprocess.TimeoutExpired:
        return "FEHLER: Timeout nach 120s"
    except Exception as e:
        return f"FEHLER: {e}"


def _list_files(pattern: str) -> str:
    full_pattern = os.path.join(PROJECT_ROOT, pattern.lstrip("/"))
    files = glob.glob(full_pattern, recursive=True)
    files = [f.replace(PROJECT_ROOT, "").lstrip("/") for f in sorted(files)]
    if len(files) > 80:
        files = files[:80]
        files.append("... [mehr Dateien vorhanden]")
    return "\n".join(files) if files else "(keine Dateien gefunden)"


def _search_code(query: str, file_pattern: str = "") -> str:
    cmd = ["grep", "-rn", "--include", file_pattern or "*", query, PROJECT_ROOT]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        out = result.stdout.strip()
        if len(out) > 4000:
            out = out[:4000] + "\n... [abgeschnitten]"
        return out or "(keine Treffer)"
    except Exception as e:
        return f"FEHLER: {e}"


def _execute_tool(name: str, inputs: dict) -> str:
    if name == "read_file":
        return _read_file(inputs["path"])
    if name == "write_file":
        return _write_file(inputs["path"], inputs["content"])
    if name == "run_bash":
        return _run_bash(inputs["command"])
    if name == "list_files":
        return _list_files(inputs["pattern"])
    if name == "search_code":
        return _search_code(inputs["query"], inputs.get("file_pattern", ""))
    return f"FEHLER: Unbekanntes Tool: {name}"


# ---------------------------------------------------------------------------
# Serialisierung für JSON-Speicherung (context_snapshot)
# ---------------------------------------------------------------------------

def _serialize_content(content) -> list | str:
    if isinstance(content, str):
        return content
    result = []
    for block in content:
        if isinstance(block, dict):
            result.append(block)
        elif hasattr(block, "model_dump"):
            result.append(block.model_dump())
        else:
            result.append({"type": "text", "text": str(block)})
    return result


def _serialize_messages(messages: list) -> list:
    return [{"role": m["role"], "content": _serialize_content(m["content"])} for m in messages]


# ---------------------------------------------------------------------------
# Haupt-Agentenloop
# ---------------------------------------------------------------------------

def run_task(
    description: str,
    messages_snapshot: list | None = None,
    existing_output: str = "",
    progress_callback=None,  # optional: fn(output_str) wird nach jedem Schritt aufgerufen
) -> dict:
    """
    Führt eine Entwicklungsaufgabe mit Claude aus.

    Returns:
        {
          "status": "completed" | "paused" | "failed",
          "output": str,           # akkumulierter Log
          "context": list | None,  # messages für Resume (bei "paused")
          "tokens": int,
          "retry_after_seconds": int | None,
        }
    """
    # max_retries=0: 429-Fehler sofort an unseren Code weitergeben statt SDK-intern zu retrien.
    # Unser Celery-Beat übernimmt das Retry mit korrektem Pause-State.
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=0)

    messages = messages_snapshot or [{"role": "user", "content": description}]
    output_lines = [existing_output] if existing_output else []
    total_tokens = 0

    while True:
        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=8096,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            )
        except anthropic.RateLimitError as e:
            retry_after = 60
            try:
                retry_after = int(e.response.headers.get("retry-after", 60))
            except Exception:
                pass
            output_lines.append(f"\n⏸ Rate Limit erreicht. Automatischer Neustart in {retry_after}s.")
            return {
                "status": "paused",
                "output": "\n".join(output_lines),
                "context": _serialize_messages(messages),
                "tokens": total_tokens,
                "retry_after_seconds": retry_after,
            }
        except anthropic.APIError as e:
            return {
                "status": "failed",
                "output": "\n".join(output_lines),
                "context": None,
                "tokens": total_tokens,
                "error": str(e),
            }

        total_tokens += response.usage.input_tokens + response.usage.output_tokens

        # Text-Blöcke in Output aufnehmen
        for block in response.content:
            if hasattr(block, "text") and block.text:
                output_lines.append(block.text)

        # Live-Output nach jedem API-Call pushen
        if progress_callback:
            progress_callback("\n".join(output_lines))

        if response.stop_reason == "end_turn":
            return {
                "status": "completed",
                "output": "\n".join(output_lines),
                "context": None,
                "tokens": total_tokens,
            }

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    tool_result = _execute_tool(block.name, block.input)
                    preview = tool_result[:120].replace("\n", " ")
                    output_lines.append(f"🔧 {block.name}({list(block.input.values())[0] if block.input else ''}) → {preview}")
                    # Live-Output nach jedem Tool-Call
                    if progress_callback:
                        progress_callback("\n".join(output_lines))
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": tool_result,
                    })
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})
            continue

        # Unerwarteter stop_reason
        return {
            "status": "completed",
            "output": "\n".join(output_lines),
            "context": None,
            "tokens": total_tokens,
        }
