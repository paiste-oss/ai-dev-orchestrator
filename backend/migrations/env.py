import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Backend-Pfad hinzufügen
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.config import settings
from core.database import Base

# Alle Models importieren damit Base.metadata sie kennt
import models.buddy          # noqa: F401
import models.buddy_event    # noqa: F401
import models.capability_request  # noqa: F401
import models.chat           # noqa: F401
import models.content_guard_log  # noqa: F401
import models.credential     # noqa: F401
import models.customer       # noqa: F401
import models.dev_task       # noqa: F401
import models.document       # noqa: F401
import models.finance        # noqa: F401
import models.knowledge      # noqa: F401
import models.payment        # noqa: F401
import models.stock_alert    # noqa: F401
import models.stock_portfolio  # noqa: F401
import models.training_reminder  # noqa: F401
import models.window         # noqa: F401
import models.workflow       # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

config.set_main_option("sqlalchemy.url", settings.database_url)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
