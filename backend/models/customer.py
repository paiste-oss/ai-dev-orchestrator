import uuid
from datetime import datetime, date
from sqlalchemy import String, Boolean, DateTime, Date, Numeric, Integer, BigInteger, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    max_buddies: Mapped[int] = mapped_column(Integer, default=1)         # 1 für Mensch, N für Firma
    features: Mapped[dict] = mapped_column(JSONB, default=dict)
    monthly_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    yearly_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    included_tokens: Mapped[int] = mapped_column(Integer, default=500_000)       # Tokens pro Monat inklusive
    daily_token_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Tokens pro Tag (0 = kein Limit)
    requests_per_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Max Anfragen pro Stunde
    token_overage_chf_per_1k: Mapped[float] = mapped_column(Numeric(8, 4), default=0.002)
    storage_limit_bytes: Mapped[int] = mapped_column(BigInteger, default=524_288_000)  # 500 MB default
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

    # Billing — Abo
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stripe_subscription_item_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subscription_status: Mapped[str] = mapped_column(String(30), default="inactive")
    billing_cycle: Mapped[str] = mapped_column(String(10), default="monthly")
    subscription_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tokens_used_this_period: Mapped[int] = mapped_column(Integer, default=0)
    tos_accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    memory_consent: Mapped[bool] = mapped_column(Boolean, default=True)

    # Speicher
    storage_used_bytes: Mapped[int] = mapped_column(BigInteger, default=0)           # aktuell belegter Speicher
    storage_limit_bytes: Mapped[int] = mapped_column(BigInteger, default=524_288_000) # Limit (default 500 MB)
    storage_extra_bytes: Mapped[int] = mapped_column(BigInteger, default=0)           # zusätzlich gebuchter Speicher
    storage_addon_items: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)  # aktive Stripe-Subscription-Items

    # Wallet — Prepaid-Guthaben (Token-Overage + externe Zahlungen)
    token_balance_chf: Mapped[float] = mapped_column(Numeric(10, 4), default=0.0)   # alias: wallet_balance_chf
    wallet_monthly_limit_chf: Mapped[float] = mapped_column(Numeric(10, 2), default=100.0)    # max. Ausgaben/Monat
    wallet_per_tx_limit_chf: Mapped[float] = mapped_column(Numeric(10, 2), default=50.0)      # max. pro Transaktion
    wallet_monthly_spent_chf: Mapped[float] = mapped_column(Numeric(10, 4), default=0.0)      # Ausgaben diesen Monat
    wallet_month_reset_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)   # wann Monatszähler zuletzt zurückgesetzt
    # Auto-Nachzahlen
    auto_topup_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_topup_threshold_chf: Mapped[float] = mapped_column(Numeric(10, 2), default=5.0)      # Auslösung wenn < x CHF
    auto_topup_amount_chf: Mapped[float] = mapped_column(Numeric(10, 2), default=20.0)        # Betrag pro Nachzahlung
    stripe_payment_method_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # gespeicherte Karte für Auto-Topup

    # 2-Faktor-Authentifizierung
    two_fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Benachrichtigungskanal: 'sms' | 'email'  (erweiterbar: 'whatsapp', 'push')
    notification_channel: Mapped[str] = mapped_column(String(20), default="sms")

    # UI-Präferenzen (Schriftgrösse, Farbe, Sprache, Buddy-Name)
    ui_preferences: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)

    # Aktivität
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    subscription_plan: Mapped["SubscriptionPlan | None"] = relationship(back_populates="customers")
    buddies: Mapped[list["AiBuddy"]] = relationship(back_populates="customer")  # type: ignore
    credentials: Mapped[list["CustomerCredential"]] = relationship(back_populates="customer", cascade="all, delete-orphan")  # type: ignore
    documents: Mapped[list["CustomerDocument"]] = relationship(back_populates="customer", cascade="all, delete-orphan")  # type: ignore
