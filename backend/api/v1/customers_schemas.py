import uuid
from datetime import datetime, date
from pydantic import BaseModel


class CustomerCreate(BaseModel):
    name: str
    email: str
    password: str = ""


class CustomerOut(BaseModel):
    id: uuid.UUID
    name: str
    first_name: str | None = None
    last_name: str | None = None
    email: str
    role: str
    is_active: bool
    created_at: datetime
    birth_year: int | None = None
    birth_date: date | None = None
    # Kontakt
    phone: str | None = None
    phone_secondary: str | None = None

    # Adresse
    address_street: str | None = None
    address_zip: str | None = None
    address_city: str | None = None
    address_country: str | None = None

    # Rechnungsadresse
    billing_same_as_address: bool = True
    billing_street: str | None = None
    billing_zip: str | None = None
    billing_city: str | None = None
    billing_country: str | None = None

    # Beruf & Umfeld
    workplace: str | None = None
    job_title: str | None = None
    language: str | None = None
    notes: str | None = None
    interests: list | None = None
    memory_consent: bool = True
    notification_channel: str = "sms"
    subscription_plan_name: str | None = None
    subscription_status: str | None = None

    class Config:
        from_attributes = True


class CustomerUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    is_active: bool | None = None

    # Kontakt
    phone: str | None = None
    phone_secondary: str | None = None

    # Adresse
    address_street: str | None = None
    address_zip: str | None = None
    address_city: str | None = None
    address_country: str | None = None

    # Beruf & Umfeld
    workplace: str | None = None
    job_title: str | None = None
    language: str | None = None
    notes: str | None = None
    interests: list | None = None
    memory_consent: bool | None = None
    notification_channel: str | None = None   # 'sms' | 'email'


class SelfUpdateRequest(BaseModel):
    name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    language: str | None = None
    phone: str | None = None
    address_street: str | None = None
    address_zip: str | None = None
    address_city: str | None = None
    address_country: str | None = None
    billing_same_as_address: bool | None = None
    billing_street: str | None = None
    billing_zip: str | None = None
    billing_city: str | None = None
    billing_country: str | None = None
    memory_consent: bool | None = None
    notification_channel: str | None = None   # 'sms' | 'email'


class CustomerListResponse(BaseModel):
    items: list[CustomerOut]
    total: int
    page: int
    page_size: int


class CredentialSave(BaseModel):
    data: dict


class NoteCreate(BaseModel):
    text: str


# ─── Credential-Schemas (für den Kunden-Kontext) ──────────────────────────────

# Welche Services unterstützt werden und welche Felder sie brauchen
SERVICE_SCHEMAS: dict[str, dict] = {
    "smtp": {
        "label": "E-Mail (SMTP)",
        "icon": "📧",
        "fields": [
            {"key": "host",     "label": "SMTP-Server",    "placeholder": "smtp.gmail.com",    "type": "text"},
            {"key": "port",     "label": "Port",           "placeholder": "587",               "type": "number"},
            {"key": "username", "label": "Benutzername",   "placeholder": "deine@email.ch",    "type": "text"},
            {"key": "password", "label": "Passwort",       "placeholder": "",                  "type": "password"},
        ],
    },
    "google": {
        "label": "Google (OAuth)",
        "icon": "🔵",
        "fields": [
            {"key": "client_id",     "label": "Client ID",     "placeholder": "", "type": "text"},
            {"key": "client_secret", "label": "Client Secret", "placeholder": "", "type": "password"},
            {"key": "refresh_token", "label": "Refresh Token", "placeholder": "", "type": "password"},
        ],
    },
    "twitter_x": {
        "label": "X / Twitter",
        "icon": "🐦",
        "fields": [
            {"key": "api_key",         "label": "API Key",         "placeholder": "", "type": "text"},
            {"key": "api_secret",      "label": "API Secret",      "placeholder": "", "type": "password"},
            {"key": "access_token",    "label": "Access Token",    "placeholder": "", "type": "password"},
            {"key": "access_secret",   "label": "Access Secret",   "placeholder": "", "type": "password"},
        ],
    },
    "facebook": {
        "label": "Facebook / Meta",
        "icon": "👤",
        "fields": [
            {"key": "page_id",      "label": "Seiten-ID",     "placeholder": "", "type": "text"},
            {"key": "access_token", "label": "Access Token",  "placeholder": "", "type": "password"},
        ],
    },
    "whatsapp": {
        "label": "WhatsApp Business",
        "icon": "💬",
        "fields": [
            {"key": "phone_number_id", "label": "Telefonnummer-ID", "placeholder": "", "type": "text"},
            {"key": "access_token",    "label": "Access Token",     "placeholder": "", "type": "password"},
        ],
    },
    "slack": {
        "label": "Slack",
        "icon": "💼",
        "fields": [
            {"key": "webhook_url", "label": "Webhook URL", "placeholder": "https://hooks.slack.com/…", "type": "text"},
        ],
    },
    "twilio": {
        "label": "Twilio (SMS/Anrufe)",
        "icon": "📞",
        "fields": [
            {"key": "account_sid", "label": "Account SID", "placeholder": "", "type": "text"},
            {"key": "auth_token",  "label": "Auth Token",  "placeholder": "", "type": "password"},
            {"key": "from_number", "label": "Absender-Nr.", "placeholder": "+41…", "type": "text"},
        ],
    },
    "instagram": {
        "label": "Instagram",
        "icon": "📸",
        "fields": [
            {"key": "access_token", "label": "Access Token", "placeholder": "", "type": "password"},
            {"key": "account_id",   "label": "Konto-ID",     "placeholder": "", "type": "text"},
        ],
    },
}


# ─── Modellpreise CHF / 1k Tokens (Blended in+out, gerundet) ─────────────────
#
# Quellen: Anthropic/Google/OpenAI Preislisten (Stand 2026-03)
# Lokale Modelle: Schätzung auf Basis 200W GPU, 0.10 CHF/kWh, ~1M Tokens/h
#
MODEL_CHF_PER_1K: dict[str, float] = {
    # Anthropic
    "claude-opus-4-6":              0.045,
    "claude-sonnet-4-6":            0.009,
    "claude-haiku-4-5-20251001":    0.0008,
    "claude-haiku-4-5":             0.0008,
    # Google
    "gemini-2.0-flash":             0.0002,
    "gemini-1.5-flash":             0.0002,
    "gemini-1.5-pro":               0.002,
    # OpenAI
    "gpt-4o":                       0.005,
    "gpt-4o-mini":                  0.0002,
    # Lokal (Ollama)
    "gemma3:12b":                   0.00002,
    "gemma3:4b":                    0.00002,
    "mistral":                      0.00002,
    "llama3":                       0.00002,
    "llama3.1":                     0.00002,
}

MODEL_TYPE: dict[str, str] = {
    "gemma3:12b": "lokal", "gemma3:4b": "lokal",
    "mistral": "lokal", "llama3": "lokal", "llama3.1": "lokal",
}
