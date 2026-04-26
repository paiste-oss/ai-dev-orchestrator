"""Phase A.4: patent_global_index für Patent-Lookups via Google Patents / EPO

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "y5z6a7b8c9d0"
down_revision = "x4y5z6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patent_global_index",
        sa.Column("publication_number", sa.String(64), primary_key=True),
        sa.Column("country_code", sa.String(8), nullable=True),  # US, EP, WO, CH, DE, ...
        sa.Column("kind_code", sa.String(8), nullable=True),  # A1, B2, etc.
        sa.Column("title", sa.Text, nullable=True),
        sa.Column("abstract", sa.Text, nullable=True),
        sa.Column("inventors", JSONB, nullable=True),  # ["Lastname, Firstname", ...]
        sa.Column("assignees", JSONB, nullable=True),  # Firmen/Anmelder
        sa.Column("publication_date", sa.Date, nullable=True),
        sa.Column("priority_date", sa.Date, nullable=True),
        sa.Column("application_number", sa.String(64), nullable=True),
        sa.Column("classifications", JSONB, nullable=True),  # IPC/CPC codes
        # Direkt-Links zu öffentlichen Patent-DBs
        sa.Column("google_patents_url", sa.String(2048), nullable=True),
        sa.Column("espacenet_url", sa.String(2048), nullable=True),
        sa.Column("uspto_url", sa.String(2048), nullable=True),
        sa.Column("pdf_url", sa.String(2048), nullable=True),
        # Roh-Caches (für spätere Re-Auswertung)
        sa.Column("epo_data", JSONB, nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default="user_input"),
        sa.Column("enrichment_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("enrichment_error", sa.String(512), nullable=True),
        sa.Column("first_seen_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_enriched_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_patent_global_status", "patent_global_index", ["enrichment_status"])
    op.create_index("ix_patent_global_country", "patent_global_index", ["country_code"])
    op.execute("""
        CREATE INDEX ix_patent_global_search ON patent_global_index
        USING GIN (to_tsvector('simple',
            coalesce(title, '') || ' ' || coalesce(abstract, '')))
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_patent_global_search")
    op.drop_index("ix_patent_global_country", table_name="patent_global_index")
    op.drop_index("ix_patent_global_status", table_name="patent_global_index")
    op.drop_table("patent_global_index")
