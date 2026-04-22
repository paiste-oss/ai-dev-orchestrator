"""add literature_entries table

Revision ID: m3h4i5j6k7l8
Revises: l2g3h4i5j6k7
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "m3h4i5j6k7l8"
down_revision = "l2g3h4i5j6k7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "literature_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("customer_id", UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_type", sa.String(32), nullable=False, server_default="paper"),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("authors", JSONB(), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("abstract", sa.Text(), nullable=True),
        sa.Column("journal", sa.String(512), nullable=True),
        sa.Column("volume", sa.String(64), nullable=True),
        sa.Column("issue", sa.String(64), nullable=True),
        sa.Column("pages", sa.String(64), nullable=True),
        sa.Column("doi", sa.String(512), nullable=True),
        sa.Column("url", sa.String(2048), nullable=True),
        sa.Column("publisher", sa.String(512), nullable=True),
        sa.Column("isbn", sa.String(32), nullable=True),
        sa.Column("edition", sa.String(64), nullable=True),
        sa.Column("tags", JSONB(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("pdf_s3_key", sa.String(1024), nullable=True),
        sa.Column("pdf_size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("baddi_readable", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("qdrant_point_ids", JSONB(), nullable=True),
        sa.Column("import_source", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_literature_entries_customer_id", "literature_entries", ["customer_id"])
    op.create_index("ix_literature_entries_entry_type", "literature_entries", ["customer_id", "entry_type"])


def downgrade() -> None:
    op.drop_index("ix_literature_entries_entry_type", "literature_entries")
    op.drop_index("ix_literature_entries_customer_id", "literature_entries")
    op.drop_table("literature_entries")
