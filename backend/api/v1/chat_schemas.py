"""Chat API — Pydantic Schemas."""
from typing import Any
from pydantic import BaseModel


class ImageAttachment(BaseModel):
    data: str
    media_type: str


class CanvasArtifact(BaseModel):
    """Zustand eines geöffneten Artifacts im rechten Panel."""
    type: str                          # z.B. "netzwerk", "stock_history", "chart"
    title: str                         # z.B. "📊 Kursverlauf NVDA"
    data: dict[str, Any] | None = None # Artifact-Daten (binäre Felder bereits entfernt)
    active: bool = False               # Ist dieses Artifact gerade sichtbar?


class ChatRequest(BaseModel):
    message: str
    images: list[ImageAttachment] | None = None
    document_ids: list[str] | None = None
    canvas_context: list[CanvasArtifact] | None = None  # Aktuelle Artifact-Panel-Inhalte


class ChatResponse(BaseModel):
    message_id: str
    response: str
    provider: str
    model: str
    image_urls: list[str] | None = None
    response_type: str = "text"
    structured_data: dict[str, Any] | None = None
    ui_update: dict[str, Any] | None = None
    emotion: str | None = None


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    provider: str | None
    model: str | None
    created_at: str


class MemoryOut(BaseModel):
    id: str
    content: str
    importance: float
    category: str
    created_at: str


class TTSRequest(BaseModel):
    text: str
    voice_id: str | None = None


class BrowserActionRequest(BaseModel):
    action: dict[str, Any]
    lang: str = "de-CH,de;q=0.9"   # Accept-Language für Browserless
