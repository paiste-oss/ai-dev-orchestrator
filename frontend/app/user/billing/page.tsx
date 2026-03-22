"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, getToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Typen ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function statusColor(s: string) {
  if (s === "active") return "text-green-400 bg-green-400/10 border-green-400/20";
  if (s === "trialing") return "text-blue-400 bg-blue-400/10 border-blue-400/20";
  if (s === "past_due") return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  if (s === "canceled") return "text-red-400 bg-red-400/10 border-red-400/20";
  return "text-gray-400 bg-gray-400/10 border-gray-400/20";
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    active: "Aktiv",
    trialing: "Testphase",
    past_due: "Zahlung ausstehend",
    canceled: "Gekündigt",
    inactive: "Kein Abo",
  };
  return map[s] ?? s;
}

// ── Plan-Karte ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrentPlan,
  cycle,
  onSelect,
  loading,
}: {
  plan: Plan;
  isCurrentPlan: boolean;
  cycle: "monthly" | "yearly";
  onSelect: () => void;
  loading: boolean;
}) {
  const price = cycle === "yearly" ? plan.yearly_monthly_equivalent : plan.monthly_price;
  const highlights = plan.features?.highlights ?? [];

  return (
    <div className={`
      relative rounded-2xl border p-5 flex flex-col gap-4 transition-all
      ${isCurrentPlan
        ? "border-blue-500/60 bg-blue-500/5 shadow-lg shadow-blue-500/10"
        : "border-white/10 bg-white/2 hover:border-white/20"}
    `}>
      {isCurrentPlan && (
        <span className="absolute -top-2.5 left-4 text-[10px] font-bold bg-blue-500 text-white px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          Dein Plan
        </span>
      )}

      <div>
        <p className="text-base font-bold text-white">{plan.name}</p>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-2xl font-black text-white">CHF {price.toFixed(2)}</span>
          <span className="text-xs text-gray-500">/Monat</span>
        </div>
        {cycle === "yearly" && plan.yearly_discount_percent > 0 && (
          <p className="text-xs text-green-400 mt-0.5">
            −{plan.yearly_discount_percent}% bei Jahresabo (CHF {plan.yearly_price.toFixed(2)}/Jahr)
          </p>
        )}
      </div>

      <ul className="space-y-1.5 flex-1">
        <li className="flex items-center gap-2 text-xs text-gray-300">
          <span className="text-blue-400">✓</span>
          {formatTokens(plan.included_tokens)} Tokens/Monat inklusive
        </li>
        <li className="flex items-center gap-2 text-xs text-gray-400">
          <span className="text-gray-600">·</span>
          Overage: CHF {(plan.token_overage_chf_per_1k * 100).toFixed(2)}/100k Tokens
        </li>
        <li className="flex items-center gap-2 text-xs text-gray-300">
          <span className="text-blue-400">✓</span>
          Bis zu {plan.max_buddies} {plan.max_buddies === 1 ? "Baddi" : "Baddis"}
        </li>
        {highlights.map((h) => (
          <li key={h} className="flex items-center gap-2 text-xs text-gray-300">
            <span className="text-blue-400">✓</span>
            {h}
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        disabled={loading || isCurrentPlan}
        className={`
          w-full py-2.5 rounded-xl text-xs font-semibold transition-all border
          ${isCurrentPlan
            ? "border-blue-500/30 text-blue-400 cursor-default"
            : "border-white/10 bg-white/5 text-white hover:bg-blue-500 hover:border-blue-500"}
          disabled:opacity-50
        `}
      >
        {isCurrentPlan ? "Aktueller Plan" : `${plan.name} wählen`}
      </button>
    </div>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

function BillingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);
  const [topupAmount, setTopupAmount] = useState("20");
  const [tosChecked, setTosChecked] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

    // Checkout-Rückleitung auswerten
    const s = searchParams.get("status");
    if (s === "success") setAlert({ type: "success", text: "Zahlung erfolgreich! Dein Abo ist jetzt aktiv." });
    if (s === "topup_success") setAlert({ type: "success", text: "Guthaben erfolgreich aufgeladen!" });
    if (s === "canceled") setAlert({ type: "error", text: "Zahlung abgebrochen." });
  }, [load, router, searchParams]);

  async function acceptTos() {
    await fetch(`${API}/v1/billing/accept-tos`, { method: "POST", headers: authHeaders() });
    await load();
  }

  async function startCheckout(planSlug: string) {
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
    } finally {
      setLoading(false);
    }
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
    } finally {
      setLoading(false);
    }
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
    } finally {
      setLoading(false);
    }
  }

  const tokenPct = status
    ? Math.min(100, (status.tokens_used_this_period / Math.max(1, status.tokens_included)) * 100)
    : 0;
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Aktueller Plan</p>
              <p className="text-base font-bold text-white">{status.plan_name ?? "Kein Abo"}</p>
              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(status.subscription_status)}`}>
                {statusLabel(status.subscription_status)}
              </span>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Tokens diesen Monat</p>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-white">{formatTokens(status.tokens_used_this_period)}</span>
                <span className="text-xs text-gray-600">/ {formatTokens(status.tokens_included)}</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${tokenPct > 90 ? "bg-red-500" : tokenPct > 70 ? "bg-yellow-500" : "bg-blue-500"}`}
                  style={{ width: `${tokenPct}%` }}
                />
              </div>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Prepaid-Guthaben</p>
              <p className="text-base font-bold text-white">CHF {status.token_balance_chf.toFixed(2)}</p>
              <p className="text-xs text-gray-600">
                Overage: CHF {(status.overage_rate_chf_per_1k * 100).toFixed(2)}/100k Tokens
              </p>
              <button
                onClick={() => router.push("/user/wallet")}
                className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                Wallet verwalten →
              </button>
            </div>
          </div>
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
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Abonnement wählen</h2>
            {/* Monatlich / Jährlich Toggle */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
              {(["monthly", "yearly"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                  className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-all ${
                    cycle === c ? "bg-blue-500 text-white shadow" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {c === "monthly" ? "Monatlich" : "Jährlich"}
                  {c === "yearly" && <span className="ml-1.5 text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">−20%</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrentPlan={status?.plan_slug === plan.slug && status?.subscription_status === "active"}
                cycle={cycle}
                onSelect={() => startCheckout(plan.slug)}
                loading={loading}
              />
            ))}
          </div>

          <p className="text-xs text-gray-600 text-center">
            Alle Preise inkl. 8.1% MwSt · Monatlich kündbar · Sichere Zahlung via Stripe
          </p>
        </section>

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
        {invoices.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-white">Rechnungen</h2>
            <div className="rounded-2xl border border-white/8 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-white/3 border-b border-white/8">
                  <tr>
                    <th className="text-left text-gray-500 font-medium px-4 py-3">Rechnungs-Nr.</th>
                    <th className="text-left text-gray-500 font-medium px-4 py-3">Beschreibung</th>
                    <th className="text-right text-gray-500 font-medium px-4 py-3">Betrag inkl. MwSt</th>
                    <th className="text-right text-gray-500 font-medium px-4 py-3">Status</th>
                    <th className="text-right text-gray-500 font-medium px-4 py-3">Datum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-white/2 transition-colors">
                      <td className="px-4 py-3 text-gray-400 font-mono">
                        {inv.invoice_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{inv.description}</td>
                      <td className="px-4 py-3 text-right text-white font-medium">
                        CHF {inv.amount_chf.toFixed(2)}
                        <span className="text-gray-600 ml-1">(inkl. {inv.vat_chf.toFixed(2)} MwSt)</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold
                          ${inv.status === "succeeded" ? "text-green-400 bg-green-400/10 border-green-400/20"
                          : inv.status === "failed" ? "text-red-400 bg-red-400/10 border-red-400/20"
                          : "text-gray-400 bg-gray-400/10 border-gray-400/20"}`}>
                          {inv.status === "succeeded" ? "Bezahlt" : inv.status === "failed" ? "Fehlgeschlagen" : inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {new Date(inv.paid_at ?? inv.created_at).toLocaleDateString("de-CH")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-700">
              Rechnungen werden 10 Jahre aufbewahrt (OR Art. 958f). Bei Fragen: support@baddi.ch
            </p>
          </section>
        )}

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
