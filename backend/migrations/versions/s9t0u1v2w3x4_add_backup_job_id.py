"""add metadata_backup_job_id für Bulk-Undo

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = "s9t0u1v2w3x4"
down_revision = "r8s9t0u1v2w3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("literature_entries", sa.Column("metadata_backup_job_id", sa.String(64), nullable=True))
    op.create_index("ix_lit_entries_backup_job", "literature_entries", ["metadata_backup_job_id"])


def downgrade() -> None:
    op.drop_index("ix_lit_entries_backup_job", table_name="literature_entries")
    op.drop_column("literature_entries", "metadata_backup_job_id")
