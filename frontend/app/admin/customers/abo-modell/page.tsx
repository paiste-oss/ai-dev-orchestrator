"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  slug: string;
  monthly_price: number;
  yearly_price: number;
  included_tokens: number;
  daily_token_limit: number | null;
  requests_per_hour: number | null;
  token_overage_chf_per_1k: number;
  storage_limit_bytes: number;
  max_buddies: number;
  features: { highlights?: string[]; allowed_services?: string[] };
  sort_order: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
}

function fmtStorage(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

interface StripeStatus {
  secret_key_set: boolean;
  webhook_secret_set: boolean;
  price_ids: Record<string, string | null>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-green-400" : "text-red-400"}`}>
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-red-400"}`} />
      {ok ? "Konfiguriert" : "Fehlt"}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-xs text-gray-500 hover:text-yellow-400 transition-colors px-1.5 py-0.5 rounded hover:bg-yellow-400/10">
      {copied ? "✓" : "⎘"}
    </button>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  plan: Plan;
  onSave: (updated: Plan) => void;
  onClose: () => void;
}

function EditModal({ plan, onSave, onClose }: EditModalProps) {
  const [form, setForm] = useState({
    name:                     plan.name,
    monthly_price:            String(plan.monthly_price),
    yearly_price:             String(plan.yearly_price),
    included_tokens:          String(plan.included_tokens),
    daily_token_limit:        String(plan.daily_token_limit ?? ""),
    requests_per_hour:        String(plan.requests_per_hour ?? ""),
    token_overage_chf_per_1k: String(plan.token_overage_chf_per_1k),
    storage_limit_gb:         String(Math.round(plan.storage_limit_bytes / (1024 * 1024 * 1024)) || 0),
    stripe_price_id_monthly:  plan.stripe_price_id_monthly ?? "",
    stripe_price_id_yearly:   plan.stripe_price_id_yearly ?? "",
    highlights:               (plan.features.highlights ?? []).join("\n"),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body = {
        name:                     form.name,
        monthly_price:            parseFloat(form.monthly_price),
        yearly_price:             parseFloat(form.yearly_price),
        included_tokens:          parseInt(form.included_tokens),
        daily_token_limit:        form.daily_token_limit ? parseInt(form.daily_token_limit) : null,
        requests_per_hour:        form.requests_per_hour ? parseInt(form.requests_per_hour) : null,
        token_overage_chf_per_1k: parseFloat(form.token_overage_chf_per_1k),
        storage_limit_bytes: Math.round(parseFloat(form.storage_limit_gb) * 1024 * 1024 * 1024),
        stripe_price_id_monthly:  form.stripe_price_id_monthly || null,
        stripe_price_id_yearly:   form.stripe_price_id_yearly || null,
        features: {
          ...plan.features,
          highlights: form.highlights.split("\n").map(s => s.trim()).filter(Boolean),
        },
      };
      const res = await apiFetch(`${BACKEND_URL}/v1/billing/admin/plans/${plan.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? "Fehler");
      onSave(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors";
  const labelCls = "text-xs text-gray-400 font-medium";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white text-lg">Plan bearbeiten — {plan.name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className={labelCls}>Name</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Preis monatlich (CHF)</label>
            <input type="number" step="0.01" value={form.monthly_price} onChange={e => set("monthly_price", e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Preis jährlich (CHF)</label>
            <input type="number" step="0.01" value={form.yearly_price} onChange={e => set("yearly_price", e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Tokens / Monat</label>
            <input type="number" value={form.included_tokens} onChange={e => set("included_tokens", e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Tokens / Tag</label>
            <input type="number" value={form.daily_token_limit} onChange={e => set("daily_token_limit", e.target.value)} className={inputCls} placeholder="leer = kein Limit" />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Max. Anfragen / Stunde</label>
            <input type="number" value={form.requests_per_hour} onChange={e => set("requests_per_hour", e.target.value)} className={inputCls} placeholder="leer = kein Limit" />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Overage CHF / 1k Token</label>
            <input type="number" step="0.0001" value={form.token_overage_chf_per_1k} onChange={e => set("token_overage_chf_per_1k", e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Speicher (GB)</label>
            <input type="number" step="1" min="0" value={form.storage_limit_gb} onChange={e => set("storage_limit_gb", e.target.value)} className={inputCls} placeholder="z.B. 5" />
          </div>
        </div>

        <div className="space-y-3 border-t border-gray-700 pt-4">
          <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">Stripe Price IDs</p>
          <div className="space-y-1">
            <label className={labelCls}>Price ID monatlich (price_xxx)</label>
            <input value={form.stripe_price_id_monthly} onChange={e => set("stripe_price_id_monthly", e.target.value)}
              placeholder="price_1..." className={inputCls + " font-mono"} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Price ID jährlich (price_xxx)</label>
            <input value={form.stripe_price_id_yearly} onChange={e => set("stripe_price_id_yearly", e.target.value)}
              placeholder="price_1..." className={inputCls + " font-mono"} />
          </div>
        </div>

        <div className="space-y-1 border-t border-gray-700 pt-4">
          <label className={labelCls}>Feature-Highlights (eine pro Zeile)</label>
          <textarea rows={4} value={form.highlights} onChange={e => set("highlights", e.target.value)}
            className={inputCls + " resize-none"} placeholder="1 Baddi&#10;500'000 Tokens/Monat&#10;E-Mail-Support" />
        </div>

        {error && <p className="text-red-400 text-xs bg-red-950/30 border border-red-800/40 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            Abbrechen
          </button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-yellow-400 hover:bg-yellow-300 text-gray-900 transition-colors disabled:opacity-50">
            {saving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────

export default function AboModellPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);

  useEffect(() => {
    const u = getSession();
    if (!u || u.role !== "admin") { router.replace("/login"); return; }
    load();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/billing/admin/plans`),
        apiFetch(`${BACKEND_URL}/v1/billing/admin/stripe-status`),
      ]);
      if (pRes.ok) setPlans(await pRes.json());
      if (sRes.ok) setStripe(await sRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSaved = (updated: Plan) => {
    setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
    setEditPlan(null);
  };

  const webhookUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://api.baddi.ch"}/v1/billing/webhook`;

  const PLAN_COLORS: Record<string, string> = {
    basis:   "border-indigo-500/40",
    komfort: "border-violet-500/50 ring-1 ring-violet-500/20",
    premium: "border-yellow-500/40",
  };


  return (
    <>
      {editPlan && <EditModal plan={editPlan} onSave={handleSaved} onClose={() => setEditPlan(null)} />}

      <div className="p-4 md:p-8 space-y-8 min-w-0">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">💳 Abo-Modell</h1>
            <p className="text-gray-400 text-sm mt-0.5">Pläne konfigurieren, Stripe verknüpfen, Preise festlegen</p>
          </div>
        </div>

        {/* ── Stripe-Verbindung ── */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-white">Stripe-Verbindung</h2>
              <p className="text-xs text-gray-500 mt-0.5">API-Keys und Webhook — werden via Infisical gesetzt</p>
            </div>
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 text-sm font-medium transition-colors">
              Stripe Dashboard ↗
            </a>
          </div>

          {stripe ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-1">
                <p className="text-xs text-gray-500">Secret Key</p>
                <StatusDot ok={stripe.secret_key_set} />
                <p className="text-[10px] text-gray-600 mt-1">STRIPE_SECRET_KEY in Infisical</p>
              </div>
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-1">
                <p className="text-xs text-gray-500">Webhook Secret</p>
                <StatusDot ok={stripe.webhook_secret_set} />
                <p className="text-[10px] text-gray-600 mt-1">STRIPE_WEBHOOK_SECRET in Infisical</p>
              </div>
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-1">
                <p className="text-xs text-gray-500">Webhook-Endpunkt</p>
                <p className="text-xs text-green-400 font-medium">Aktiv</p>
                <div className="flex items-center gap-1 mt-1">
                  <code className="text-[10px] text-gray-400 font-mono truncate">{webhookUrl}</code>
                  <CopyButton value={webhookUrl} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{loading ? "Lädt…" : "Stripe-Status nicht verfügbar"}</p>
          )}

          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Stripe Events — für Webhook konfigurieren</p>
            <div className="flex flex-wrap gap-2">
              {[
                "checkout.session.completed",
                "invoice.payment_succeeded",
                "invoice.payment_failed",
                "customer.subscription.updated",
                "customer.subscription.deleted",
              ].map(e => (
                <code key={e} className="text-xs bg-gray-800 border border-gray-700 px-2 py-1 rounded-lg text-gray-300 font-mono">
                  {e}
                </code>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pläne ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Abo-Pläne</h2>
            <span className="text-xs text-gray-500">{plans.length} Pläne in der Datenbank</span>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm gap-3">
              <span className="animate-spin text-xl">⏳</span> Lädt…
            </div>
          )}

          {/* Trial-Hinweis */}
          {!loading && (
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-indigo-400 text-lg shrink-0">ⓘ</span>
              <div className="text-sm">
                <p className="text-indigo-300 font-medium">14 Tage Gratis-Testzeit — Personal-Plan</p>
                <p className="text-gray-400 text-xs mt-1">
                  Neukunden erhalten beim Personal-Plan automatisch 14 Tage gratis (Stripe Trial). Die Kreditkarte wird erst nach Ablauf der Testphase belastet. Gilt nur einmalig pro Kunde und nur wenn noch kein Abo aktiv war.
                </p>
              </div>
            </div>
          )}

          {/* Pläne */}
          {!loading && plans.map(plan => {
            const borderCls = PLAN_COLORS[plan.slug] ?? "border-gray-700";
            const hasStripeMonthly = !!plan.stripe_price_id_monthly;
            const hasStripeYearly = !!plan.stripe_price_id_yearly;

            return (
              <div key={plan.id} className={`bg-gray-900 border rounded-2xl p-5 flex flex-col sm:flex-row gap-5 ${borderCls}`}>
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-bold text-white">{plan.name}</span>
                    <code className="text-xs text-gray-500 font-mono bg-gray-800 px-2 py-0.5 rounded">{plan.slug}</code>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-xs text-gray-500">Stripe:</span>
                      <StatusDot ok={hasStripeMonthly && hasStripeYearly} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
                    <div>
                      <p className="text-gray-500">Monatlich</p>
                      <p className="text-white font-semibold">CHF {plan.monthly_price.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Jährlich</p>
                      <p className="text-white font-semibold">CHF {plan.yearly_price.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Tokens/Mo</p>
                      <p className="text-white font-semibold">{formatTokens(plan.included_tokens)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Tokens/Tag</p>
                      <p className="text-white font-semibold">{plan.daily_token_limit ? formatTokens(plan.daily_token_limit) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Anf./Std.</p>
                      <p className="text-white font-semibold">{plan.requests_per_hour ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Speicher</p>
                      <p className="text-white font-semibold">{fmtStorage(plan.storage_limit_bytes)}</p>
                    </div>
                  </div>

                  {/* Stripe Price IDs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-xs ${
                      hasStripeMonthly ? "bg-green-950/20 border-green-800/30" : "bg-gray-800/50 border-gray-700"
                    }`}>
                      <span className="text-gray-500 shrink-0">Mo:</span>
                      <code className={`font-mono truncate ${hasStripeMonthly ? "text-green-300" : "text-gray-600 italic"}`}>
                        {plan.stripe_price_id_monthly ?? "nicht gesetzt"}
                      </code>
                      {hasStripeMonthly && <CopyButton value={plan.stripe_price_id_monthly!} />}
                    </div>
                    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-xs ${
                      hasStripeYearly ? "bg-green-950/20 border-green-800/30" : "bg-gray-800/50 border-gray-700"
                    }`}>
                      <span className="text-gray-500 shrink-0">Jähr:</span>
                      <code className={`font-mono truncate ${hasStripeYearly ? "text-green-300" : "text-gray-600 italic"}`}>
                        {plan.stripe_price_id_yearly ?? "nicht gesetzt"}
                      </code>
                      {hasStripeYearly && <CopyButton value={plan.stripe_price_id_yearly!} />}
                    </div>
                  </div>

                  {/* Highlights */}
                  {plan.features.highlights && plan.features.highlights.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {plan.features.highlights.map(h => (
                        <span key={h} className="text-xs bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-lg text-gray-400">{h}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex sm:flex-col gap-2 sm:items-end sm:justify-start shrink-0">
                  <button onClick={() => setEditPlan(plan)}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-yellow-400/40 text-gray-300 hover:text-yellow-400 transition-colors">
                    ✏ Bearbeiten
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        {/* ── Infisical Hinweis ── */}
        <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">🔑 Secrets via Infisical setzen</h3>
          <div className="space-y-2 font-mono text-xs text-gray-400">
            <div className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-2">
              <span className="text-gray-600">$</span>
              <code>infisical secrets set STRIPE_SECRET_KEY=&quot;sk_live_...&quot;</code>
            </div>
            <div className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-2">
              <span className="text-gray-600">$</span>
              <code>infisical secrets set STRIPE_WEBHOOK_SECRET=&quot;whsec_...&quot;</code>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-3">Nach dem Setzen muss der Backend-Container neu gestartet werden (<code className="font-mono">docker compose restart backend</code>).</p>
        </section>

      </div>
    </>
  );
}
