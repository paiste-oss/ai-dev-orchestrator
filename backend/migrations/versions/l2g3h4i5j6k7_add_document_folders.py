"""add document_folders and folder_id to customer_documents

Revision ID: l2g3h4i5j6k7
Revises: k1f2g3h4i5j6
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "l2g3h4i5j6k7"
down_revision = "k1f2g3h4i5j6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_folders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("customer_id", UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("color", sa.String(32), nullable=False, server_default="indigo"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_document_folders_customer_id", "document_folders", ["customer_id"])

    op.add_column("customer_documents", sa.Column(
        "folder_id", UUID(as_uuid=True),
        sa.ForeignKey("document_folders.id", ondelete="SET NULL"),
        nullable=True,
    ))


def downgrade() -> None:
    op.drop_column("customer_documents", "folder_id")
    op.drop_index("ix_document_folders_customer_id", "document_folders")
    op.drop_table("document_folders")
