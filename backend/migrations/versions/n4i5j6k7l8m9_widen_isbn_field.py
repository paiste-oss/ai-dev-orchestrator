"""widen isbn field to 256 chars

Revision ID: n4i5j6k7l8m9
Revises: m3h4i5j6k7l8
Create Date: 2026-04-22
"""
import sqlalchemy as sa
from alembic import op

revision = "n4i5j6k7l8m9"
down_revision = "m3h4i5j6k7l8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "literature_entries",
        "isbn",
        existing_type=sa.String(32),
        type_=sa.String(256),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "literature_entries",
        "isbn",
        existing_type=sa.String(256),
        type_=sa.String(32),
        existing_nullable=True,
    )
