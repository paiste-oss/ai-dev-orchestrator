"""add literature_orphan_pdfs für unmatched PDFs aus Bulk-Upload

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "t0u1v2w3x4y5"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "literature_orphan_pdfs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("customer_id", UUID(as_uuid=True),
                  sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("s3_key", sa.String(1024), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("extracted_meta", JSONB, nullable=True),
        sa.Column("extracted_text_preview", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
    )
    op.create_index("ix_orphan_pdfs_customer_active",
                    "literature_orphan_pdfs", ["customer_id", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_orphan_pdfs_customer_active", table_name="literature_orphan_pdfs")
    op.drop_table("literature_orphan_pdfs")
