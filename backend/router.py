import httpx
import json
from agents import (
    execute_ollama_direct,
    execute_agent_with_tools,
    execute_claude_task,
)
from core.config import settings

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

def _chat_model():
    return settings.ollama_chat_model

def _code_model():
    return settings.ollama_code_model

ROUTE_TO_HANDLER = {
    "simple_chat":  (lambda prompt: execute_ollama_direct(prompt, _chat_model()), _chat_model()),
    "code_task":    (lambda prompt: execute_agent_with_tools(prompt, _code_model()), _code_model()),
    "save_data":    (lambda prompt: execute_ollama_direct(prompt, _chat_model()), _chat_model()),
    "automation":   (lambda prompt: execute_ollama_direct(prompt, _chat_model()), _chat_model()),
    "complex_task": (lambda prompt: execute_claude_task(prompt), "claude-sonnet-4-6"),
}


def classify_prompt(prompt_text: str) -> dict:
    """Fragt das Router-Modell und gibt die Klassifizierung zurück."""
    try:
        response = httpx.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": settings.ollama_router_model,
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
        if forced_model.startswith("claude"):
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
        model = _chat_model()
        return execute_ollama_direct(prompt_text, model, system_prompt=system_prompt_override), model

    handler, model_used = ROUTE_TO_HANDLER.get(route, ROUTE_TO_HANDLER["simple_chat"])
    return handler(prompt_text), model_used
