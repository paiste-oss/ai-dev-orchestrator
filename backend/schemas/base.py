"""
Basis-Schema für alle Pydantic Response-Modelle.

Ersetzt den wiederholten `class Config: from_attributes = True` Block
in 15+ Schemas durch eine gemeinsame Basisklasse.

Verwendung:
    from schemas.base import BaseAPIModel

    class DocumentOut(BaseAPIModel):
        id: uuid.UUID
        filename: str
        # Kein Config-Block nötig!
"""
from pydantic import BaseModel, ConfigDict


class BaseAPIModel(BaseModel):
    """Basisklasse für alle API Response-Modelle mit ORM-Support."""
    model_config = ConfigDict(from_attributes=True)
