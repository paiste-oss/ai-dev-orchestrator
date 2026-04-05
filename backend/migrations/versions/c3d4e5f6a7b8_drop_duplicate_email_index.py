"""drop duplicate email index on customers

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-05

ix_customers_email ist ein redundanter UNIQUE-Index neben dem
customers_email_key-Constraint, der durch unique=True in der Spalte
entsteht. Einer davon reicht.
"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index('ix_customers_email', table_name='customers')


def downgrade() -> None:
    op.create_index('ix_customers_email', 'customers', ['email'], unique=True)
