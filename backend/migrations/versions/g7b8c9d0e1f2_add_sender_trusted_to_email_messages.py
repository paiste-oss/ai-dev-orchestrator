"""add sender_trusted to email_messages

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-18

sender_trusted: True wenn SPF+DKIM bestanden — Baddi reagiert nur autonom auf
vertrauenswürdige Absender. Unbekannte Mails werden gespeichert aber nicht verarbeitet.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "email_messages",
        sa.Column("sender_trusted", sa.Boolean, nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("email_messages", "sender_trusted")
