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
            "ALTER TABLE cost_entries ADD COLUMN IF NOT EXISTS balance_chf FLOAT",
            "ALTER TABLE cost_entries ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMP",
        ]
        for sql in migrations:
            await conn.execute(text(sql))
