"""
LLM Gateway — routes chat requests to Claude, Gemini oder OpenAI.
Priorität: Claude (Bedrock EU oder Anthropic direkt) → Gemini → OpenAI

Gibt ChatResult zurück mit response-Text + Token-Counts.

Bedrock-Modus: USE_BEDROCK=true → Calls über AWS eu-central-1 (Frankfurt).
Daten verlassen die EU nicht.
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


# Mapping Anthropic-Modellname → Bedrock-ID (EU cross-region inference)
_BEDROCK_MODEL_MAP = {
    "claude-haiku-4-5-20251001":  "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    "claude-sonnet-4-6":          "eu.anthropic.claude-sonnet-4-6-20250514-v1:0",
    "claude-sonnet-4-5":          "eu.anthropic.claude-sonnet-4-5-20251001-v1:0",
    "claude-3-5-haiku-20241022":  "eu.anthropic.claude-3-5-haiku-20241022-v1:0",
    "claude-3-5-sonnet-20241022": "eu.anthropic.claude-3-5-sonnet-20241022-v2:0",
}


async def chat_with_claude(
    messages: list[dict],
    system_prompt: str | None = None,
    model: str = "claude-haiku-4-5-20251001",
) -> ChatResult:
    """
    Send a conversation to Claude and return ChatResult.
    Nutzt AWS Bedrock (EU) wenn USE_BEDROCK=true, sonst direkt Anthropic.
    """
    all_messages = [m for m in messages if m["role"] in ("user", "assistant")]

    if settings.use_bedrock and settings.aws_access_key_id:
        return await _chat_bedrock(all_messages, system_prompt, model)
    return await _chat_anthropic_direct(all_messages, system_prompt, model)


async def _chat_anthropic_direct(
    messages: list[dict],
    system_prompt: str | None,
    model: str,
) -> ChatResult:
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY is not configured in the environment.")

    payload: dict = {"model": model, "max_tokens": 2048, "messages": messages}
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


async def _chat_bedrock(
    messages: list[dict],
    system_prompt: str | None,
    model: str,
) -> ChatResult:
    """Sendet Chat-Request über AWS Bedrock (Daten bleiben in EU)."""
    import anthropic as _anthropic
    bedrock_model = _BEDROCK_MODEL_MAP.get(model, model)

    client = _anthropic.AnthropicBedrock(
        aws_access_key=settings.aws_access_key_id,
        aws_secret_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
    )
    kwargs: dict = {
        "model": bedrock_model,
        "max_tokens": 2048,
        "messages": messages,
    }
    if system_prompt:
        kwargs["system"] = system_prompt

    response = client.messages.create(**kwargs)
    text = "".join(b.text for b in response.content if hasattr(b, "text"))
    usage = response.usage
    return ChatResult(
        text=text,
        input_tokens=getattr(usage, "input_tokens", 0),
        output_tokens=getattr(usage, "output_tokens", 0),
    )


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
