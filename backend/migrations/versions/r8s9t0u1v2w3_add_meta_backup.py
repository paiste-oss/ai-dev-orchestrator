"""add metadata_backup slot to literature_entries (für 'PDF-Metadaten verbessern' Undo)

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "r8s9t0u1v2w3"
down_revision = "q7r8s9t0u1v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("literature_entries", sa.Column("metadata_backup", JSONB, nullable=True))
    op.add_column("literature_entries", sa.Column("metadata_backup_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("literature_entries", "metadata_backup_at")
    op.drop_column("literature_entries", "metadata_backup")
