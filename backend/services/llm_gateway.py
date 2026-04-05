"""
LLM Gateway — routes chat requests to Claude, Gemini oder OpenAI.
Priorität: Claude (Bedrock EU oder Anthropic direkt) → Gemini → OpenAI

Gibt ChatResult zurück mit response-Text + Token-Counts.

Bedrock-Modus: USE_BEDROCK=true → Calls über AWS eu-central-1 (Frankfurt).
Daten verlassen die EU nicht.
"""
import logging
import httpx
from dataclasses import dataclass
from core.config import settings, BEDROCK_MODEL_MAP
from core.clients import get_anthropic_async, get_bedrock_client

_log = logging.getLogger(__name__)


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
    """
    Send a conversation to Claude and return ChatResult.
    Nutzt AWS Bedrock (EU) wenn USE_BEDROCK=true, sonst direkt Anthropic.
    """
    all_messages = [m for m in messages if m.get("role") in ("user", "assistant")]

    if settings.use_bedrock and settings.aws_access_key_id:
        return await _chat_bedrock(all_messages, system_prompt, model)
    return await _chat_anthropic_direct(all_messages, system_prompt, model)


async def _chat_anthropic_direct(
    messages: list[dict],
    system_prompt: str | None,
    model: str,
) -> ChatResult:
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY ist nicht konfiguriert.")

    kwargs: dict = {"model": model, "max_tokens": 2048, "messages": messages}
    if system_prompt:
        kwargs["system"] = system_prompt

    try:
        response = await get_anthropic_async().messages.create(**kwargs)
    except Exception as e:
        _log.error("Anthropic API-Fehler (Modell: %s): %s", model, e)
        raise RuntimeError(f"Anthropic API nicht erreichbar: {e}") from e

    try:
        text = "".join(b.text for b in response.content if hasattr(b, "text"))
        return ChatResult(
            text=text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )
    except (AttributeError, TypeError) as e:
        _log.error("Anthropic Antwort-Format unerwartet: %s", e)
        raise ValueError(f"Unerwartetes Anthropic Antwort-Format: {e}") from e


async def _chat_bedrock(
    messages: list[dict],
    system_prompt: str | None,
    model: str,
) -> ChatResult:
    """Sendet Chat-Request über AWS Bedrock (Daten bleiben in EU/Zürich)."""
    bedrock_model = BEDROCK_MODEL_MAP.get(model, model)

    # Variante A: Bedrock API Key (Bearer Token — einfacherer Setup)
    if settings.aws_bedrock_api_key:
        url = (
            f"https://bedrock-runtime.{settings.aws_region}.amazonaws.com"
            f"/model/{bedrock_model}/invoke"
        )
        payload: dict = {"max_tokens": 2048, "messages": messages, "anthropic_version": "bedrock-2023-05-31"}
        if system_prompt:
            payload["system"] = system_prompt

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {settings.aws_bedrock_api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.TimeoutException as e:
            _log.error("Bedrock API Timeout (Modell: %s): %s", bedrock_model, e)
            raise RuntimeError("Bedrock API Timeout") from e
        except httpx.HTTPStatusError as e:
            _log.error("Bedrock API HTTP-Fehler %s (Modell: %s): %s", e.response.status_code, bedrock_model, e)
            raise RuntimeError(f"Bedrock API Fehler: HTTP {e.response.status_code}") from e
        except Exception as e:
            _log.error("Bedrock API nicht erreichbar (Modell: %s): %s", bedrock_model, e)
            raise RuntimeError(f"Bedrock API nicht erreichbar: {e}") from e

        try:
            text = data["content"][0]["text"]
            usage = data.get("usage", {})
            return ChatResult(
                text=text,
                input_tokens=usage.get("inputTokens", 0),
                output_tokens=usage.get("outputTokens", 0),
            )
        except (KeyError, IndexError, TypeError) as e:
            _log.error("Bedrock Antwort-Format unerwartet: %s | Data: %s", e, str(data)[:200])
            raise ValueError(f"Unerwartetes Bedrock Antwort-Format: {e}") from e

    # Variante B: IAM Access Key + Secret — via SDK
    kwargs: dict = {"model": bedrock_model, "max_tokens": 2048, "messages": messages}
    if system_prompt:
        kwargs["system"] = system_prompt

    try:
        response = await get_bedrock_client().messages.create(**kwargs)
        text = "".join(b.text for b in response.content if hasattr(b, "text"))
        return ChatResult(
            text=text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )
    except Exception as e:
        _log.error("Bedrock SDK-Fehler (Modell: %s): %s", bedrock_model, e)
        raise RuntimeError(f"Bedrock SDK nicht erreichbar: {e}") from e


async def chat_with_gemini(
    messages: list[dict],
    system_prompt: str | None = None,
    model: str = "gemini-2.5-flash",
) -> ChatResult:
    """Send a conversation to Google Gemini and return ChatResult."""
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY ist nicht konfiguriert.")

    contents = [
        {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
        for m in messages
        if m.get("role") in ("user", "assistant")
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

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException as e:
        _log.error("Gemini API Timeout (Modell: %s): %s", model, e)
        raise RuntimeError("Gemini API Timeout") from e
    except httpx.HTTPStatusError as e:
        _log.error("Gemini API HTTP-Fehler %s: %s", e.response.status_code, e)
        raise RuntimeError(f"Gemini API Fehler: HTTP {e.response.status_code}") from e
    except Exception as e:
        _log.error("Gemini API nicht erreichbar: %s", e)
        raise RuntimeError(f"Gemini API nicht erreichbar: {e}") from e

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        meta = data.get("usageMetadata", {})
        return ChatResult(
            text=text,
            input_tokens=meta.get("promptTokenCount", 0),
            output_tokens=meta.get("candidatesTokenCount", 0),
        )
    except (KeyError, IndexError, TypeError) as exc:
        _log.error("Gemini Antwort-Format unerwartet: %s | Data: %s", exc, str(data)[:200])
        raise ValueError(f"Unerwartetes Gemini Antwort-Format: {exc}") from exc


async def chat_with_openai(
    messages: list[dict],
    system_prompt: str | None = None,
    model: str = "gpt-4o-mini",
) -> ChatResult:
    """Send a conversation to OpenAI ChatGPT and return ChatResult."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY ist nicht konfiguriert.")

    all_messages: list[dict] = []
    if system_prompt:
        all_messages.append({"role": "system", "content": system_prompt})
    all_messages.extend(messages)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": model, "messages": all_messages, "temperature": 0.7},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException as e:
        _log.error("OpenAI API Timeout (Modell: %s): %s", model, e)
        raise RuntimeError("OpenAI API Timeout") from e
    except httpx.HTTPStatusError as e:
        _log.error("OpenAI API HTTP-Fehler %s: %s", e.response.status_code, e)
        raise RuntimeError(f"OpenAI API Fehler: HTTP {e.response.status_code}") from e
    except Exception as e:
        _log.error("OpenAI API nicht erreichbar: %s", e)
        raise RuntimeError(f"OpenAI API nicht erreichbar: {e}") from e

    try:
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return ChatResult(
            text=text,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
        )
    except (KeyError, IndexError, TypeError) as exc:
        _log.error("OpenAI Antwort-Format unerwartet: %s | Data: %s", exc, str(data)[:200])
        raise ValueError(f"Unerwartetes OpenAI Antwort-Format: {exc}") from exc
