import uuid
from datetime import datetime, date
from sqlalchemy import String, Boolean, DateTime, Date, Numeric, Integer, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)            # "Basis" | "Komfort" | "Premium"
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)  # "basis" | "komfort" | "premium"
    max_buddies: Mapped[int] = mapped_column(Integer, default=1)
    features: Mapped[dict] = mapped_column(JSONB, default=dict)
    monthly_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)   # CHF pro Monat
    yearly_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)    # CHF pro Jahr (mit Rabatt)
    included_tokens: Mapped[int] = mapped_column(Integer, default=500_000)       # Tokens pro Monat inklusive
    token_overage_chf_per_1k: Mapped[float] = mapped_column(Numeric(8, 4), default=0.002)  # CHF / 1k Tokens über Limit
    stripe_price_id_monthly: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stripe_price_id_yearly: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    customers: Mapped[list["Customer"]] = relationship(back_populates="subscription_plan")


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False, default="")
    role: Mapped[str] = mapped_column(String, default="customer")  # admin, customer
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    subscription_plan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("subscription_plans.id"), nullable=True)

    # Kontakt
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone_secondary: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Adresse
    address_street: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_zip: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address_country: Mapped[str | None] = mapped_column(String(100), nullable=True, default="Schweiz")

    # Beruf & Umfeld
    workplace: Mapped[str | None] = mapped_column(String(200), nullable=True)   # Arbeitgeber / Firma
    job_title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True, default="de")  # ISO 639-1

    # Freitext-Notiz (für den Admin / Baddi als Kontext)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Interessen & Hobbys (JSON-Array von Strings)
    interests: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)

    # Billing
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stripe_subscription_item_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # für Metered billing
    subscription_status: Mapped[str] = mapped_column(String(30), default="inactive")  # active | past_due | canceled | trialing | inactive
    billing_cycle: Mapped[str] = mapped_column(String(10), default="monthly")  # monthly | yearly
    subscription_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    token_balance_chf: Mapped[float] = mapped_column(Numeric(10, 4), default=0.0)  # Prepaid-Guthaben
    tokens_used_this_period: Mapped[int] = mapped_column(Integer, default=0)
    tos_accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # ToS-Akzeptanz-Zeitstempel
    memory_consent: Mapped[bool] = mapped_column(Boolean, default=True)               # Einwilligung Langzeitgedächtnis (revDSG)

    subscription_plan: Mapped["SubscriptionPlan | None"] = relationship(back_populates="customers")
    buddies: Mapped[list["AiBuddy"]] = relationship(back_populates="customer")  # type: ignore
    credentials: Mapped[list["CustomerCredential"]] = relationship(back_populates="customer", cascade="all, delete-orphan")  # type: ignore
    documents: Mapped[list["CustomerDocument"]] = relationship(back_populates="customer", cascade="all, delete-orphan")  # type: ignore
