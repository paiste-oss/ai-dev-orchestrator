"""Phase A.3: book_global_index (OpenLibrary/DOAB) + law_global_index (Fedlex)

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "x4y5z6a7b8c9"
down_revision = "w3x4y5z6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Bücher (ISBN-keyed) ──────────────────────────────────────────────────
    op.create_table(
        "book_global_index",
        sa.Column("isbn", sa.String(64), primary_key=True),  # normalisiert: nur Ziffern + 'X', 10 oder 13 Zeichen
        sa.Column("title", sa.Text, nullable=True),
        sa.Column("subtitle", sa.Text, nullable=True),
        sa.Column("authors", JSONB, nullable=True),
        sa.Column("year", sa.Integer, nullable=True),
        sa.Column("publisher", sa.String(512), nullable=True),
        sa.Column("edition", sa.String(64), nullable=True),
        sa.Column("language", sa.String(16), nullable=True),
        sa.Column("page_count", sa.Integer, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("cover_url", sa.String(2048), nullable=True),
        # OA-Felder (von DOAB für Open-Access-Bücher)
        sa.Column("oa_url", sa.String(2048), nullable=True),
        sa.Column("oa_license", sa.String(64), nullable=True),
        sa.Column("oa_publisher", sa.String(512), nullable=True),
        # Roh-Caches
        sa.Column("openlibrary_data", JSONB, nullable=True),
        sa.Column("doab_data", JSONB, nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default="user_isbn"),
        sa.Column("enrichment_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("enrichment_error", sa.String(512), nullable=True),
        sa.Column("first_seen_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_enriched_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_book_global_status", "book_global_index", ["enrichment_status"])
    op.create_index("ix_book_global_year", "book_global_index", ["year"])
    op.execute("""
        CREATE INDEX ix_book_global_search ON book_global_index
        USING GIN (to_tsvector('simple',
            coalesce(title, '') || ' ' || coalesce(subtitle, '') || ' ' || coalesce(description, '')))
    """)

    # ── Schweizer Gesetze (Fedlex SR-Nummer) ─────────────────────────────────
    op.create_table(
        "law_global_index",
        sa.Column("sr_number", sa.String(64), primary_key=True),  # z. B. "220" für OR
        sa.Column("title", sa.Text, nullable=True),
        sa.Column("short_title", sa.String(512), nullable=True),  # z. B. "OR"
        sa.Column("abbreviation", sa.String(64), nullable=True),
        sa.Column("language", sa.String(16), nullable=False, server_default="de"),
        # Erlassdatum + aktuelle Fassung
        sa.Column("enacted_date", sa.Date, nullable=True),
        sa.Column("in_force_date", sa.Date, nullable=True),
        sa.Column("status", sa.String(32), nullable=True),  # in_force | repealed | future
        # Direkt-Links (Fedlex stellt PDF/HTML bereit — alles frei verfügbar)
        sa.Column("html_url", sa.String(2048), nullable=True),
        sa.Column("pdf_url", sa.String(2048), nullable=True),
        sa.Column("eli_uri", sa.String(2048), nullable=True),  # ELI = European Legislation Identifier
        sa.Column("fedlex_data", JSONB, nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default="fedlex"),
        sa.Column("enrichment_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("enrichment_error", sa.String(512), nullable=True),
        sa.Column("first_seen_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_enriched_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_law_global_status", "law_global_index", ["enrichment_status"])
    op.create_index("ix_law_global_abbr", "law_global_index", ["abbreviation"])
    op.execute("""
        CREATE INDEX ix_law_global_search ON law_global_index
        USING GIN (to_tsvector('simple',
            coalesce(title, '') || ' ' || coalesce(short_title, '') || ' ' || coalesce(abbreviation, '')))
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_law_global_search")
    op.drop_index("ix_law_global_abbr", table_name="law_global_index")
    op.drop_index("ix_law_global_status", table_name="law_global_index")
    op.drop_table("law_global_index")
    op.execute("DROP INDEX IF EXISTS ix_book_global_search")
    op.drop_index("ix_book_global_year", table_name="book_global_index")
    op.drop_index("ix_book_global_status", table_name="book_global_index")
    op.drop_table("book_global_index")
