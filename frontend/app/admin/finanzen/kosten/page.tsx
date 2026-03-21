"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillingCycle = "monatlich" | "jährlich" | "einmalig" | "nutzungsbasiert";
type Currency = "CHF" | "USD" | "EUR";
type Category = "api" | "abo" | "infrastruktur" | "entwicklung" | "sonstiges";

interface CostEntry {
  id: string;
  name: string;
  provider: string;
  category: Category;
  billing_cycle: BillingCycle;
  amount_original: number;
  currency: Currency;
  amount_chf_monthly: number;
  url: string | null;
  notes: string | null;
  balance_chf: number | null;
  balance_updated_at: string | null;
  is_active: boolean;
}

interface Revenue {
  total_monthly_chf: number;
  total_yearly_chf: number;
  paying_customers: number;
  free_customers: number;
  total_customers: number;
}

interface LiveUsage {
  openai?: { total_usd: number; total_chf: number; period: string };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { key: Category; label: string; icon: string; color: string; bg: string; border: string }[] = [
  { key: "api",           label: "APIs",          icon: "🔌", color: "text-blue-300",   bg: "bg-blue-950/40",   border: "border-blue-800/50" },
  { key: "abo",           label: "Abos",          icon: "📋", color: "text-violet-300", bg: "bg-violet-950/40", border: "border-violet-800/50" },
  { key: "infrastruktur", label: "Infrastruktur", icon: "🖥️", color: "text-cyan-300",   bg: "bg-cyan-950/40",   border: "border-cyan-800/50" },
  { key: "entwicklung",   label: "Entwicklung",   icon: "🛠️", color: "text-amber-300",  bg: "bg-amber-950/40",  border: "border-amber-800/50" },
  { key: "sonstiges",     label: "Sonstiges",     icon: "📦", color: "text-gray-300",   bg: "bg-gray-800/40",   border: "border-gray-700/50" },
];

// Richtwerte — Anzeige-Zwecke, keine exakte Buchführung
const FX: Record<Currency, number> = { CHF: 1, USD: 0.90, EUR: 0.96 };

function calcChfMonthly(amount: number, currency: Currency, cycle: BillingCycle): number {
  if (cycle === "nutzungsbasiert") return 0;
  const chf = amount * FX[currency];
  if (cycle === "jährlich") return Math.round((chf / 12) * 100) / 100;
  if (cycle === "einmalig") return 0;
  return Math.round(chf * 100) / 100;
}

const BILLING_URLS: Record<string, string> = {
  "google":     "https://console.cloud.google.com/billing",
  "openai":     "https://platform.openai.com/settings/organization/billing/overview",
  "anthropic":  "https://console.anthropic.com/settings/billing",
  "cloudflare": "https://dash.cloudflare.com/?to=/:account/billing",
  "n8n":        "https://app.n8n.cloud/billing",
  "github":     "https://github.com/settings/billing",
};

function billingUrl(entry: CostEntry): string | null {
  if (entry.url) return entry.url;
  return BILLING_URLS[entry.provider.toLowerCase()] ?? null;
}

const EMPTY_FORM = (): Omit<CostEntry, "id" | "balance_updated_at"> => ({
  name: "", provider: "", category: "api", billing_cycle: "monatlich",
  amount_original: 0, currency: "CHF", amount_chf_monthly: 0,
  url: "", notes: "", balance_chf: null, is_active: true,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function chf(n: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 2 }).format(n);
}

function MarginBar({ margin }: { margin: number }) {
  const pct = Math.min(Math.max(margin, -100), 100);
  const positive = pct >= 0;
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${positive ? "bg-green-500" : "bg-red-500"}`}
        style={{ width: `${Math.abs(pct)}%`, marginLeft: positive ? 0 : `${100 - Math.abs(pct)}%` }}
      />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KostenPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category | "alle">("alle");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<CostEntry | null>(null);
  const [form, setForm] = useState(EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [usage, setUsage] = useState<LiveUsage | null>(null);

  useEffect(() => {
    const u = getSession();
    setMounted(true);
    if (!u || u.role !== "admin") { router.replace("/login"); return; }
    load();
    apiFetch(`${BACKEND_URL}/v1/finance/revenue`).then(r => r.ok && r.json().then(setRevenue));
    apiFetch(`${BACKEND_URL}/v1/finance/usage`).then(r => r.ok && r.json().then(setUsage));
  }, []);

  if (!mounted) return null;

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/finance/costs`);
      if (res.ok) setEntries(await res.json());
    } finally { setLoading(false); }
  }

  // Auto-update CHF/Monat when amount/currency/cycle changes
  function updateFormAmount(patch: Partial<typeof form>) {
    setForm(f => {
      const next = { ...f, ...patch };
      const auto = calcChfMonthly(next.amount_original, next.currency, next.billing_cycle);
      return { ...next, amount_chf_monthly: auto };
    });
  }

  function openCreate() { setForm(EMPTY_FORM()); setEditEntry(null); setShowForm(true); }
  function openEdit(e: CostEntry) {
    setForm({ ...e, url: e.url ?? "", notes: e.notes ?? "" });
    setEditEntry(e);
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    try {
      const body = JSON.stringify({ ...form, url: form.url || null, notes: form.notes || null });
      const res = editEntry
        ? await apiFetch(`${BACKEND_URL}/v1/finance/costs/${editEntry.id}`, { method: "PATCH", body })
        : await apiFetch(`${BACKEND_URL}/v1/finance/costs`, { method: "POST", body });
      if (res.ok) { await load(); setShowForm(false); }
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Eintrag löschen?")) return;
    await apiFetch(`${BACKEND_URL}/v1/finance/costs/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const active = entries.filter(e => e.is_active);
  const totalCostsMonthly = active.reduce((s, e) => s + e.amount_chf_monthly, 0);
  const revenueMonthly = revenue?.total_monthly_chf ?? 0;
  const margin = revenueMonthly - totalCostsMonthly;
  const marginPct = revenueMonthly > 0 ? (margin / revenueMonthly) * 100 : -100;

  const filtered = entries
    .filter(e => activeCategory === "alle" || e.category === activeCategory)
    .filter(e => showInactive ? true : e.is_active);

  const catInfo = (key: Category) => CATEGORIES.find(c => c.key === key) ?? CATEGORIES[4];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl md:hidden">☰</button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">💰 Kosten</h1>
              <p className="text-gray-500 text-sm mt-0.5">Kostenübersicht — alle Ausgaben des Projekts</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm px-4 py-2 rounded-xl transition-colors shrink-0"
          >
            + Eintrag
          </button>
        </div>

        {/* ── Finanzen: Einnahmen vs. Ausgaben ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-green-900/40 rounded-2xl p-5 space-y-1">
            <p className="text-xs text-gray-500">Einnahmen / Monat</p>
            <p className="text-2xl font-bold text-green-400">{chf(revenueMonthly)}</p>
            <p className="text-xs text-gray-600">{revenue?.paying_customers ?? "—"} zahlende Kunden</p>
          </div>
          <div className="bg-gray-900 border border-red-900/40 rounded-2xl p-5 space-y-1">
            <p className="text-xs text-gray-500">Ausgaben / Monat</p>
            <p className="text-2xl font-bold text-red-400">{chf(totalCostsMonthly)}</p>
            <p className="text-xs text-gray-600">geschätzt, inkl. variabel</p>
          </div>
          <div className={`bg-gray-900 border rounded-2xl p-5 space-y-2 ${margin >= 0 ? "border-green-800/40" : "border-red-800/40"}`}>
            <p className="text-xs text-gray-500">Marge / Monat</p>
            <p className={`text-2xl font-bold ${margin >= 0 ? "text-green-400" : "text-red-400"}`}>{chf(margin)}</p>
            <MarginBar margin={marginPct} />
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-1">
            <p className="text-xs text-gray-500">Jahresprojektion</p>
            <p className="text-2xl font-bold text-yellow-400">{chf(margin * 12)}</p>
            <p className="text-xs text-gray-600">Marge × 12</p>
          </div>
        </div>

        {/* ── OpenAI Live Usage (nur wenn Daten vorhanden) ── */}
        {usage?.openai && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">OpenAI Verbrauch {usage.openai.period}</p>
              <p className="text-lg font-bold text-green-400">
                ${usage.openai.total_usd.toFixed(4)}
                <span className="text-sm text-gray-500 font-normal ml-2">≈ {chf(usage.openai.total_chf)}</span>
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-blue-950/50 border border-blue-800/50 text-blue-400 hover:bg-blue-900/50 transition-colors">
                OpenAI ↗
              </a>
              <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-orange-950/50 border border-orange-800/50 text-orange-400 hover:bg-orange-900/50 transition-colors">
                Anthropic ↗
              </a>
              <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-blue-950/50 border border-blue-800/50 text-blue-400 hover:bg-blue-900/50 transition-colors">
                Google ↗
              </a>
            </div>
          </div>
        )}

        {/* ── Kategorie-Filter ── */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setActiveCategory("alle")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm transition-colors ${
              activeCategory === "alle"
                ? "bg-gray-700 border-gray-600 text-white"
                : "bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600"
            }`}
          >
            Alle <span className="text-xs opacity-60">{entries.length}</span>
          </button>
          {CATEGORIES.map((cat) => {
            const total = active.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount_chf_monthly, 0);
            const count = entries.filter(e => e.category === cat.key).length;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(activeCategory === cat.key ? "alle" : cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm transition-colors ${
                  activeCategory === cat.key
                    ? `${cat.bg} ${cat.border} ${cat.color}`
                    : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600"
                }`}
              >
                {cat.icon} {cat.label}
                <span className="text-xs opacity-60">{count}</span>
                {total > 0 && (
                  <span className={`text-xs font-semibold ${activeCategory === cat.key ? cat.color : "text-gray-600"}`}>
                    {chf(total)}
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => setShowInactive(v => !v)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
              showInactive
                ? "bg-gray-800 border-gray-600 text-gray-300"
                : "bg-gray-900 border-gray-800 text-gray-600 hover:border-gray-600"
            }`}
          >
            {showInactive ? "◉" : "○"} Inaktive
          </button>
        </div>

        {/* ── Tabelle ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-600 py-12">Lade…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-600 py-12">Keine Einträge</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Name / Notiz</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Anbieter</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Kategorie</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Turnus</th>
                  <th className="text-right px-4 py-3">CHF/Mo</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">Guthaben</th>
                  <th className="px-5 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const cat = catInfo(e.category);
                  return (
                    <tr key={e.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${!e.is_active ? "opacity-35" : ""}`}>
                      <td className="px-5 py-3">
                        <span className="font-medium text-white">{e.name}</span>
                        {e.notes && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{e.notes}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-400 text-xs">{e.provider || "—"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cat.bg} ${cat.border} border ${cat.color}`}>
                          {cat.icon} {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-md ${
                          e.billing_cycle === "nutzungsbasiert" ? "bg-violet-950/50 text-violet-400" :
                          e.billing_cycle === "jährlich"        ? "bg-blue-950/50 text-blue-400" :
                          e.billing_cycle === "einmalig"        ? "bg-orange-950/50 text-orange-400" :
                                                                  "bg-gray-800 text-gray-400"
                        }`}>
                          {e.billing_cycle}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.billing_cycle === "nutzungsbasiert" && e.amount_chf_monthly === 0 ? (
                          <span className="text-gray-600 text-xs">variabel</span>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-white">{chf(e.amount_chf_monthly)}</span>
                            {e.amount_original > 0 && e.currency !== "CHF" && (
                              <span className="text-xs text-gray-600">{e.amount_original} {e.currency}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {e.balance_chf != null ? (
                          <div className="flex flex-col items-end">
                            <span className={`text-sm font-semibold ${e.balance_chf > 0 ? "text-green-400" : "text-red-400"}`}>
                              {chf(e.balance_chf)}
                            </span>
                            {e.balance_updated_at && (
                              <span className="text-xs text-gray-600">{new Date(e.balance_updated_at).toLocaleDateString("de-CH")}</span>
                            )}
                          </div>
                        ) : <span className="text-gray-700 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {billingUrl(e) && (
                            <a href={billingUrl(e)!} target="_blank" rel="noopener noreferrer"
                              className="text-xs px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-blue-400 hover:border-blue-800 transition-colors">
                              ↗
                            </a>
                          )}
                          <button onClick={() => openEdit(e)}
                            className="text-xs px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-yellow-400 hover:border-yellow-800 transition-colors">
                            ✏
                          </button>
                          <button onClick={() => remove(e.id)}
                            className="text-xs px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-900 transition-colors">
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-700 bg-gray-800/30">
                  <td colSpan={4} className="px-5 py-3 text-xs text-gray-500">
                    {filtered.filter(e => e.is_active).length} aktive Einträge · Beträge in CHF, variable Kosten geschätzt
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-yellow-400">
                      {chf(filtered.filter(e => e.is_active).reduce((s, e) => s + e.amount_chf_monthly, 0))}
                    </span>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* ── Modal: Add / Edit ── */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                <h2 className="font-bold text-white">{editEntry ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
              </div>

              <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Name + Provider */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400">Name *</label>
                    <input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                      placeholder="z.B. Gemini API"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400">Anbieter</label>
                    <input
                      value={form.provider}
                      onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                      placeholder="z.B. Google"
                    />
                  </div>
                </div>

                {/* Category + Billing cycle */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400">Kategorie</label>
                    <select
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                    >
                      {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400">Abrechnungsturnus</label>
                    <select
                      value={form.billing_cycle}
                      onChange={e => updateFormAmount({ billing_cycle: e.target.value as BillingCycle })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                    >
                      <option value="monatlich">Monatlich</option>
                      <option value="jährlich">Jährlich</option>
                      <option value="einmalig">Einmalig</option>
                      <option value="nutzungsbasiert">Nutzungsbasiert</option>
                    </select>
                  </div>
                </div>

                {/* Amount — auto-calculates CHF/Mo */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400">Betrag</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={form.amount_original}
                      onChange={e => updateFormAmount({ amount_original: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400">Währung</label>
                    <select
                      value={form.currency}
                      onChange={e => updateFormAmount({ currency: e.target.value as Currency })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                    >
                      <option>CHF</option>
                      <option>USD</option>
                      <option>EUR</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400">CHF / Monat</label>
                    <div className="relative">
                      <input
                        type="number" step="0.01" min="0"
                        value={form.amount_chf_monthly}
                        onChange={e => setForm(f => ({ ...f, amount_chf_monthly: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-gray-800 border border-yellow-900/50 rounded-lg px-3 py-2 text-sm text-yellow-300 outline-none focus:border-yellow-500"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-600">
                  CHF/Monat wird automatisch berechnet (jährlich ÷ 12, USD × 0.90, EUR × 0.96). Manuell überschreibbar.
                </p>

                {/* Balance */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">Aktuelles Guthaben (CHF) — optional</label>
                  <input
                    type="number" step="0.01"
                    value={form.balance_chf ?? ""}
                    onChange={e => setForm(f => ({ ...f, balance_chf: e.target.value === "" ? null : parseFloat(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                    placeholder="z.B. 18.50"
                  />
                </div>

                {/* URL + Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">Billing-URL (optional)</label>
                  <input
                    value={form.url ?? ""}
                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">Notizen</label>
                  <textarea
                    rows={2}
                    value={form.notes ?? ""}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500 resize-none"
                  />
                </div>

                {/* Active toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    className={`w-10 h-5 rounded-full transition-colors relative ${form.is_active ? "bg-yellow-400" : "bg-gray-700"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                  <span className="text-sm text-gray-300">Aktiv (in Kostenberechnung einbeziehen)</span>
                </label>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-gray-800">
                <button
                  onClick={save}
                  disabled={saving || !form.name.trim()}
                  className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold py-2 rounded-xl text-sm transition-colors"
                >
                  {saving ? "Speichere…" : editEntry ? "Speichern" : "Hinzufügen"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
