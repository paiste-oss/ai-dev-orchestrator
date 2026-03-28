"""
Zentrale LLM-Client-Factory.
Ersetzt duplizierte Singleton-Patterns in buddy_agent.py und llm_gateway.py.
"""
from __future__ import annotations
import anthropic as _anthropic
from core.config import settings

_sync_client:    _anthropic.Anthropic              | None = None
_async_client:   _anthropic.AsyncAnthropic         | None = None
_bedrock_client: _anthropic.AsyncAnthropicBedrock  | None = None


def get_anthropic_sync() -> _anthropic.Anthropic:
    """Gecachter synchroner Client — für buddy_agent (Tool-Use Loop)."""
    global _sync_client
    if _sync_client is None:
        _sync_client = _anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _sync_client


def get_anthropic_async() -> _anthropic.AsyncAnthropic:
    """Gecachter asynchroner Client — für llm_gateway (Chat)."""
    global _async_client
    if _async_client is None:
        _async_client = _anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _async_client


def get_bedrock_client() -> _anthropic.AsyncAnthropicBedrock:
    """Gecachter AWS Bedrock Client — Daten bleiben in EU/Zürich."""
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = _anthropic.AsyncAnthropicBedrock(
            aws_access_key=settings.aws_access_key_id,
            aws_secret_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
        )
    return _bedrock_client
