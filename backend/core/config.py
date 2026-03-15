from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://aibuddy:aibuddy@postgres:5432/aibuddy"
    postgres_password: str = "aibuddy"

    # Redis / Celery
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/1"

    # Qdrant
    qdrant_host: str = "qdrant"
    qdrant_port: int = 6333

    # Ollama
    ollama_base_url: str = "http://host.docker.internal:11434"

    # Anthropic
    anthropic_api_key: str = ""

    # n8n
    n8n_base_url: str = "http://n8n:5678"
    n8n_api_key: str = ""

    # JWT
    secret_key: str = "changeme-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24h

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
