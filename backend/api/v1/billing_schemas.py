"""
Billing Schemas — Pydantic-Modelle für den Billing-Bereich.
"""
from typing import Optional

from pydantic import BaseModel, Field


# ── Öffentliche Plan-Ausgabe ───────────────────────────────────────────────────

class PlanOut(BaseModel):
    id: str
    name: str
    slug: str
    monthly_price: float
    yearly_price: float
    yearly_monthly_equivalent: float   # yearly_price / 12
    yearly_discount_percent: int
    included_tokens: int
    daily_token_limit: Optional[int]
    requests_per_hour: Optional[int]
    token_overage_chf_per_1k: float
    max_buddies: int
    features: dict
    sort_order: int


# ── Billing-Status ─────────────────────────────────────────────────────────────

class BillingStatusOut(BaseModel):
    plan_name: Optional[str]
    plan_slug: Optional[str]
    subscription_status: str
    billing_cycle: str
    subscription_period_end: Optional[str]
    tokens_used_this_period: int
    tokens_included: int
    token_balance_chf: float
    overage_rate_chf_per_1k: float
    tos_accepted: bool


# ── Checkout & Topup ───────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan_slug: str
    billing_cycle: str = Field(default="monthly", pattern="^(monthly|yearly)$")


class TopupRequest(BaseModel):
    amount_chf: float = Field(..., ge=5.0, le=500.0)


# ── Rechnungen ─────────────────────────────────────────────────────────────────

class InvoiceOut(BaseModel):
    id: str
    invoice_number: Optional[str]
    amount_chf: float
    vat_chf: float
    amount_net_chf: float
    description: str
    payment_type: str
    status: str
    created_at: str
    paid_at: Optional[str]


# ── Admin: Pläne ───────────────────────────────────────────────────────────────

class PlanAdminOut(BaseModel):
    id: str
    name: str
    slug: str
    monthly_price: float
    yearly_price: float
    included_tokens: int
    daily_token_limit: Optional[int]
    requests_per_hour: Optional[int]
    token_overage_chf_per_1k: float
    storage_limit_bytes: int
    max_buddies: int
    features: dict
    sort_order: int
    stripe_price_id_monthly: Optional[str]
    stripe_price_id_yearly: Optional[str]


class PlanAdminUpdate(BaseModel):
    name: Optional[str] = None
    monthly_price: Optional[float] = None
    yearly_price: Optional[float] = None
    included_tokens: Optional[int] = None
    daily_token_limit: Optional[int] = None
    requests_per_hour: Optional[int] = None
    token_overage_chf_per_1k: Optional[float] = None
    storage_limit_bytes: Optional[int] = None
    max_buddies: Optional[int] = None
    features: Optional[dict] = None
    stripe_price_id_monthly: Optional[str] = None
    stripe_price_id_yearly: Optional[str] = None


# ── Wallet ─────────────────────────────────────────────────────────────────────

class WalletStatusOut(BaseModel):
    balance_chf: float
    monthly_limit_chf: float
    per_tx_limit_chf: float
    monthly_spent_chf: float
    monthly_remaining_chf: float
    auto_topup_enabled: bool
    auto_topup_threshold_chf: float
    auto_topup_amount_chf: float
    has_saved_card: bool
    has_active_subscription: bool
    # Storage
    storage_used_bytes: int
    storage_limit_bytes: int
    storage_extra_bytes: int
    storage_addon_items: list


class WalletSettingsIn(BaseModel):
    monthly_limit_chf: Optional[float] = None
    per_tx_limit_chf: Optional[float] = None
    auto_topup_enabled: Optional[bool] = None
    auto_topup_threshold_chf: Optional[float] = None
    auto_topup_amount_chf: Optional[float] = None


class BankTransferOut(BaseModel):
    reference: str
    amount_chf: float
    iban: str
    recipient: str
    note: str


class AdminCreditIn(BaseModel):
    customer_id: str
    amount_chf: float = Field(..., ge=0.01, le=10_000)
    description: str = "Manuelle Gutschrift durch Admin"


# ── Storage Add-ons ────────────────────────────────────────────────────────────

class StorageAddonIn(BaseModel):
    addon_key: str   # "10gb" | "50gb" | "500gb"
