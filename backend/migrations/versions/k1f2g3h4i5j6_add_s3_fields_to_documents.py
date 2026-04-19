"""add s3 fields to customer_documents

Revision ID: k1f2g3h4i5j6
Revises: j0e1f2g3h4i5
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa

revision = "k1f2g3h4i5j6"
down_revision = "j0e1f2g3h4i5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customer_documents", sa.Column("s3_key", sa.String(1024), nullable=True))
    op.add_column("customer_documents", sa.Column("stored_in_s3", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("customer_documents", "stored_in_s3")
    op.drop_column("customer_documents", "s3_key")
