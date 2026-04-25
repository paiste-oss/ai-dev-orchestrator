"""literature_entries x literature_groups: many-to-many

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "q7r8s9t0u1v2"
down_revision = "p6q7r8s9t0u1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "literature_entry_groups",
        sa.Column("entry_id", UUID(as_uuid=True), sa.ForeignKey("literature_entries.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("literature_groups.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_lit_entry_groups_group", "literature_entry_groups", ["group_id"])

    # Bestehende Zuordnungen via group_id-Spalte in den Join-Table migrieren
    op.execute("""
        INSERT INTO literature_entry_groups (entry_id, group_id)
        SELECT id, group_id FROM literature_entries
        WHERE group_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """)

    op.drop_column("literature_entries", "group_id")


def downgrade() -> None:
    op.add_column(
        "literature_entries",
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("literature_groups.id", ondelete="SET NULL"), nullable=True),
    )
    # Best-effort: ersten Eintrag aus Join-Table als group_id zurückschreiben
    op.execute("""
        UPDATE literature_entries e SET group_id = (
            SELECT group_id FROM literature_entry_groups
            WHERE entry_id = e.id LIMIT 1
        )
    """)
    op.drop_index("ix_lit_entry_groups_group", table_name="literature_entry_groups")
    op.drop_table("literature_entry_groups")
