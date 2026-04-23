"""add is_favorite and read_later to literature_entries

Revision ID: o5j6k7l8m9n0
Revises: n4i5j6k7l8m9
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = "o5j6k7l8m9n0"
down_revision = "n4i5j6k7l8m9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("literature_entries", sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("literature_entries", sa.Column("read_later", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("literature_entries", "read_later")
    op.drop_column("literature_entries", "is_favorite")
