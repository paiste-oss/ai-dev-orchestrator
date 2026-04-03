"""
Audio-Transkription via faster-whisper (lokales Modell, kein API-Key nötig).
Endpoint: POST /v1/transcribe
"""
from __future__ import annotations

import os
import tempfile
import asyncio
import logging
from functools import lru_cache

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["transcribe"])

# Modell wird beim ersten Request geladen und dann gecacht
_model = None
_model_lock = asyncio.Lock()

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")  # tiny / base / small


def _load_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        logger.info(f"Lade Whisper-Modell '{WHISPER_MODEL}' ...")
        _model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        logger.info("Whisper-Modell geladen.")
    return _model


def _transcribe_sync(audio_path: str, language: str, prompt: str) -> str:
    model = _load_model()
    segments, _ = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        initial_prompt=prompt or None,
    )
    return "".join(seg.text for seg in segments).strip()


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    lang: str = Form(default="de"),
    prompt: str = Form(default=""),
):
    """
    Nimmt eine Audio-Datei entgegen und gibt den transkribierten Text zurück.
    Unterstützte Formate: webm, mp4, ogg, wav, mp3 (alles was ffmpeg kann).
    """
    # Sprach-Mapping: BCP47 → Whisper-Kürzel
    lang_map = {
        "de-CH": "de", "de-DE": "de", "de-AT": "de",
        "de": "de", "en": "en", "en-US": "en", "en-GB": "en",
        "fr": "fr", "fr-CH": "fr", "it": "it", "it-CH": "it",
    }
    whisper_lang = lang_map.get(lang, lang[:2])

    # Format aus Content-Type ermitteln, Dateiname als Fallback
    suffix = ".webm"
    ct = (audio.content_type or "").lower()
    fn = (audio.filename or "").lower()
    if "mp4" in ct or "mpeg" in ct or fn.endswith((".mp4", ".m4a")):
        suffix = ".mp4"
    elif "ogg" in ct or fn.endswith(".ogg"):
        suffix = ".ogg"
    elif "wav" in ct or fn.endswith(".wav"):
        suffix = ".wav"
    elif "webm" in ct or fn.endswith(".webm"):
        suffix = ".webm"
    logger.info("Transkription: content_type=%s filename=%s → suffix=%s lang=%s", ct, fn, suffix, whisper_lang)

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, _transcribe_sync, tmp_path, whisper_lang, prompt)
    except Exception as e:
        logger.error(f"Transkription fehlgeschlagen: {e}")
        raise HTTPException(status_code=500, detail=f"Transkription fehlgeschlagen: {e}")
    finally:
        os.unlink(tmp_path)

    return JSONResponse({"text": text})
