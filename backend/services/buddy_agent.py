"""
Buddy Agent — Führt Chats mit Anthropic Tool Use aus.

Ablauf:
  1. Lade die dem Buddy zugewiesenen Tools
  2. Sende Nachricht + Tool-Definitionen an Claude
  3. Wenn Claude ein Tool aufruft → ausführen → Ergebnis zurück an Claude
  4. Wiederhole bis Claude fertig ist (kein tool_use mehr)

Wird nur verwendet wenn der Buddy mindestens ein Tool hat.
Ohne Tools läuft der Chat über route_prompt() (Ollama, kein Tool Use).
"""
import json
import anthropic
from typing import Any
from core.config import settings
from services.tool_registry import get_tool_defs, call_tool

_CLIENT = None


def _get_client() -> anthropic.Anthropic:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _CLIENT


async def run_buddy_chat(
    message: str,
    buddy_name: str,
    system_prompt: str,
    tool_keys: list[str],
    model: str = "claude-sonnet-4-6",
    max_tool_rounds: int = 5,
    history: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Führt einen Chat-Turn mit Tool Use durch.

    Args:
        history: Bisheriger Gesprächsverlauf (ohne aktuelle Nachricht)

    Returns:
        {"output": str, "model_used": str, "tool_calls": list}
    """
    client = _get_client()
    tool_defs = get_tool_defs(tool_keys)

    messages = list(history) if history else []
    messages.append({"role": "user", "content": message})
    tool_calls_log = []

    for _ in range(max_tool_rounds):
        kwargs = {
            "model": model,
            "max_tokens": 2048,
            "system": system_prompt,
            "messages": messages,
        }
        if tool_defs:
            kwargs["tools"] = tool_defs

        response = client.messages.create(**kwargs)

        # Antwort auswerten
        if response.stop_reason == "end_turn":
            # Fertig — kein Tool-Call mehr
            text = _extract_text(response.content)
            return {
                "output": text,
                "model_used": model,
                "tool_calls": tool_calls_log,
            }

        if response.stop_reason == "tool_use":
            # Tool-Calls ausführen
            assistant_content = response.content
            messages.append({"role": "assistant", "content": assistant_content})

            tool_results = []
            for block in assistant_content:
                if block.type == "tool_use":
                    result = await call_tool(block.name, block.input)
                    tool_calls_log.append({
                        "tool": block.name,
                        "input": block.input,
                        "result": result,
                    })
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result, ensure_ascii=False, default=str),
                    })

            messages.append({"role": "user", "content": tool_results})
            continue

        # Unbekannter Stop-Grund
        break

    # Fallback: letzter Text aus der letzten Antwort
    text = _extract_text(response.content) if response else "Keine Antwort erhalten."
    return {
        "output": text,
        "model_used": model,
        "tool_calls": tool_calls_log,
    }


def _extract_text(content_blocks) -> str:
    parts = []
    for block in content_blocks:
        if hasattr(block, "type") and block.type == "text":
            parts.append(block.text)
    return "\n".join(parts).strip()
