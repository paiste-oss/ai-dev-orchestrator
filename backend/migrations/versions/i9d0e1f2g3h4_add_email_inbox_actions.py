"""add email inbox actions

Revision ID: i9d0e1f2g3h4
Revises: h8c9d0e1f2g3
Create Date: 2026-04-18

Felder:
  email_messages.baddi_action  — was Baddi mit der Mail gemacht hat
  email_messages.replied       — User hat manuell geantwortet
  customers.blocked_senders    — gesperrte Absender (Inbound-Webhook ignoriert diese)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "i9d0e1f2g3h4"
down_revision: Union[str, None] = "h8c9d0e1f2g3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("email_messages", sa.Column("baddi_action", sa.Text(), nullable=True))
    op.add_column(
        "email_messages",
        sa.Column("replied", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "customers",
        sa.Column(
            "blocked_senders",
            postgresql.JSONB,
            nullable=True,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("email_messages", "baddi_action")
    op.drop_column("email_messages", "replied")
    op.drop_column("customers", "blocked_senders")
