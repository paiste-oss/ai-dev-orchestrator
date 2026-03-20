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
        ]
        for sql in migrations:
            await conn.execute(text(sql))
