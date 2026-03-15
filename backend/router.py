import httpx
import json
from agents import (
    execute_ollama_direct,
    execute_agent_with_tools,
    execute_claude_task,
    execute_openclaw_task,
)

OLLAMA_BASE_URL = "http://host.docker.internal:11434"
ROUTER_MODEL = "phi3"  # Schnelles, kleines Modell ideal für Routing

ROUTER_SYSTEM_PROMPT = """Du bist ein Router-Agent. Deine einzige Aufgabe ist es, eingehende Prompts zu klassifizieren.

Antworte IMMER nur mit einem JSON-Objekt in genau diesem Format:
{"route": "<route>", "reason": "<kurze Begründung>"}

Mögliche Routen:
- "simple_chat"   → Einfache Fragen, Smalltalk, Übersetzungen, Erklärungen
- "code_task"     → Code schreiben, Dateien analysieren, Projektaufgaben, GitHub
- "save_data"     → Etwas speichern, merken, notieren
- "automation"    → Workflows, wiederkehrende Aufgaben, Zeitpläne
- "complex_task"  → Sehr komplexe Analyse, Architekturfragen, lange Berechnungen

Beispiele:
- "Wie spät ist es?" → {"route": "simple_chat", "reason": "Einfache Frage"}
- "Schreibe eine Python Funktion" → {"route": "code_task", "reason": "Code-Erstellung"}
- "Speichere diese Info: X=5" → {"route": "save_data", "reason": "Datenspeicherung"}
"""

SIMPLE_CHAT_MODEL = "mistral"
CODE_TASK_MODEL = "llama3.2"

ROUTE_TO_HANDLER = {
    "simple_chat":  (lambda prompt: execute_ollama_direct(prompt, SIMPLE_CHAT_MODEL), SIMPLE_CHAT_MODEL),
    "code_task":    (lambda prompt: execute_agent_with_tools(prompt, CODE_TASK_MODEL), CODE_TASK_MODEL),
    "save_data":    (lambda prompt: execute_ollama_direct(prompt, SIMPLE_CHAT_MODEL), SIMPLE_CHAT_MODEL),
    "automation":   (lambda prompt: execute_ollama_direct(prompt, SIMPLE_CHAT_MODEL), SIMPLE_CHAT_MODEL),
    "complex_task": (lambda prompt: execute_claude_task(prompt), "claude-sonnet-4-6"),
}


def classify_prompt(prompt_text: str) -> dict:
    """Fragt das Router-Modell und gibt die Klassifizierung zurück."""
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": ROUTER_MODEL,
                "messages": [
                    {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt_text}
                ],
                "stream": False
            },
            timeout=120
        )
        response.raise_for_status()
        content = response.json()["message"]["content"].strip()

        # JSON aus der Antwort extrahieren
        start = content.find("{")
        end = content.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(content[start:end])

    except Exception as e:
        print(f"[Router] Fehler bei Klassifizierung: {e}")

    # Fallback
    return {"route": "simple_chat", "reason": "Fallback"}


def route_prompt(prompt_text: str, forced_model: str = None, system_prompt_override: str = None) -> tuple[str, str]:
    """
    Gibt (result, model_used) zurück.
    forced_model: wenn gesetzt, wird der Router übersprungen.
    system_prompt_override: Persona-System-Prompt von einem AI Buddy.
    """
    if forced_model:
        if forced_model == "openclaw":
            return execute_openclaw_task(prompt_text), "openclaw"
        elif forced_model.startswith("claude"):
            return execute_claude_task(prompt_text, forced_model), forced_model
        else:
            return execute_ollama_direct(prompt_text, forced_model, system_prompt=system_prompt_override), forced_model

    # Router entscheidet
    classification = classify_prompt(prompt_text)
    route = classification.get("route", "simple_chat")
    reason = classification.get("reason", "")
    print(f"[Router] Route: {route} | Grund: {reason}")

    if system_prompt_override:
        # Buddy-Persona überschreibt den Handler direkt
        return execute_ollama_direct(prompt_text, SIMPLE_CHAT_MODEL, system_prompt=system_prompt_override), SIMPLE_CHAT_MODEL

    handler, model_used = ROUTE_TO_HANDLER.get(route, ROUTE_TO_HANDLER["simple_chat"])
    return handler(prompt_text), model_used
