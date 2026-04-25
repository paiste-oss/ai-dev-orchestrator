"""add meta_refreshed_count + meta_refreshed_at zu literature_entries

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = "u1v2w3x4y5z6"
down_revision = "t0u1v2w3x4y5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("literature_entries",
                  sa.Column("meta_refreshed_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("literature_entries",
                  sa.Column("meta_refreshed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("literature_entries", "meta_refreshed_at")
    op.drop_column("literature_entries", "meta_refreshed_count")
