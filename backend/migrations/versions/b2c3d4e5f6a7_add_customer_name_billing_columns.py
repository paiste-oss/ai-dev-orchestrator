"""add first_name, last_name and billing address columns to customers

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-05

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('first_name', sa.String(length=100), nullable=True))
    op.add_column('customers', sa.Column('last_name', sa.String(length=100), nullable=True))
    op.add_column('customers', sa.Column('billing_same_as_address', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('customers', sa.Column('billing_street', sa.String(length=200), nullable=True))
    op.add_column('customers', sa.Column('billing_zip', sa.String(length=20), nullable=True))
    op.add_column('customers', sa.Column('billing_city', sa.String(length=100), nullable=True))
    op.add_column('customers', sa.Column('billing_country', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('customers', 'billing_country')
    op.drop_column('customers', 'billing_city')
    op.drop_column('customers', 'billing_zip')
    op.drop_column('customers', 'billing_street')
    op.drop_column('customers', 'billing_same_as_address')
    op.drop_column('customers', 'last_name')
    op.drop_column('customers', 'first_name')
