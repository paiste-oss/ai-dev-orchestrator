"""add caldav fields to customers

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-17

caldav_username und caldav_password für Radicale CalDAV-Accounts.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("caldav_username", sa.String(100), nullable=True))
    op.add_column("customers", sa.Column("caldav_password", sa.String(100), nullable=True))
    op.create_unique_constraint("uq_customers_caldav_username", "customers", ["caldav_username"])


def downgrade() -> None:
    op.drop_constraint("uq_customers_caldav_username", "customers", type_="unique")
    op.drop_column("customers", "caldav_password")
    op.drop_column("customers", "caldav_username")
