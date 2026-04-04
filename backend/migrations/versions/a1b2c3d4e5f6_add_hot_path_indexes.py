"""add_hot_path_indexes

Revision ID: a1b2c3d4e5f6
Revises: 8eac5f09ed26
Create Date: 2026-04-04 00:00:00.000000

Indizes auf alle Spalten die bei jedem Request gescannt werden:
- customers.email          (Auth: get_current_user bei jedem Request)
- chat_messages.customer_id (Chat-History: jede Nachricht)
- memory_items.customer_id  (Memory-Suche: jeder Chat)
- memory_items.category     (Stil-Filter: jeder Chat)
- window_boards.customer_id (Netzwerk: jeder Chat)
- documents.customer_id     (Dokument-Liste: jeder Chat)
"""
from typing import Sequence, Union
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "8eac5f09ed26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # customers.email — Full-Table-Scan bei jedem authentifizierten Request
    op.create_index("ix_customers_email", "customers", ["email"], unique=True, if_not_exists=True)

    # chat_messages — History wird bei jedem Chat geladen
    op.create_index("ix_chat_messages_customer_id", "chat_messages", ["customer_id"], if_not_exists=True)
    op.create_index(
        "ix_chat_messages_customer_created",
        "chat_messages", ["customer_id", "created_at"],
        if_not_exists=True,
    )

    # memory_items — Fakten + Stil werden bei jedem Chat geladen
    op.create_index("ix_memory_items_customer_id", "memory_items", ["customer_id"], if_not_exists=True)
    op.create_index(
        "ix_memory_items_customer_category",
        "memory_items", ["customer_id", "category"],
        if_not_exists=True,
    )

    # window_boards — Netzwerk-Kontext wird bei jedem Chat geladen
    op.create_index("ix_window_boards_customer_id", "window_boards", ["customer_id"], if_not_exists=True)

    # customer_documents — Dokument-Liste wird bei jedem Chat geladen
    op.create_index(
        "ix_customer_documents_customer_active",
        "customer_documents", ["customer_id", "is_active"],
        if_not_exists=True,
    )

    # payments — Billing-Queries
    op.create_index("ix_payments_customer_id", "payments", ["customer_id"], if_not_exists=True)

    # capability_requests — Dev-Orchestrator Polling
    op.create_index("ix_capability_requests_status", "capability_requests", ["status"], if_not_exists=True)
    op.create_index("ix_capability_requests_customer_id", "capability_requests", ["customer_id"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_capability_requests_customer_id", table_name="capability_requests")
    op.drop_index("ix_capability_requests_status", table_name="capability_requests")
    op.drop_index("ix_payments_customer_id", table_name="payments")
    op.drop_index("ix_customer_documents_customer_active", table_name="customer_documents")
    op.drop_index("ix_window_boards_customer_id", table_name="window_boards")
    op.drop_index("ix_memory_items_customer_category", table_name="memory_items")
    op.drop_index("ix_memory_items_customer_id", table_name="memory_items")
    op.drop_index("ix_chat_messages_customer_created", table_name="chat_messages")
    op.drop_index("ix_chat_messages_customer_id", table_name="chat_messages")
    op.drop_index("ix_customers_email", table_name="customers")
