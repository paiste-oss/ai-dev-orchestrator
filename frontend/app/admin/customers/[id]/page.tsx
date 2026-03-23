"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import AdminSidebar from "@/components/AdminSidebar";
import { BACKEND_URL } from "@/lib/config";
import { CustomerDetail } from "@/lib/customer-admin-utils";

import CustomerProfileTab     from "@/components/admin/customer/CustomerProfileTab";
import CustomerCredentialsTab from "@/components/admin/customer/CustomerCredentialsTab";
import CustomerWalletTab      from "@/components/admin/customer/CustomerWalletTab";
import CustomerUsageTab       from "@/components/admin/customer/CustomerUsageTab";
import CustomerNotesTab       from "@/components/admin/customer/CustomerNotesTab";

type Tab = "profil" | "zugangsdaten" | "verbrauch" | "wallet" | "notizen";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "profil",       label: "Profil",       icon: "👤" },
  { key: "zugangsdaten", label: "Zugangsdaten", icon: "🔑" },
  { key: "verbrauch",    label: "Verbrauch",    icon: "📊" },
  { key: "wallet",       label: "Wallet",       icon: "💳" },
  { key: "notizen",      label: "Notizen",      icon: "📝" },
];

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("profil");

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [memoryRevokeOpen, setMemoryRevokeOpen] = useState(false);
  const [memoryRevokeInput, setMemoryRevokeInput] = useState("");
  const [memoryRevoking, setMemoryRevoking] = useState(false);

  useEffect(() => {
    const u = getSession();
    if (!u || u.role !== "admin") { router.replace("/login"); return; }

    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`${BACKEND_URL}/v1/customers/${id}`);
        if (res.ok) setCustomer(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const toggleActive = async () => {
    if (!customer) return;
    const res = await apiFetch(`${BACKEND_URL}/v1/customers/${id}/toggle-active`, { method: "PATCH" });
    if (res.ok) setCustomer(await res.json());
  };

  const revokeMemory = async () => {
    if (memoryRevokeInput !== "Lösche Langzeitdaten") return;
    setMemoryRevoking(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${id}/memory-consent`, { method: "DELETE" });
      if (res.ok) setCustomer(await res.json());
    } finally {
      setMemoryRevoking(false);
      setMemoryRevokeOpen(false);
      setMemoryRevokeInput("");
    }
  };

  const enableMemory = async () => {
    if (!customer) return;
    const res = await apiFetch(`${BACKEND_URL}/v1/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ memory_consent: true }),
    });
    if (res.ok) setCustomer(await res.json());
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-500 text-sm">Wird geladen…</span>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400 text-sm">Kunde nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto min-w-0">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl md:hidden">☰</button>
          <button onClick={() => router.push("/admin/customers")} className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Kunden
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium text-sm">{customer.name}</span>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-700 flex items-center justify-center text-2xl font-bold text-white shrink-0">
                {customer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{customer.name}</h1>
                <p className="text-sm text-gray-400">{customer.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                    customer.is_active
                      ? "bg-green-500/20 text-green-300 border-green-500/30"
                      : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${customer.is_active ? "bg-green-400" : "bg-gray-500"}`} />
                    {customer.is_active ? "Aktiv" : "Inaktiv"}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">{customer.id.slice(0, 8)}…</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                    customer.memory_consent
                      ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
                      : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                  }`}>
                    🧠 {customer.memory_consent ? "Gedächtnis aktiv" : "Gedächtnis deaktiviert"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => customer.memory_consent ? setMemoryRevokeOpen(true) : enableMemory()}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  customer.memory_consent
                    ? "border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                    : "border-gray-500/40 text-gray-400 hover:bg-gray-500/10"
                }`}
              >
                {customer.memory_consent ? "🧠 Widerrufen" : "🧠 Aktivieren"}
              </button>
              <button
                onClick={toggleActive}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  customer.is_active
                    ? "border-red-500/40 text-red-400 hover:bg-red-500/10"
                    : "border-green-500/40 text-green-400 hover:bg-green-500/10"
                }`}
              >
                {customer.is_active ? "Deaktivieren" : "Aktivieren"}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 bg-gray-900 rounded-xl p-1 w-fit">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-yellow-400 text-gray-900" : "text-gray-400 hover:text-white"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {tab === "profil"       && <CustomerProfileTab customer={customer} onCustomerUpdate={setCustomer} />}
          {tab === "zugangsdaten" && <CustomerCredentialsTab customerId={customer.id} />}
          {tab === "verbrauch"    && <CustomerUsageTab customerId={customer.id} />}
          {tab === "wallet"       && <CustomerWalletTab customerId={customer.id} />}
          {tab === "notizen"      && <CustomerNotesTab customerId={customer.id} />}
        </div>
      </main>

      {/* Modal: Langzeitgedächtnis widerrufen */}
      {memoryRevokeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setMemoryRevokeOpen(false); setMemoryRevokeInput(""); }} />
          <div className="relative bg-gray-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">⚠️</span>
              <div>
                <h3 className="font-bold text-white text-lg">Langzeitgedächtnis widerrufen</h3>
                <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                  Wenn du dies widerrufst, werden alle Daten im Langzeitgedächtnis dieses Buddis
                  <span className="text-red-400 font-semibold"> unwiderruflich gelöscht</span>.
                  Dies betrifft alle gespeicherten Fakten, Vorlieben und Erinnerungen in Qdrant und der Datenbank.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-300">
                Wenn du dies wirklich willst, schreibe bitte{" "}
                <code className="text-red-400 font-mono bg-red-950/30 px-1 rounded">Lösche Langzeitdaten</code>{" "}
                in das Feld und drücke <strong>Löschen</strong>.
              </p>
              <input
                type="text"
                value={memoryRevokeInput}
                onChange={e => setMemoryRevokeInput(e.target.value)}
                placeholder="Lösche Langzeitdaten"
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500/60 font-mono"
                autoFocus
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setMemoryRevokeOpen(false); setMemoryRevokeInput(""); }}
                className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={revokeMemory}
                disabled={memoryRevokeInput !== "Lösche Langzeitdaten" || memoryRevoking}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {memoryRevoking ? "Wird gelöscht…" : "Löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
