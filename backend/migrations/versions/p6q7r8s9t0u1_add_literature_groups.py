"""add literature_groups table and group_id to literature_entries

Revision ID: p6q7r8s9t0u1
Revises: o5j6k7l8m9n0
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "p6q7r8s9t0u1"
down_revision = "o5j6k7l8m9n0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "literature_groups",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("customer_id", UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_type", sa.String(32), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("literature_groups.id", ondelete="CASCADE"), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_lit_groups_customer", "literature_groups", ["customer_id"])
    op.add_column(
        "literature_entries",
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("literature_groups.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("literature_entries", "group_id")
    op.drop_index("ix_lit_groups_customer", table_name="literature_groups")
    op.drop_table("literature_groups")
