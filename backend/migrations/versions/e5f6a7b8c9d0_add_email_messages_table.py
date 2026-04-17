"""add email_messages table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-17

Tabelle für eingehende und ausgehende E-Mails der Baddi per-User-Adressen.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "customer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("from_address", sa.String(255), nullable=False),
        sa.Column("to_address", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(998), nullable=False, server_default=""),
        sa.Column("body_text", sa.Text, nullable=True),
        sa.Column("body_html", sa.Text, nullable=True),
        sa.Column("message_id", sa.String(255), nullable=True),
        sa.Column("received_at", sa.DateTime, nullable=False),
        sa.Column("read", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("raw_headers", postgresql.JSONB, nullable=True),
    )
    op.create_index("ix_email_messages_customer_id", "email_messages", ["customer_id"])
    op.create_index("ix_email_messages_received_at", "email_messages", ["received_at"])
    op.create_unique_constraint("uq_email_messages_message_id", "email_messages", ["message_id"])


def downgrade() -> None:
    op.drop_table("email_messages")
