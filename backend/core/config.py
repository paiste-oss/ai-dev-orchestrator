from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Datenbank
    database_url: str
    postgres_password: str = "aibuddy"

    # Redis / Celery
    redis_url: str
    celery_broker_url: str
    celery_result_backend: str

    # Qdrant
    qdrant_host: str = "qdrant"
    qdrant_port: int = 6333

    # Ollama
    ollama_base_url: str
    ollama_router_model: str = "phi3"
    ollama_chat_model: str = "gemma3:12b"
    ollama_code_model: str = "gemma3:12b"

    # Anthropic
    anthropic_api_key: str = ""

    # AWS Bedrock (Datensouveränität — Daten bleiben in EU/Zürich)
    # Wenn use_bedrock=true: alle Claude-Calls laufen über AWS eu-central-2
    # statt direkt zu Anthropic (USA)
    use_bedrock: bool = False
    aws_bedrock_api_key: str = ""   # Bedrock API Key (Bearer Token — einfachste Auth)
    aws_access_key_id: str = ""     # Alternative: klassische IAM-Credentials
    aws_secret_access_key: str = ""
    aws_region: str = "eu-central-2"

    # External LLMs (KI-Chat Funktion)
    gemini_api_key: str = ""
    openai_api_key: str = ""

    # ElevenLabs TTS
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "EXAVITQu4vr4xnSDxMaL"  # "Sarah" — Standard-Stimme

    # Browserless.io — Web Automation
    browserless_token: str = ""
    browserless_url: str = "https://chrome.browserless.io"

    # Exa Web Search
    exa_api_key: str = ""

    # Unsplash Bildsuche
    unsplash_access_key: str = ""

    # GitHub
    github_token: str = ""
    github_repo: str = "paiste-oss/ai-dev-orchestrator"

    # n8n (Microservice-Executor — kein zentraler Router)
    n8n_base_url: str
    n8n_api_key: str = ""
    n8n_webhook_secret: str = ""  # Shared Secret für POST /v1/agent/event
    n8n_encryption_key: str = ""  # AES-Key aus /n8n_data/config (für Credential-Entschlüsselung)

    # Credentials-Verschlüsselung (Fernet Key — einmalig generieren mit: Fernet.generate_key())
    credentials_encryption_key: str

    # Google OAuth2
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/v1/oauth/google/callback"

    # Frontend URL (für OAuth-Redirect nach Google-Login)
    frontend_url: str = "http://localhost:3000"

    # Stripe Billing
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    # Bankverbindung (für Banküberweisungs-Topup)
    company_iban: str = ""
    company_name: str = "Baddi AG"
    stripe_price_basis_monthly: str = ""      # z.B. price_xxx
    stripe_price_basis_yearly: str = ""
    stripe_price_komfort_monthly: str = ""
    stripe_price_komfort_yearly: str = ""
    stripe_price_premium_monthly: str = ""
    stripe_price_premium_yearly: str = ""
    # Storage Add-on Stripe Price IDs (recurring monthly — in Stripe-Dashboard anlegen)
    stripe_price_storage_10gb: str = ""
    stripe_price_storage_50gb: str = ""
    stripe_price_storage_500gb: str = ""

    # System-SMTP (für automatische Benachrichtigungen: Kurs-Alerts etc.)
    # Brevo: smtp-relay.brevo.com:587, User=E-Mail, Password=API-Key
    system_smtp_host: str = ""
    system_smtp_port: int = 587
    system_smtp_user: str = ""
    system_smtp_password: str = ""
    system_smtp_from: str = "noreply@baddi.ch"

    # Dev Orchestrator — Projekt-Root im Container
    project_root: str = "/project"

    # Claude Code Runner — WSL-Dienst Secret
    runner_secret: str = ""

    # JWT
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 Tage

    class Config:
        extra = "ignore"


settings = Settings()
