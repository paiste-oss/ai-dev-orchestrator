"""add literature_oa_overrides + literature_oa_blocklist

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "z6a7b8c9d0e1"
down_revision = "y5z6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Per-User-Override: User sagt "ist (für mich) nicht OA"
    op.create_table(
        "literature_oa_overrides",
        sa.Column("customer_id", UUID(as_uuid=True),
                  sa.ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("doi", sa.String(512), primary_key=True),
        sa.Column("entry_id", UUID(as_uuid=True),
                  sa.ForeignKey("literature_entries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title_at_override", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_oa_overrides_doi", "literature_oa_overrides", ["doi"])

    # Globale Blocklist: Admin bestätigt → DOI wird nie mehr als OA angezeigt
    op.create_table(
        "literature_oa_blocklist",
        sa.Column("doi", sa.String(512), primary_key=True),
        sa.Column("removed_by", UUID(as_uuid=True),
                  sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("removed_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("reason", sa.String(512), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("literature_oa_blocklist")
    op.drop_index("ix_oa_overrides_doi", table_name="literature_oa_overrides")
    op.drop_table("literature_oa_overrides")
