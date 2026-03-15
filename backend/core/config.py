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
    ollama_chat_model: str = "mistral"
    ollama_code_model: str = "llama3.2"

    # Anthropic
    anthropic_api_key: str = ""

    # GitHub
    github_token: str = ""
    github_repo: str = "paiste-oss/ai-dev-orchestrator"

    # n8n (Microservice-Executor — kein zentraler Router)
    n8n_base_url: str
    n8n_api_key: str = ""
    n8n_webhook_secret: str = ""  # Shared Secret für POST /v1/agent/event

    # OpenClaw
    openclaw_token: str = ""
    openclaw_gateway_url: str = "ws://127.0.0.1:18789"

    # Credentials-Verschlüsselung (Fernet Key — einmalig generieren mit: Fernet.generate_key())
    credentials_encryption_key: str

    # Google OAuth2
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/v1/oauth/google/callback"

    # Frontend URL (für OAuth-Redirect nach Google-Login)
    frontend_url: str = "http://localhost:3000"

    # Dev Orchestrator — Projekt-Root im Container
    project_root: str = "/project"

    # JWT
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 Tage

    class Config:
        extra = "ignore"


settings = Settings()
