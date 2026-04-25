"""add pdf_sha256 für Fast-Skip bei ZIP-Re-Upload

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = "w3x4y5z6a7b8"
down_revision = "v2w3x4y5z6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 64-stellige Hex-Strings für SHA256
    op.add_column("literature_entries",
                  sa.Column("pdf_sha256", sa.String(64), nullable=True))
    op.create_index("ix_lit_entries_pdf_sha256",
                    "literature_entries", ["customer_id", "pdf_sha256"])

    op.add_column("literature_orphan_pdfs",
                  sa.Column("sha256", sa.String(64), nullable=True))
    op.create_index("ix_orphan_pdfs_sha256",
                    "literature_orphan_pdfs", ["customer_id", "sha256"])


def downgrade() -> None:
    op.drop_index("ix_orphan_pdfs_sha256", table_name="literature_orphan_pdfs")
    op.drop_column("literature_orphan_pdfs", "sha256")
    op.drop_index("ix_lit_entries_pdf_sha256", table_name="literature_entries")
    op.drop_column("literature_entries", "pdf_sha256")
