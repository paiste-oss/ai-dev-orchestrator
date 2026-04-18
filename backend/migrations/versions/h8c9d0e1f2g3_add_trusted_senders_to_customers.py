"""add trusted_senders to customers

Revision ID: h8c9d0e1f2g3
Revises: g7b8c9d0e1f2
Create Date: 2026-04-18

trusted_senders: JSONB-Array von E-Mail-Adressen die der User als vertrauenswürdig
markiert hat. Baddi reagiert autonom auf Mails von diesen Absendern.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "h8c9d0e1f2g3"
down_revision: Union[str, None] = "g7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column(
            "trusted_senders",
            postgresql.JSONB,
            nullable=True,
            server_default="'[]'::jsonb",
        ),
    )


def downgrade() -> None:
    op.drop_column("customers", "trusted_senders")
