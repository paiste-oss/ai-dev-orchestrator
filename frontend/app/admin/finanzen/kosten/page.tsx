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
  is_active: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { key: Category; label: string; icon: string; color: string; bg: string; border: string }[] = [
  { key: "api",           label: "APIs",           icon: "🔌", color: "text-blue-300",   bg: "bg-blue-950/40",   border: "border-blue-800/50" },
  { key: "abo",           label: "Abonnements",    icon: "📋", color: "text-violet-300", bg: "bg-violet-950/40", border: "border-violet-800/50" },
  { key: "infrastruktur", label: "Infrastruktur",  icon: "🖥️", color: "text-cyan-300",   bg: "bg-cyan-950/40",   border: "border-cyan-800/50" },
  { key: "entwicklung",   label: "Entwicklung",    icon: "🛠️", color: "text-amber-300",  bg: "bg-amber-950/40",  border: "border-amber-800/50" },
  { key: "sonstiges",     label: "Sonstiges",      icon: "📦", color: "text-gray-300",   bg: "bg-gray-800/40",   border: "border-gray-700/50" },
];

const CYCLE_LABEL: Record<BillingCycle, string> = {
  monatlich:       "/ Monat",
  jährlich:        "/ Jahr",
  einmalig:        "einmalig",
  nutzungsbasiert: "variabel",
};

const EMPTY_FORM = (): Omit<CostEntry, "id"> => ({
  name: "", provider: "", category: "api", billing_cycle: "monatlich",
  amount_original: 0, currency: "CHF", amount_chf_monthly: 0,
  url: "", notes: "", is_active: true,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function chf(n: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 2 }).format(n);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KostenPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category | "alle">("alle");
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<CostEntry | null>(null);
  const [form, setForm] = useState(EMPTY_FORM());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = getSession();
    setMounted(true);
    if (!u || u.role !== "admin") { router.replace("/login"); return; }
    load();
  }, []);

  if (!mounted) return null;

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/finance/costs`);
      if (res.ok) setEntries(await res.json());
    } finally { setLoading(false); }
  }

  function openCreate() {
    setForm(EMPTY_FORM());
    setEditEntry(null);
    setShowForm(true);
  }

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

  const active = entries.filter((e) => e.is_active);
  const totalMonthly = active.reduce((s, e) => s + e.amount_chf_monthly, 0);
  const totalYearly  = totalMonthly * 12;
  const apiMonthly   = active.filter((e) => e.category === "api").reduce((s, e) => s + e.amount_chf_monthly, 0);
  const fixedMonthly = active.filter((e) => e.billing_cycle !== "nutzungsbasiert").reduce((s, e) => s + e.amount_chf_monthly, 0);

  const filtered = activeCategory === "alle"
    ? entries
    : entries.filter((e) => e.category === activeCategory);

  const catInfo = (key: Category) => CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[4];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 space-y-8 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl md:hidden">☰</button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">💰 Kosten</h1>
            <p className="text-gray-500 text-sm mt-0.5">CAPEX Übersicht — alle Kosten des Projekts</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm px-4 py-2 rounded-xl transition-colors shrink-0"
        >
          + Eintrag
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Gesamt / Monat",     value: chf(totalMonthly), sub: "geschätzt", color: "text-yellow-400" },
          { label: "Gesamt / Jahr",      value: chf(totalYearly),  sub: "hochgerechnet", color: "text-yellow-300" },
          { label: "Fixkosten / Monat",  value: chf(fixedMonthly), sub: "nicht variabel", color: "text-blue-400" },
          { label: "API-Kosten / Monat", value: chf(apiMonthly),   sub: "nutzungsbasiert", color: "text-violet-400" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-1">
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-gray-600">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Category summary chips */}
      <div className="flex flex-wrap gap-3">
        {CATEGORIES.map((cat) => {
          const total = active.filter((e) => e.category === cat.key).reduce((s, e) => s + e.amount_chf_monthly, 0);
          const count = entries.filter((e) => e.category === cat.key).length;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(activeCategory === cat.key ? "alle" : cat.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition-colors ${
                activeCategory === cat.key
                  ? `${cat.bg} ${cat.border} ${cat.color}`
                  : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600"
              }`}
            >
              <span>{cat.icon}</span>
              <span className="font-medium">{cat.label}</span>
              <span className="text-xs opacity-70">{count}</span>
              <span className={`text-xs font-bold ${activeCategory === cat.key ? cat.color : "text-gray-500"}`}>
                {chf(total)}/mo
              </span>
            </button>
          );
        })}
        {activeCategory !== "alle" && (
          <button
            onClick={() => setActiveCategory("alle")}
            className="text-xs text-gray-500 hover:text-white px-3 py-2 underline"
          >
            Alle anzeigen
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {loading ? (
          <p className="text-center text-gray-600 py-12">Lade…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-600 py-12">Keine Einträge</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Anbieter</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Kategorie</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Turnus</th>
                <th className="text-right px-4 py-3">CHF/Monat</th>
                <th className="text-right px-5 py-3">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const cat = catInfo(e.category);
                return (
                  <tr key={e.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${!e.is_active ? "opacity-40" : ""}`}>
                    <td className="px-5 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-white">{e.name}</span>
                        {e.notes && <span className="text-xs text-gray-500 mt-0.5 line-clamp-1">{e.notes}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-400">{e.provider || "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cat.bg} ${cat.border} border ${cat.color}`}>
                        {cat.icon} {cat.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-xs px-2 py-1 rounded-md ${
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
                            <span className="text-xs text-gray-500">
                              {e.amount_original} {e.currency} {CYCLE_LABEL[e.billing_cycle]}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {e.url && (
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-600 hover:text-blue-400 transition-colors text-xs"
                            title="Billing öffnen"
                          >
                            🔗
                          </a>
                        )}
                        <button
                          onClick={() => openEdit(e)}
                          className="text-gray-500 hover:text-yellow-400 transition-colors text-xs px-2 py-1 rounded hover:bg-gray-800"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => remove(e.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded hover:bg-gray-800"
                        >
                          🗑️
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
                  {filtered.length} Einträge · Alle Beträge in CHF, variablen Kosten geschätzt
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-bold text-yellow-400">
                    {chf(filtered.filter((e) => e.is_active).reduce((s, e) => s + e.amount_chf_monthly, 0))}
                  </span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Hinweis */}
      <p className="text-xs text-gray-700 text-center">
        API-Kosten sind Schätzwerte. Tatsächliche Kosten je nach Nutzungsvolumen. Alle Beträge in CHF (umgerechnet).
      </p>

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
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                    placeholder="z.B. Gemini API"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">Anbieter</label>
                  <input
                    value={form.provider}
                    onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
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
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                  >
                    {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">Abrechnungsturnus</label>
                  <select
                    value={form.billing_cycle}
                    onChange={(e) => setForm((f) => ({ ...f, billing_cycle: e.target.value as BillingCycle }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                  >
                    <option value="monatlich">Monatlich</option>
                    <option value="jährlich">Jährlich</option>
                    <option value="einmalig">Einmalig</option>
                    <option value="nutzungsbasiert">Nutzungsbasiert</option>
                  </select>
                </div>
              </div>

              {/* Amount */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">Betrag (original)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.amount_original}
                    onChange={(e) => setForm((f) => ({ ...f, amount_original: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">Währung</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as Currency }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                  >
                    <option>CHF</option>
                    <option>USD</option>
                    <option>EUR</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">CHF / Monat</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.amount_chf_monthly}
                    onChange={(e) => setForm((f) => ({ ...f, amount_chf_monthly: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-600">CHF/Monat wird für die Übersicht normalisiert (z.B. Jahresbetrag ÷ 12).</p>

              {/* URL + Notes */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">Billing-URL (optional)</label>
                <input
                  value={form.url ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">Notizen</label>
                <textarea
                  rows={2}
                  value={form.notes ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500 resize-none"
                />
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
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
