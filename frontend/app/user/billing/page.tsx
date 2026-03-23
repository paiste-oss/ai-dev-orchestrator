"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, getToken } from "@/lib/auth";
import CurrentPlanCard from "@/components/user/billing/CurrentPlanCard";
import PlanGrid from "@/components/user/billing/PlanGrid";
import BillingHistory from "@/components/user/billing/BillingHistory";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

  const [plans,        setPlans]        = useState<Plan[]>([]);
  const [status,       setStatus]       = useState<BillingStatus | null>(null);
  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [topupAmount,  setTopupAmount]  = useState("20");
  const [tosChecked,   setTosChecked]   = useState(false);
  const [alert,        setAlert]        = useState<{ type: "success" | "error"; text: string } | null>(null);

  const token = getToken();

  const load = useCallback(async () => {
    if (!token) return;
    const headers = authHeaders();
    const [p, s, i] = await Promise.all([
      fetch(`${API}/v1/billing/plans`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/billing/status`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/billing/invoices`, { headers }).then((r) => r.json()),
    ]);
    setPlans(Array.isArray(p) ? p : []);
    setStatus(s.detail ? null : s);
    setInvoices(Array.isArray(i) ? i : []);
  }, [token]);

  useEffect(() => {
    const user = getSession();
    if (!user) { router.replace("/login"); return; }
    load();
    const s = searchParams.get("status");
    if (s === "success")       setAlert({ type: "success", text: "Zahlung erfolgreich! Dein Abo ist jetzt aktiv." });
    if (s === "topup_success") setAlert({ type: "success", text: "Guthaben erfolgreich aufgeladen!" });
    if (s === "canceled")      setAlert({ type: "error",   text: "Zahlung abgebrochen." });
  }, [load, router, searchParams]);

  async function acceptTos() {
    await fetch(`${API}/v1/billing/accept-tos`, { method: "POST", headers: authHeaders() });
    await load();
  }

  async function startCheckout(planSlug: string, cycle: "monthly" | "yearly") {
    if (!status?.tos_accepted) {
      setAlert({ type: "error", text: "Bitte akzeptiere zuerst die Nutzungsbedingungen." });
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/billing/checkout`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ plan_slug: planSlug, billing_cycle: cycle }),
      });
      const data = await r.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setAlert({ type: "error", text: data.detail ?? "Fehler beim Checkout." });
      }
    } finally { setLoading(false); }
  }

  async function startTopup() {
    const amount = parseFloat(topupAmount);
    if (isNaN(amount) || amount < 5) {
      setAlert({ type: "error", text: "Minimalbetrag ist CHF 5." });
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/billing/topup`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ amount_chf: amount }),
      });
      const data = await r.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setAlert({ type: "error", text: data.detail ?? "Fehler beim Aufladen." });
      }
    } finally { setLoading(false); }
  }

  async function openPortal() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/billing/portal`, {
        method: "POST",
        headers: authHeaders(),
      });
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
            <h1 className="text-2xl font-bold text-white">Abonnement & Abrechnung</h1>
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
          <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between
            ${alert.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
            <span>{alert.text}</span>
            <button onClick={() => setAlert(null)} className="text-lg leading-none opacity-50 hover:opacity-100">×</button>
          </div>
        )}

        {/* Status-Übersicht */}
        {status && (
          <CurrentPlanCard status={status} loading={loading} onOpenPortal={openPortal} />
        )}

        {/* ToS-Akzeptanz */}
        {status && !status.tos_accepted && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-yellow-300">Nutzungsbedingungen akzeptieren</p>
            <p className="text-xs text-gray-400">
              Bitte akzeptiere die{" "}
              <a href="/tos" target="_blank" className="text-blue-400 underline">Nutzungsbedingungen</a>{" "}
              und{" "}
              <a href="/datenschutz" target="_blank" className="text-blue-400 underline">Datenschutzrichtlinie</a>{" "}
              um ein Abo abzuschliessen. Dein Einverständnis wird mit Zeitstempel gespeichert (DSG-konform).
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={tosChecked}
                onChange={(e) => setTosChecked(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500"
              />
              <span className="text-xs text-gray-300">Ich akzeptiere die Nutzungsbedingungen</span>
            </label>
            <button
              onClick={acceptTos}
              disabled={!tosChecked}
              className="bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-semibold px-5 py-2 rounded-xl transition-all"
            >
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

        {/* Guthaben aufladen */}
        {isActive && (
          <section className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Guthaben aufladen</h2>
            <p className="text-xs text-gray-500">
              Lade Guthaben vor, das automatisch für Tokens verbraucht wird die über dein Monatskontingent gehen.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <span className="text-xs text-gray-500 px-3">CHF</span>
                <input
                  type="number"
                  min={5}
                  max={500}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="bg-transparent text-white text-sm font-semibold w-20 px-2 py-2.5 outline-none"
                />
              </div>
              {[10, 20, 50].map((v) => (
                <button
                  key={v}
                  onClick={() => setTopupAmount(String(v))}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:border-blue-500/50 hover:text-blue-400 transition-all"
                >
                  {v}
                </button>
              ))}
              <button
                onClick={startTopup}
                disabled={loading}
                className="ml-auto bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all"
              >
                Jetzt aufladen →
              </button>
            </div>
          </section>
        )}

        {/* Rechnungshistorie */}
        <BillingHistory invoices={invoices} />

      </div>
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
