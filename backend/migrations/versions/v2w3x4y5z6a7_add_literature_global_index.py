"""add literature_global_index für Phase A — globaler Wissenspool

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "v2w3x4y5z6a7"
down_revision = "u1v2w3x4y5z6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "literature_global_index",
        sa.Column("doi", sa.String(512), primary_key=True),  # canonical lowercase, stripped
        sa.Column("title", sa.Text, nullable=True),
        sa.Column("authors", JSONB, nullable=True),  # ["Nachname, Vorname", ...]
        sa.Column("year", sa.Integer, nullable=True),
        sa.Column("journal", sa.String(512), nullable=True),
        sa.Column("volume", sa.String(64), nullable=True),
        sa.Column("issue", sa.String(64), nullable=True),
        sa.Column("pages", sa.String(64), nullable=True),
        sa.Column("publisher", sa.String(512), nullable=True),
        sa.Column("entry_type", sa.String(32), nullable=True),
        sa.Column("isbn", sa.String(256), nullable=True),
        sa.Column("abstract", sa.Text, nullable=True),
        # Open-Access Info aus Unpaywall
        sa.Column("oa_status", sa.String(32), nullable=True),  # gold, hybrid, green, bronze, closed
        sa.Column("oa_url", sa.String(2048), nullable=True),
        sa.Column("oa_license", sa.String(64), nullable=True),
        # Roh-Caches der externen APIs (für Re-Auswertung ohne erneuten Aufruf)
        sa.Column("crossref_data", JSONB, nullable=True),
        sa.Column("unpaywall_data", JSONB, nullable=True),
        # Quelle: "crossref" | "unpaywall" | "user_doi" | "merged"
        sa.Column("source", sa.String(32), nullable=False, server_default="user_doi"),
        # Status: "pending" | "enriched" | "failed_404" | "failed_other"
        sa.Column("enrichment_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("enrichment_error", sa.String(512), nullable=True),
        sa.Column("first_seen_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_enriched_at", sa.DateTime, nullable=True),
    )
    # Volltext-Suche-Indizes (deutsch+english trigram für Fuzziness wäre Phase A.2)
    op.create_index("ix_global_index_year", "literature_global_index", ["year"])
    op.create_index("ix_global_index_status", "literature_global_index", ["enrichment_status"])
    # GIN-Index auf title + abstract als TSV — basic full-text search
    op.execute("""
        CREATE INDEX ix_global_index_search ON literature_global_index
        USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(abstract, '')))
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_global_index_search")
    op.drop_index("ix_global_index_status", table_name="literature_global_index")
    op.drop_index("ix_global_index_year", table_name="literature_global_index")
    op.drop_table("literature_global_index")
