"""
Buddy Agent — Führt Chats mit Anthropic Tool Use aus.

Ablauf:
  1. Lade die dem Buddy zugewiesenen Tools
  2. Sende Nachricht + Tool-Definitionen an Claude
  3. Wenn Claude ein Tool aufruft → ausführen → Ergebnis zurück an Claude
  4. Wiederhole bis Claude fertig ist (kein tool_use mehr)

Wird nur verwendet wenn der Buddy mindestens ein Tool hat.
Ohne Tools läuft der Chat über route_prompt() (Ollama, kein Tool Use).

Bedrock-Modus: USE_BEDROCK=true → Calls laufen über AWS eu-central-1
statt direkt zu Anthropic (USA). Daten bleiben in der EU.
"""
import json
import anthropic
from typing import Any
from core.config import settings
from services.tool_registry import get_tool_defs, call_tool

# Mapping: Anthropic-Modellname → AWS Bedrock Modell-ID (eu-cross-region)
_BEDROCK_MODEL_MAP = {
    "claude-haiku-4-5-20251001":  "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    "claude-sonnet-4-6":          "eu.anthropic.claude-sonnet-4-6-20250514-v1:0",
    "claude-sonnet-4-5":          "eu.anthropic.claude-sonnet-4-5-20251001-v1:0",
    # Fallback auf bewährte Modelle falls neuere nicht verfügbar
    "claude-3-5-haiku-20241022":  "eu.anthropic.claude-3-5-haiku-20241022-v1:0",
    "claude-3-5-sonnet-20241022": "eu.anthropic.claude-3-5-sonnet-20241022-v2:0",
}

_CLIENT = None


def _get_client():
    """Gibt den passenden Client zurück: Bedrock (EU/Zürich) oder direkt Anthropic (USA)."""
    global _CLIENT
    if _CLIENT is None:
        if settings.use_bedrock and settings.aws_bedrock_api_key:
            # Bedrock API Key (Bearer Token) — einfachster Setup
            _CLIENT = anthropic.AnthropicBedrock(
                aws_region=settings.aws_region,
                # Bearer-Token-Auth via base_url + api_key
                base_url=f"https://bedrock-runtime.{settings.aws_region}.amazonaws.com",
                api_key=settings.aws_bedrock_api_key,
            )
        elif settings.use_bedrock and settings.aws_access_key_id:
            # IAM Access Key — klassische Auth
            _CLIENT = anthropic.AnthropicBedrock(
                aws_access_key=settings.aws_access_key_id,
                aws_secret_key=settings.aws_secret_access_key,
                aws_region=settings.aws_region,
            )
        else:
            _CLIENT = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _CLIENT


def _resolve_model(model: str) -> str:
    """Konvertiert Anthropic-Modellnamen zu Bedrock-ID wenn Bedrock aktiv."""
    if settings.use_bedrock:
        return _BEDROCK_MODEL_MAP.get(model, model)
    return model


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
    resolved_model = _resolve_model(model)

    messages = list(history) if history else []
    messages.append({"role": "user", "content": message})
    tool_calls_log = []

    for _ in range(max_tool_rounds):
        kwargs = {
            "model": resolved_model,
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
