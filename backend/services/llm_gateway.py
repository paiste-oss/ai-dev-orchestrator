"""
LLM Gateway — routes chat requests to Claude, Gemini oder OpenAI.
Priorität: Claude (Anthropic) → Gemini → OpenAI

Gibt ChatResult zurück mit response-Text + Token-Counts.
"""
import httpx
from dataclasses import dataclass
from core.config import settings


@dataclass
class ChatResult:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


async def chat_with_claude(
    messages: list[dict],
    system_prompt: str | None = None,
    model: str = "claude-haiku-4-5-20251001",
) -> ChatResult:
    """Send a conversation to Anthropic Claude and return ChatResult."""
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY is not configured in the environment.")

    all_messages = [m for m in messages if m["role"] in ("user", "assistant")]

    payload: dict = {
        "model": model,
        "max_tokens": 2048,
        "messages": all_messages,
    }
    if system_prompt:
        payload["system"] = system_prompt

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    try:
        text = data["content"][0]["text"]
        usage = data.get("usage", {})
        return ChatResult(
            text=text,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
        )
    except (KeyError, IndexError) as exc:
        raise ValueError(f"Unexpected Claude response structure: {data}") from exc


async def chat_with_gemini(
    messages: list[dict],
    system_prompt: str | None = None,
    model: str = "gemini-2.5-flash",
) -> ChatResult:
    """Send a conversation to Google Gemini and return ChatResult."""
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not configured in the environment.")

    contents = [
        {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
        for m in messages
        if m["role"] in ("user", "assistant")
    ]

    payload: dict = {
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
    }
    if system_prompt:
        payload["system_instruction"] = {"parts": [{"text": system_prompt}]}

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={settings.gemini_api_key}"
    )
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        meta = data.get("usageMetadata", {})
        return ChatResult(
            text=text,
            input_tokens=meta.get("promptTokenCount", 0),
            output_tokens=meta.get("candidatesTokenCount", 0),
        )
    except (KeyError, IndexError) as exc:
        raise ValueError(f"Unexpected Gemini response structure: {data}") from exc


async def chat_with_openai(
    messages: list[dict],
    system_prompt: str | None = None,
    model: str = "gpt-4o-mini",
) -> ChatResult:
    """Send a conversation to OpenAI ChatGPT and return ChatResult."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured in the environment.")

    all_messages: list[dict] = []
    if system_prompt:
        all_messages.append({"role": "system", "content": system_prompt})
    all_messages.extend(messages)

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={"model": model, "messages": all_messages, "temperature": 0.7},
        )
        resp.raise_for_status()
        data = resp.json()

    try:
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return ChatResult(
            text=text,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
        )
    except (KeyError, IndexError) as exc:
        raise ValueError(f"Unexpected OpenAI response structure: {data}") from exc
