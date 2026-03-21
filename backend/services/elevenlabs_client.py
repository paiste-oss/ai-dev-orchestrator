"""ElevenLabs Text-to-Speech Client."""
import httpx
from core.config import settings


async def synthesize(text: str, voice_id: str | None = None) -> bytes:
    """
    Konvertiert Text zu Sprache via ElevenLabs API.
    Gibt audio/mpeg Bytes zurück.
    """
    if not settings.elevenlabs_api_key:
        raise ValueError("ElevenLabs API Key nicht konfiguriert.")

    vid = voice_id or settings.elevenlabs_voice_id

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                },
            },
        )
        resp.raise_for_status()
        return resp.content
