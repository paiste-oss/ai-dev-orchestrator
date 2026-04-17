"""
Buddy Agent — Führt Chats mit Claude Tool Use aus.

Claude erhält ALLE verfügbaren Tools und entscheidet selbst welches es nutzt.
Unterstützt zwei Backends:
  - AWS Bedrock (EU/Frankfurt) wenn USE_BEDROCK=true
  - Anthropic direkt (USA) als Fallback
"""
from __future__ import annotations
import json
import logging
import httpx
from typing import Any
from core.config import settings, BEDROCK_MODEL_MAP
from core.clients import get_anthropic_sync
from services.tool_registry import get_tool_defs, call_tool

_log = logging.getLogger(__name__)


async def run_buddy_chat(
    message: str,
    buddy_name: str,
    system_prompt: str,
    tool_keys: list[str],
    model: str = "claude-sonnet-4-6",
    max_tool_rounds: int = 5,
    history: list[dict] | None = None,
    customer_id: str | None = None,
) -> dict[str, Any]:
    """
    Führt einen Chat-Turn mit Tool Use durch.
    Claude entscheidet selbst ob und welches Tool es aufruft.

    Returns:
        {"output": str, "model_used": str, "tool_calls": list, "total_tokens": int}
    """
    tool_defs = get_tool_defs(tool_keys)
    _log.info("run_buddy_chat: %d tool_defs geladen: %s", len(tool_defs), [t["name"] for t in tool_defs])
    messages = list(history) if history else []
    messages.append({"role": "user", "content": message})

    if settings.use_bedrock and settings.aws_bedrock_api_key:
        return await _run_bedrock(messages, system_prompt, tool_defs, model, max_tool_rounds, customer_id)
    else:
        return await _run_anthropic(messages, system_prompt, tool_defs, model, max_tool_rounds, customer_id)


async def _run_bedrock(
    messages: list[dict],
    system_prompt: str,
    tool_defs: list[dict],
    model: str,
    max_tool_rounds: int,
    customer_id: str | None = None,
) -> dict[str, Any]:
    """Tool Use Loop über AWS Bedrock Bearer Token (Daten bleiben in EU)."""
    bedrock_model = BEDROCK_MODEL_MAP.get(model, model)
    url = (
        f"https://bedrock-runtime.{settings.aws_region}.amazonaws.com"
        f"/model/{bedrock_model}/invoke"
    )
    headers = {
        "Authorization": f"Bearer {settings.aws_bedrock_api_key}",
        "Content-Type": "application/json",
    }
    tool_calls_log: list[dict] = []
    content: list[dict] = []
    total_tokens = 0

    async with httpx.AsyncClient(timeout=60.0) as client:
        for _ in range(max_tool_rounds):
            payload: dict = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2048,
                "messages": messages,
            }
            if system_prompt:
                payload["system"] = system_prompt
            if tool_defs:
                payload["tools"] = tool_defs

            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

            usage = data.get("usage", {})
            total_tokens += usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

            stop_reason = data.get("stop_reason")
            content = data.get("content", [])

            if stop_reason == "end_turn":
                text = "".join(
                    b.get("text", "") for b in content if b.get("type") == "text"
                )
                return {"output": text, "model_used": model, "tool_calls": tool_calls_log, "total_tokens": total_tokens}

            if stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": content})
                tool_results = []
                for block in content:
                    if block.get("type") == "tool_use":
                        result = await call_tool(block["name"], block.get("input", {}), customer_id=customer_id)
                        tool_calls_log.append({
                            "tool": block["name"],
                            "input": block.get("input", {}),
                            "result": result,
                        })
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block["id"],
                            "content": json.dumps(result, ensure_ascii=False, default=str),
                        })
                messages.append({"role": "user", "content": tool_results})
                continue

            break

    text = "".join(b.get("text", "") for b in content if b.get("type") == "text")
    return {"output": text or "Keine Antwort erhalten.", "model_used": model, "tool_calls": tool_calls_log, "total_tokens": total_tokens}


async def _run_anthropic(
    messages: list[dict],
    system_prompt: str,
    tool_defs: list[dict],
    model: str,
    max_tool_rounds: int,
    customer_id: str | None = None,
) -> dict[str, Any]:
    """Tool Use Loop über Anthropic API direkt."""
    client = get_anthropic_sync()
    tool_calls_log: list[dict] = []
    total_tokens = 0
    response = None

    for _ in range(max_tool_rounds):
        kwargs: dict = {
            "model": model,
            "max_tokens": 2048,
            "system": system_prompt,
            "messages": messages,
        }
        if tool_defs:
            kwargs["tools"] = tool_defs

        response = client.messages.create(**kwargs)
        total_tokens += response.usage.input_tokens + response.usage.output_tokens

        if response.stop_reason == "end_turn":
            text = _extract_text(response.content)
            _log.info("Anthropic end_turn ohne Tool-Call. tools_called: %s", [tc["tool"] for tc in tool_calls_log])
            return {"output": text, "model_used": model, "tool_calls": tool_calls_log, "total_tokens": total_tokens}

        if response.stop_reason == "tool_use":
            assistant_content = response.content
            messages.append({"role": "assistant", "content": assistant_content})
            tool_results = []
            for block in assistant_content:
                if block.type == "tool_use":
                    _log.info("Tool-Call: %s input=%s", block.name, block.input)
                    result = await call_tool(block.name, block.input, customer_id=customer_id)
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

        break

    text = _extract_text(response.content) if response else "Keine Antwort erhalten."
    return {"output": text, "model_used": model, "tool_calls": tool_calls_log, "total_tokens": total_tokens}


def _extract_text(content_blocks) -> str:
    return "\n".join(
        block.text for block in content_blocks
        if hasattr(block, "type") and block.type == "text"
    ).strip()
