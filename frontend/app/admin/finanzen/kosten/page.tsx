"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";
import FinanzUebersicht from "@/components/admin/finanzen/FinanzUebersicht";
import LiveUsageBanner from "@/components/admin/finanzen/LiveUsageBanner";
import KategorieFilter from "@/components/admin/finanzen/KategorieFilter";
import KostenTabelle from "@/components/admin/finanzen/KostenTabelle";
import CostEntryModal from "@/components/admin/finanzen/CostEntryModal";
import { EMPTY_FORM, calcChfMonthly } from "@/components/admin/finanzen/types";
import type { CostEntry, Category, Revenue, LiveUsage } from "@/components/admin/finanzen/types";

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
    apiFetch(`${BACKEND_URL}/v1/finance/revenue`).then(r => { if (r.ok) r.json().then(setRevenue); });
    apiFetch(`${BACKEND_URL}/v1/finance/usage`).then(r => { if (r.ok) r.json().then(setUsage); });
  }, []);

  if (!mounted) return null;

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/finance/costs`);
      if (res.ok) setEntries(await res.json());
    } finally { setLoading(false); }
  }

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
    setEditEntry(e); setShowForm(true);
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
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  const totalCostsMonthly = entries.filter(e => e.is_active).reduce((s, e) => s + e.amount_chf_monthly, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto">

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl md:hidden">☰</button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">💰 Kosten</h1>
              <p className="text-gray-500 text-sm mt-0.5">Kostenübersicht — alle Ausgaben des Projekts</p>
            </div>
          </div>
          <button onClick={openCreate}
            className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm px-4 py-2 rounded-xl transition-colors shrink-0">
            + Eintrag
          </button>
        </div>

        <FinanzUebersicht revenue={revenue} totalCostsMonthly={totalCostsMonthly} />
        <LiveUsageBanner usage={usage} />
        <KategorieFilter
          entries={entries}
          activeCategory={activeCategory}
          showInactive={showInactive}
          onCategoryChange={setActiveCategory}
          onToggleInactive={() => setShowInactive(v => !v)}
        />
        <KostenTabelle
          entries={entries}
          loading={loading}
          activeCategory={activeCategory}
          showInactive={showInactive}
          onEdit={openEdit}
          onRemove={remove}
        />

        {showForm && (
          <CostEntryModal
            form={form}
            editEntry={editEntry}
            saving={saving}
            onFieldChange={patch => setForm(f => ({ ...f, ...patch }))}
            onAmountChange={updateFormAmount}
            onSave={save}
            onClose={() => setShowForm(false)}
          />
        )}
      </main>
    </div>
  );
}
