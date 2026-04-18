"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, getToken, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import CurrentPlanCard from "@/components/user/billing/CurrentPlanCard";
import PlanGrid from "@/components/user/billing/PlanGrid";
import BillingHistory from "@/components/user/billing/BillingHistory";
import WalletBalanceCard from "@/components/user/wallet/WalletBalanceCard";
import TopupModal from "@/components/user/wallet/TopupModal";
import WalletSettingsModal from "@/components/user/wallet/WalletSettingsModal";
import StorageAddons from "@/components/user/wallet/StorageAddons";

interface Plan {
  id: string;
  name: string;
  slug: string;
  monthly_price: number;
  yearly_price: number;
  yearly_monthly_equivalent: number;
  yearly_discount_percent: number;
  included_tokens: number;
  token_overage_chf_per_1k: number;
  max_buddies: number;
  features: { highlights?: string[]; allowed_services?: string[] };
  sort_order: number;
}

interface BillingStatus {
  plan_name: string | null;
  plan_slug: string | null;
  subscription_status: string;
  billing_cycle: string;
  subscription_period_end: string | null;
  tokens_used_this_period: number;
  tokens_included: number;
  token_balance_chf: number;
  overage_rate_chf_per_1k: number;
  tos_accepted: boolean;
}

interface WalletStatus {
  balance_chf: number;
  monthly_limit_chf: number;
  per_tx_limit_chf: number;
  monthly_spent_chf: number;
  monthly_remaining_chf: number;
  auto_topup_enabled: boolean;
  auto_topup_threshold_chf: number;
  auto_topup_amount_chf: number;
  has_saved_card: boolean;
  has_active_subscription: boolean;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_extra_bytes: number;
  storage_addon_items: { key: string; bytes: number; added_at: string }[];
}

interface StorageAddon {
  key: string;
  label: string;
  bytes: number;
  price_chf: number;
  description: string;
}

interface Invoice {
  id: string;
  invoice_number: string | null;
  amount_chf: number;
  vat_chf: number;
  amount_net_chf: number;
  description: string;
  payment_type: string;
  status: string;
  created_at: string;
  paid_at: string | null;
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

function BillingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [plans,          setPlans]          = useState<Plan[]>([]);
  const [status,         setStatus]         = useState<BillingStatus | null>(null);
  const [wallet,         setWallet]         = useState<WalletStatus | null>(null);
  const [invoices,       setInvoices]       = useState<Invoice[]>([]);
  const [addons,         setAddons]         = useState<StorageAddon[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [tosChecked,     setTosChecked]     = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [alert,          setAlert]          = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, w, i, a] = await Promise.all([
        fetch(`${BACKEND_URL}/v1/billing/plans`,          { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BACKEND_URL}/v1/billing/status`,         { headers: authHeaders() }).then(r => r.json()),
        apiFetch(`${BACKEND_URL}/v1/billing/wallet`).then(r => r.ok ? r.json() : null),
        apiFetch(`${BACKEND_URL}/v1/billing/invoices`).then(r => r.ok ? r.json() : []),
        apiFetch(`${BACKEND_URL}/v1/billing/storage/addons`).then(r => r.ok ? r.json() : []),
      ]);
      setPlans(Array.isArray(p) ? p : []);
      setStatus(s.detail ? null : s);
      setWallet(w);
      setInvoices(Array.isArray(i) ? i : []);
      setAddons(Array.isArray(a) ? a : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!getSession()) { router.replace("/login"); return; }
    load();
    const s = searchParams.get("status");
    if (s === "success")       setAlert({ type: "success", text: "Zahlung erfolgreich! Dein Abo ist jetzt aktiv." });
    if (s === "topup_success") setAlert({ type: "success", text: "Guthaben erfolgreich aufgeladen!" });
    if (s === "canceled")      setAlert({ type: "error",   text: "Zahlung abgebrochen." });
  }, [load, router, searchParams]);

  async function acceptTos() {
    await fetch(`${BACKEND_URL}/v1/billing/accept-tos`, { method: "POST", headers: authHeaders() });
    await load();
  }

  async function startCheckout(planSlug: string, cycle: "monthly" | "yearly") {
    if (!status?.tos_accepted) {
      setAlert({ type: "error", text: "Bitte akzeptiere zuerst die Nutzungsbedingungen." });
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/v1/billing/checkout`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ plan_slug: planSlug, billing_cycle: cycle }),
      });
      const data = await r.json();
      if (data.checkout_url) window.location.href = data.checkout_url;
      else setAlert({ type: "error", text: data.detail ?? "Fehler beim Checkout." });
    } finally { setLoading(false); }
  }

  async function openPortal() {
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/v1/billing/portal`, { method: "POST", headers: authHeaders() });
      const data = await r.json();
      if (data.portal_url) window.location.href = data.portal_url;
    } finally { setLoading(false); }
  }

  const isActive = status?.subscription_status === "active" || status?.subscription_status === "trialing";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-5 py-10 space-y-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => router.push("/chat")} className="text-xs text-gray-600 hover:text-gray-400 mb-3 flex items-center gap-1">
              ← Zurück zum Chat
            </button>
            <h1 className="text-2xl font-bold text-white">Abonnement & Wallet</h1>
            <p className="text-sm text-gray-500 mt-1">Plan verwalten, Guthaben aufladen, Rechnungen herunterladen</p>
          </div>
          {isActive && (
            <button
              onClick={openPortal}
              disabled={loading}
              className="text-xs bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-xl transition-all"
            >
              Karte / Abo verwalten →
            </button>
          )}
        </div>

        {/* Alert */}
        {alert && (
          <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between ${
            alert.type === "success"
              ? "bg-green-500/10 border-green-500/30 text-green-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}>
            <span>{alert.text}</span>
            <button onClick={() => setAlert(null)} className="text-lg leading-none opacity-50 hover:opacity-100">×</button>
          </div>
        )}

        {/* Aktueller Plan */}
        {status && <CurrentPlanCard status={status} loading={loading} onOpenPortal={openPortal} />}

        {/* ToS */}
        {status && !status.tos_accepted && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-yellow-300">Nutzungsbedingungen akzeptieren</p>
            <p className="text-xs text-gray-400">
              Bitte akzeptiere die{" "}
              <a href="/tos" target="_blank" className="text-blue-400 underline">Nutzungsbedingungen</a>{" "}
              und{" "}
              <a href="/datenschutz" target="_blank" className="text-blue-400 underline">Datenschutzrichtlinie</a>{" "}
              um ein Abo abzuschliessen.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={tosChecked} onChange={e => setTosChecked(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500" />
              <span className="text-xs text-gray-300">Ich akzeptiere die Nutzungsbedingungen</span>
            </label>
            <button onClick={acceptTos} disabled={!tosChecked}
              className="bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-semibold px-5 py-2 rounded-xl transition-all">
              Bestätigen
            </button>
          </div>
        )}

        {/* Plan-Auswahl */}
        <PlanGrid
          plans={plans}
          currentPlanSlug={status?.plan_slug ?? null}
          currentStatus={status?.subscription_status ?? ""}
          loading={loading}
          onSelectPlan={startCheckout}
        />

        {/* Wallet */}
        {wallet && (
          <>
            <div className="border-t border-white/6 pt-8">
              <h2 className="text-sm font-semibold text-white mb-5">Wallet & Guthaben</h2>
              <div className="space-y-5">
                <WalletBalanceCard wallet={wallet} onOpenSettings={() => setSettingsOpen(true)} />
                <TopupModal hasActiveSubscription={wallet.has_active_subscription} />
                <StorageAddons wallet={wallet} addons={addons} onAddonPurchased={load} />
              </div>
            </div>
          </>
        )}

        {/* Rechnungen */}
        <div className="border-t border-white/6 pt-8">
          <BillingHistory invoices={invoices} />
        </div>

      </div>

      {settingsOpen && wallet && (
        <WalletSettingsModal
          wallet={wallet}
          onClose={() => setSettingsOpen(false)}
          onSaved={updated => setWallet(prev => prev ? { ...prev, ...updated } : prev)}
        />
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <BillingPageInner />
    </Suspense>
  );
}
