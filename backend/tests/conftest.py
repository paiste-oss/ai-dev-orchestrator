"""
Zentrale Test-Fixtures.

Design:
- db_session: für Fixtures/direkte DB-Operationen in Tests (commit nach jedem Add)
- client: API bekommt eigene Sessions aus TestSessionLocal (getrennt von db_session)
- Nach jedem Test: TRUNCATE aller Tabellen via separater Verbindung
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from core.database import Base, get_db
from core.security import hash_password, create_access_token
from models.customer import Customer

ASYNC_TEST_DB_URL = "postgresql+asyncpg://aibuddy:aibuddy@ai_postgres:5432/aibuddy_test"
SYNC_TEST_DB_URL  = "postgresql+psycopg2://aibuddy:aibuddy@ai_postgres:5432/aibuddy_test"

_TRUNCATE_ORDER = [
    "messages", "conversation_threads", "buddy_tools", "ai_buddies",
    "customer_credentials", "customer_documents", "buddy_events",
    "dev_tasks", "customers", "subscription_plans",
]

# ── Einmalig beim Modulstart: Schema anlegen (sync) ───────────────────────────

def _init_schema():
    engine = create_engine(SYNC_TEST_DB_URL)
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE SEQUENCE IF NOT EXISTS baddi_number_seq START 0 MINVALUE 0"
        ))
        Base.metadata.create_all(conn)
    engine.dispose()

_init_schema()

# ── Async Engine für Tests ────────────────────────────────────────────────────

test_engine = create_async_engine(ASYNC_TEST_DB_URL, echo=False, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


async def _truncate_all():
    async with test_engine.begin() as conn:
        tables = ", ".join(_TRUNCATE_ORDER)
        await conn.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    """Session für direkte DB-Operationen in Tests und Fixtures."""
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    """Tabellen vor und nach jedem Test leeren."""
    await _truncate_all()
    yield
    await _truncate_all()


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    """
    HTTP-Client für API-Calls.
    Die API bekommt ihre eigene DB-Session (nicht db_session) —
    so bleibt eine fehlgeschlagene API-Transaktion isoliert.
    """
    async def fresh_db():
        async with TestSessionLocal() as session:
            yield session

    from main import app
    app.dependency_overrides[get_db] = fresh_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ── User-Fixtures ─────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def admin_user(db_session) -> Customer:
    user = Customer(
        name="Test Admin",
        email="admin@test.local",
        hashed_password=hash_password("adminpass123"),
        role="admin",
        segment="personal",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def regular_user(db_session) -> Customer:
    user = Customer(
        name="Test User",
        email="user@test.local",
        hashed_password=hash_password("userpass123"),
        role="customer",
        segment="personal",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def inactive_user(db_session) -> Customer:
    user = Customer(
        name="Inactive User",
        email="inactive@test.local",
        hashed_password=hash_password("pass123"),
        role="customer",
        segment="personal",
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ── Auth-Header Fixtures ───────────────────────────────────────────────────────

@pytest.fixture
def admin_headers(admin_user) -> dict:
    token = create_access_token(subject=admin_user.email, role="admin")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def user_headers(regular_user) -> dict:
    token = create_access_token(subject=regular_user.email, role="customer")
    return {"Authorization": f"Bearer {token}"}
