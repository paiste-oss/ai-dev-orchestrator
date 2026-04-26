"""add book_title + chapter_number + chapter_name zu literature_entries

Revision ID: a7b8c9d0e1f2
Revises: z6a7b8c9d0e1
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = "a7b8c9d0e1f2"
down_revision = "z6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("literature_entries", sa.Column("book_title", sa.Text, nullable=True))
    op.add_column("literature_entries", sa.Column("chapter_number", sa.String(32), nullable=True))
    op.add_column("literature_entries", sa.Column("chapter_name", sa.Text, nullable=True))
    # Index für Gruppierung im UI (nach Customer + book_title)
    op.create_index("ix_lit_entries_book_title",
                    "literature_entries", ["customer_id", "book_title"])


def downgrade() -> None:
    op.drop_index("ix_lit_entries_book_title", table_name="literature_entries")
    op.drop_column("literature_entries", "chapter_name")
    op.drop_column("literature_entries", "chapter_number")
    op.drop_column("literature_entries", "book_title")
