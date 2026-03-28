"""
Integrations Admin API — Übersicht aller externen Dienste, Webhooks und API Keys.

GET /v1/admin/integrations → Status aller konfigurierten Integrationen
"""
import os
from fastapi import APIRouter, Depends
from models.customer import Customer
from core.dependencies import require_admin

router = APIRouter(prefix="/v1/admin/integrations", tags=["admin-integrations"])


def _set(key: str) -> bool:
    val = os.environ.get(key, "")
    return bool(val and val not in ("NA", "none", "null"))


@router.get("")
async def get_integrations(_: Customer = Depends(require_admin)):
    return {
        "webhooks": [
            {
                "name": "Stripe",
                "url": "https://api.baddi.ch/v1/billing/webhook",
                "description": "Zahlungsereignisse (Abo-Start, Verlängerung, Kündigung)",
                "manage_url": "https://dashboard.stripe.com/webhooks",
                "keys": ["STRIPE_WEBHOOK_SECRET"],
            },
        ],
        "services": [
            {
                "category": "KI",
                "items": [
                    {
                        "name": "Anthropic (Claude)",
                        "keys": ["ANTHROPIC_API_KEY"],
                        "manage_url": "https://console.anthropic.com/settings/keys",
                    },
                    {
                        "name": "OpenAI (DALL-E)",
                        "keys": ["OPENAI_API_KEY"],
                        "manage_url": "https://platform.openai.com/api-keys",
                    },
                    {
                        "name": "Google Gemini",
                        "keys": ["GEMINI_API_KEY"],
                        "manage_url": "https://aistudio.google.com/app/apikey",
                    },
                    {
                        "name": "AWS Bedrock",
                        "keys": ["AWS_BEDROCK_API_KEY", "AWS_REGION"],
                        "manage_url": "https://eu-central-2.console.aws.amazon.com/bedrock",
                    },
                    {
                        "name": "Exa Search",
                        "keys": ["EXA_API_KEY"],
                        "manage_url": "https://dashboard.exa.ai/api-keys",
                    },
                ],
            },
            {
                "category": "Medien",
                "items": [
                    {
                        "name": "ElevenLabs (TTS)",
                        "keys": ["ELEVENLABS_API_KEY"],
                        "manage_url": "https://elevenlabs.io/app/settings/api-keys",
                    },
                    {
                        "name": "Unsplash (Bilder)",
                        "keys": ["UNSPLASH_ACCESS_KEY"],
                        "manage_url": "https://unsplash.com/oauth/applications",
                    },
                ],
            },
            {
                "category": "Billing",
                "items": [
                    {
                        "name": "Stripe",
                        "keys": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
                        "manage_url": "https://dashboard.stripe.com/apikeys",
                    },
                ],
            },
            {
                "category": "Kommunikation",
                "items": [
                    {
                        "name": "Twilio (SMS / 2FA)",
                        "keys": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
                        "manage_url": "https://console.twilio.com",
                    },
                    {
                        "name": "SMTP (E-Mail)",
                        "keys": ["SYSTEM_SMTP_HOST", "SYSTEM_SMTP_USER", "SYSTEM_SMTP_PASSWORD"],
                        "manage_url": None,
                    },
                ],
            },
            {
                "category": "Infrastruktur",
                "items": [
                    {
                        "name": "GitHub",
                        "keys": ["GITHUB_TOKEN"],
                        "manage_url": "https://github.com/settings/tokens",
                    },
                    {
                        "name": "Cloudflare Tunnel",
                        "keys": ["CLOUDFLARE_TUNNEL_TOKEN"],
                        "manage_url": "https://one.dash.cloudflare.com/",
                    },
                    {
                        "name": "n8n",
                        "keys": ["N8N_API_KEY", "N8N_BASE_URL"],
                        "manage_url": None,
                    },
                    {
                        "name": "Google OAuth2",
                        "keys": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
                        "manage_url": "https://console.cloud.google.com/apis/credentials",
                    },
                ],
            },
        ],
        # Welche Keys sind gesetzt?
        "key_status": {
            key: _set(key)
            for key in [
                "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
                "AWS_BEDROCK_API_KEY", "AWS_REGION", "EXA_API_KEY",
                "ELEVENLABS_API_KEY", "UNSPLASH_ACCESS_KEY",
                "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
                "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER",
                "SYSTEM_SMTP_HOST", "SYSTEM_SMTP_USER", "SYSTEM_SMTP_PASSWORD",
                "GITHUB_TOKEN", "CLOUDFLARE_TUNNEL_TOKEN",
                "N8N_API_KEY", "N8N_BASE_URL",
                "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
            ]
        },
    }
