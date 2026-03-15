import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    max_buddies: Mapped[int] = mapped_column(Integer, default=1)
    features: Mapped[dict] = mapped_column(JSONB, default=dict)
    monthly_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)

    customers: Mapped[list["Customer"]] = relationship(back_populates="subscription_plan")


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    segment: Mapped[str] = mapped_column(String, default="personal")  # elderly, corporate, personal
    hashed_password: Mapped[str] = mapped_column(String, nullable=False, default="")
    role: Mapped[str] = mapped_column(String, default="customer")  # admin, customer
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    subscription_plan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("subscription_plans.id"), nullable=True)

    subscription_plan: Mapped["SubscriptionPlan | None"] = relationship(back_populates="customers")
    buddies: Mapped[list["AiBuddy"]] = relationship(back_populates="customer")
