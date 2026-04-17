"""add baddi_email to customers

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-17

Fügt das Feld baddi_email (vorname.id@mail.baddi.ch) zur customers-Tabelle hinzu.
Unique-Constraint, nullable — wird bei Registrierung oder on-demand provisioniert.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("baddi_email", sa.String(100), nullable=True),
    )
    op.create_unique_constraint("uq_customers_baddi_email", "customers", ["baddi_email"])


def downgrade() -> None:
    op.drop_constraint("uq_customers_baddi_email", "customers", type_="unique")
    op.drop_column("customers", "baddi_email")
