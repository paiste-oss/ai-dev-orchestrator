from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from core.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Neue Spalten sicher hinzufügen (idempotent)
        migrations = [
            "ALTER TABLE ai_buddies ADD COLUMN IF NOT EXISTS usecase_id VARCHAR",
            "ALTER TABLE ai_buddies ADD COLUMN IF NOT EXISTS avatar_url VARCHAR",
            "ALTER TABLE cost_entries ADD COLUMN IF NOT EXISTS balance_chf FLOAT",
            "ALTER TABLE cost_entries ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMP",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_year INTEGER",
            # Profil-Erweiterungen
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_secondary VARCHAR(50)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_street VARCHAR(200)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_zip VARCHAR(20)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_city VARCHAR(100)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_country VARCHAR(100) DEFAULT 'Schweiz'",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS workplace VARCHAR(200)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS job_title VARCHAR(100)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'de'",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS interests JSONB DEFAULT '[]'",
            "CREATE SEQUENCE IF NOT EXISTS baddi_number_seq START 0 MINVALUE 0",
            "ALTER TABLE ai_buddies ADD COLUMN IF NOT EXISTS baddi_number INTEGER UNIQUE DEFAULT nextval('baddi_number_seq')",
            # Backfill: bestehende Buddies ohne Nummer nachrüsten
            "UPDATE ai_buddies SET baddi_number = nextval('baddi_number_seq') WHERE baddi_number IS NULL",
            # Capability Requests (selbstentwickelndes Uhrwerk)
            """CREATE TABLE IF NOT EXISTS capability_requests (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                customer_id VARCHAR NOT NULL,
                buddy_id VARCHAR,
                original_message TEXT NOT NULL,
                detected_intent VARCHAR(100),
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                tool_proposal JSONB,
                dialog JSONB DEFAULT '[]',
                admin_notes TEXT,
                deployed_tool_key VARCHAR(100),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_capability_requests_status ON capability_requests(status)",
            "CREATE INDEX IF NOT EXISTS idx_capability_requests_customer ON capability_requests(customer_id)",
            "ALTER TABLE capability_requests ADD COLUMN IF NOT EXISTS dev_task_id VARCHAR(36)",
            # Token-Accounting
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0",
            # SubscriptionPlan-Erweiterungen
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS slug VARCHAR(50)",
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS yearly_price NUMERIC(10,2) DEFAULT 0",
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS included_tokens INTEGER DEFAULT 500000",
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS token_overage_chf_per_1k NUMERIC(8,4) DEFAULT 0.002",
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id_monthly VARCHAR(100)",
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id_yearly VARCHAR(100)",
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0",
            # Customer Billing-Felder
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_subscription_item_id VARCHAR(100)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) DEFAULT 'inactive'",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(10) DEFAULT 'monthly'",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMP",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS token_balance_chf NUMERIC(10,4) DEFAULT 0",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS tokens_used_this_period INTEGER DEFAULT 0",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMP",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS memory_consent BOOLEAN DEFAULT true",
            # Segment entfernt (war: personal/elderly/corporate — nicht mehr gebraucht)
            "ALTER TABLE customers DROP COLUMN IF EXISTS segment",
            # Zahlungshistorie
            """CREATE TABLE IF NOT EXISTS payments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                invoice_number VARCHAR(30) UNIQUE,
                customer_id UUID NOT NULL REFERENCES customers(id),
                stripe_payment_intent_id VARCHAR(100) UNIQUE,
                stripe_invoice_id VARCHAR(100),
                amount_chf NUMERIC(10,2) NOT NULL,
                vat_chf NUMERIC(10,2) DEFAULT 0,
                amount_net_chf NUMERIC(10,2) DEFAULT 0,
                description TEXT NOT NULL,
                payment_type VARCHAR(30) DEFAULT 'subscription',
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW(),
                paid_at TIMESTAMP
            )""",
            "CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id)",
            # Fortlaufende Rechnungsnummer
            """CREATE TABLE IF NOT EXISTS invoice_counters (
                year INTEGER PRIMARY KEY,
                last_number INTEGER DEFAULT 0
            )""",
            # Rate Limits (Mensch-Usecase: 1 Baddi, Differenzierung über Token-Volumen)
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS daily_token_limit INTEGER",
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS requests_per_hour INTEGER",
            # Wallet — Prepaid-Guthaben + Limits + Auto-Topup
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_monthly_limit_chf NUMERIC(10,2) DEFAULT 100.0",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_per_tx_limit_chf NUMERIC(10,2) DEFAULT 50.0",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_monthly_spent_chf NUMERIC(10,4) DEFAULT 0.0",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_month_reset_at TIMESTAMP",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS auto_topup_enabled BOOLEAN DEFAULT false",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS auto_topup_threshold_chf NUMERIC(10,2) DEFAULT 5.0",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS auto_topup_amount_chf NUMERIC(10,2) DEFAULT 20.0",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_payment_method_id VARCHAR(100)",
            # Speicher-Tracking
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT DEFAULT 524288000",  # 500 MB
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS storage_extra_bytes BIGINT DEFAULT 0",
            "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT DEFAULT 524288000",
            # Upgrade INTEGER → BIGINT für vorhandene Spalten (> 2 GB Werte)
            "ALTER TABLE customers ALTER COLUMN storage_used_bytes TYPE BIGINT",
            "ALTER TABLE customers ALTER COLUMN storage_limit_bytes TYPE BIGINT",
            "ALTER TABLE customers ALTER COLUMN storage_extra_bytes TYPE BIGINT",
            "ALTER TABLE subscription_plans ALTER COLUMN storage_limit_bytes TYPE BIGINT",
            # Kurs-Alerts
            """CREATE TABLE IF NOT EXISTS stock_alerts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                email VARCHAR(200) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                company_name VARCHAR(200),
                threshold FLOAT NOT NULL,
                direction VARCHAR(10) NOT NULL,
                currency VARCHAR(10) DEFAULT 'CHF',
                is_active BOOLEAN DEFAULT true,
                triggered_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_stock_alerts_active ON stock_alerts(is_active) WHERE is_active = true",
            "CREATE INDEX IF NOT EXISTS idx_stock_alerts_customer ON stock_alerts(customer_id)",
            # Content Guard Log — blockierte Anfragen für Behörden-Auskunft
            """CREATE TABLE IF NOT EXISTS content_guard_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                customer_id VARCHAR(36) NOT NULL,
                message TEXT NOT NULL,
                matched_pattern VARCHAR(200),
                ip_address VARCHAR(60),
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_content_guard_logs_customer ON content_guard_logs(customer_id)",
            "CREATE INDEX IF NOT EXISTS idx_content_guard_logs_created ON content_guard_logs(created_at DESC)",
            # Kunden-Stil: Kommunikationspräferenzen als eigene Memory-Kategorie
            "ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'fact'",
            "CREATE INDEX IF NOT EXISTS idx_memory_items_category ON memory_items(customer_id, category)",
            # Storage Add-on Tracking: aktive Stripe Subscription Items pro Kunde
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS storage_addon_items JSONB DEFAULT '[]'",
            # Admin-Notizen pro Kunde (mit Zeitstempel)
            """CREATE TABLE IF NOT EXISTS customer_notes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id, created_at DESC)",
            # Anonymisierte Chat-Analytics (DSG-konform, kein Personenbezug)
            """CREATE TABLE IF NOT EXISTS chat_analytics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_hash VARCHAR(12) NOT NULL,
                user_message TEXT NOT NULL,
                assistant_message TEXT NOT NULL,
                response_type VARCHAR(50) DEFAULT 'text',
                tokens_used INTEGER DEFAULT 0,
                language VARCHAR(10) DEFAULT 'de',
                day DATE NOT NULL,
                hour_of_day SMALLINT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_chat_analytics_day ON chat_analytics(day DESC)",
            "CREATE INDEX IF NOT EXISTS idx_chat_analytics_session ON chat_analytics(session_hash)",
            # Spalten für System-Prompt-Name und genutzte Tools (nachträgliche Migration)
            "ALTER TABLE chat_analytics ADD COLUMN IF NOT EXISTS system_prompt_name VARCHAR(100) DEFAULT 'Standard'",
            "ALTER TABLE chat_analytics ADD COLUMN IF NOT EXISTS tools_used VARCHAR(500) DEFAULT ''",
            "ALTER TABLE chat_analytics ADD COLUMN IF NOT EXISTS memory_facts TEXT DEFAULT ''",
            # UI-Präferenzen pro Kunde (Schriftgrösse, Farbe, Sprache, Buddy-Name)
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{}'::jsonb",
        ]
        for sql in migrations:
            await conn.execute(text(sql))
