"""
LLM Gateway — routes chat requests to Gemini or OpenAI.
Both use direct REST (httpx) to avoid heavy SDK dependencies.
"""
import httpx
from core.config import settings


async def chat_with_gemini(
    messages: list[dict],
    system_prompt: str | None = None,
    model: str = "gemini-2.0-flash",
) -> str:
    """Send a conversation to Google Gemini and return the response text."""
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not configured in the environment.")

    # Gemini uses role "model" instead of "assistant"
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
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise ValueError(f"Unexpected Gemini response structure: {data}") from exc


async def chat_with_openai(
    messages: list[dict],
    system_prompt: str | None = None,
    model: str = "gpt-4o-mini",
) -> str:
    """Send a conversation to OpenAI ChatGPT and return the response text."""
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
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise ValueError(f"Unexpected OpenAI response structure: {data}") from exc
