from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, DateTime, UniqueConstraint
from core.database import Base


class StockPortfolio(Base):
    __tablename__ = "stock_portfolio"
    __table_args__ = (UniqueConstraint("customer_id", "symbol", name="uq_portfolio_customer_symbol"),)

    id = Column(String, primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    customer_id = Column(String, nullable=False, index=True)
    symbol = Column(String(20), nullable=False)
    quantity = Column(Float, nullable=False)
    buy_price = Column(Float, nullable=False)   # Durchschnittlicher Einstandskurs
    added_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
