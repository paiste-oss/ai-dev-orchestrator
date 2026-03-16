"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import AdminSidebar from "@/components/AdminSidebar";
import { USE_CASES, UseCase } from "@/lib/usecases";
import { BACKEND_URL } from "@/lib/config";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface CustomerDetail {
  id: string;
  name: string;
  email: string;
  segment: string;
  role: string;
  is_active: boolean;
  created_at: string;
  birth_year: number | null;
  primary_usecase_id: string | null;
}

interface BuddyRecord {
  id: string;
  usecase_id: string | null;
  name: string;
  segment: string;
  is_active: boolean;
}

interface CustomerStats {
  threads: number;
  messages: number;
  total_tokens: number;
  by_model: Record<string, { messages: number; tokens: number }>;
}

type Tab = "profil" | "baddis" | "finanzen";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

const SEGMENT_OPTIONS = [
  { value: "personal",  label: "Privat"   },
  { value: "elderly",   label: "Senioren" },
  { value: "corporate", label: "Firma"    },
];

const SEGMENT_ORDER: { key: string; label: string }[] = [
  { key: "menschen",   label: "Menschen"   },
  { key: "firmen",     label: "Firmen"     },
  { key: "funktionen", label: "Funktionen" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

// ─── Baddis Tab ───────────────────────────────────────────────────────────────

function BaddisTab({ customer }: { customer: CustomerDetail }) {
  const [buddies, setBuddies] = useState<BuddyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] = useState("menschen");

  const loadBuddies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/buddies/customer/${customer.id}`);
      if (res.ok) setBuddies(await res.json());
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => { loadBuddies(); }, [loadBuddies]);

  const assignedIds = new Set(buddies.map(b => b.usecase_id).filter(Boolean));

  const assign = async (uc: UseCase) => {
    setAssigning(uc.id);
    try {
      await apiFetch(`${BACKEND_URL}/v1/buddies`, {
        method: "POST",
        body: JSON.stringify({
          customer_id: customer.id,
          usecase_id: uc.id,
          name: uc.buddyName,
          segment: uc.segment,
          persona_config: { system_prompt_template: uc.systemPrompt, preferred_model: "gemini-2.0-flash" },
        }),
      });
      await loadBuddies();
    } catch { alert("Fehler beim Zuweisen"); }
    finally { setAssigning(null); }
  };

  const remove = async (buddyId: string) => {
    setRemoving(buddyId);
    try {
      await apiFetch(`${BACKEND_URL}/v1/buddies/${buddyId}`, { method: "DELETE" });
      await loadBuddies();
    } catch { alert("Fehler beim Entfernen"); }
    finally { setRemoving(null); }
  };

  const visibleUseCases = USE_CASES.filter(uc => uc.segment === activeSegment && uc.status === "active");

  return (
    <div className="space-y-6">
      {/* Zugewiesene Baddis */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Zugewiesene Baddis</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Wird geladen…</p>
        ) : buddies.length === 0 ? (
          <p className="text-sm text-gray-500">Noch keine Baddis zugewiesen.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {buddies.map(b => {
              const uc = USE_CASES.find(u => u.id === b.usecase_id);
              return (
                <div key={b.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${
                  uc ? `${uc.bgColor} ${uc.borderColor}` : "bg-gray-700 border-gray-600"
                }`}>
                  <span className="text-xl">{uc?.icon ?? "🤖"}</span>
                  <div>
                    <p className={`font-semibold text-xs ${uc?.color ?? "text-white"}`}>{b.name}</p>
                    <p className="font-mono text-xs text-yellow-500">{uc?.baddiD ?? "—"}</p>
                  </div>
                  <button
                    onClick={() => remove(b.id)}
                    disabled={removing === b.id}
                    className="ml-1 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50 text-sm"
                  >
                    {removing === b.id ? "…" : "✕"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Baddi hinzufügen */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Baddi hinzufügen</h3>
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
          {SEGMENT_ORDER.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSegment(s.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeSegment === s.key ? "bg-yellow-400 text-gray-900" : "text-gray-400 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {visibleUseCases.map(uc => {
            const isAssigned = assignedIds.has(uc.id);
            return (
              <button
                key={uc.id}
                onClick={() => !isAssigned && assign(uc)}
                disabled={isAssigned || assigning === uc.id}
                className={`text-left p-3 rounded-xl border transition-colors flex items-center gap-3 ${
                  isAssigned
                    ? `${uc.bgColor} ${uc.borderColor} opacity-60 cursor-default`
                    : "bg-gray-700 border-gray-600 hover:border-gray-400"
                }`}
              >
                <span className="text-xl shrink-0">{uc.icon}</span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${isAssigned ? uc.color : "text-white"}`}>
                    {uc.buddyName}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{uc.name}</p>
                </div>
                {isAssigned && <span className="ml-auto text-xs text-green-400 shrink-0">✓</span>}
                {assigning === uc.id && <span className="ml-auto text-xs text-gray-400 shrink-0">…</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Finanzen Tab ─────────────────────────────────────────────────────────────

function FinanzenTab({ customer, stats }: { customer: CustomerDetail; stats: CustomerStats | null }) {
  if (!stats) {
    return <p className="text-sm text-gray-500">Statistiken werden geladen…</p>;
  }

  const modelNames: Record<string, string> = {
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    "gpt-4o-mini": "GPT-4o Mini",
    "claude-sonnet-4-6": "Claude Sonnet",
    "mistral": "Mistral",
    "unbekannt": "Unbekannt",
  };

  return (
    <div className="space-y-5">
      {/* KPI-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Konversationen", value: stats.threads, icon: "💬" },
          { label: "Nachrichten", value: stats.messages, icon: "✉️" },
          { label: "Tokens gesamt", value: stats.total_tokens.toLocaleString("de-CH"), icon: "🪙" },
          { label: "Abo-Plan", value: "—", icon: "📋" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-1">
            <p className="text-xl">{kpi.icon}</p>
            <p className="text-2xl font-bold text-white">{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Token-Aufschlüsselung nach Modell */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Token-Nutzung nach Modell</h3>
        {Object.keys(stats.by_model).length === 0 ? (
          <p className="text-sm text-gray-500">Noch keine Nutzung erfasst.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 text-xs text-gray-400 font-semibold uppercase">Modell</th>
                <th className="text-right py-2 text-xs text-gray-400 font-semibold uppercase">Nachrichten</th>
                <th className="text-right py-2 text-xs text-gray-400 font-semibold uppercase">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {Object.entries(stats.by_model).map(([model, data]) => (
                <tr key={model}>
                  <td className="py-2 text-gray-300">{modelNames[model] ?? model}</td>
                  <td className="py-2 text-right text-gray-300">{data.messages}</td>
                  <td className="py-2 text-right font-mono text-yellow-400">{data.tokens.toLocaleString("de-CH")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-600">
                <td className="py-2 font-semibold text-white">Total</td>
                <td className="py-2 text-right font-semibold text-white">{stats.messages}</td>
                <td className="py-2 text-right font-mono font-bold text-yellow-400">{stats.total_tokens.toLocaleString("de-CH")}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("profil");

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Editable profil fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [segment, setSegment] = useState("");

  useEffect(() => {
    const u = getSession();
    if (!u || u.role !== "admin") { router.replace("/login"); return; }

    (async () => {
      setLoading(true);
      try {
        const [cRes, sRes] = await Promise.all([
          apiFetch(`${BACKEND_URL}/v1/customers/${id}`),
          apiFetch(`${BACKEND_URL}/v1/customers/${id}/stats`),
        ]);
        if (cRes.ok) {
          const c: CustomerDetail = await cRes.json();
          setCustomer(c);
          setName(c.name);
          setEmail(c.email);
          setSegment(c.segment);
        }
        if (sRes.ok) setStats(await sRes.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const saveProfile = async () => {
    if (!customer) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, email, segment }),
      });
      if (res.ok) {
        const updated: CustomerDetail = await res.json();
        setCustomer(updated);
        setSaveMsg("Gespeichert ✓");
        setTimeout(() => setSaveMsg(null), 3000);
      } else {
        setSaveMsg("Fehler beim Speichern");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!customer) return;
    const res = await apiFetch(`${BACKEND_URL}/v1/customers/${id}/toggle-active`, { method: "PATCH" });
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

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "profil",   label: "Profil",   icon: "👤" },
    { key: "baddis",   label: "Baddis",   icon: "🤖" },
    { key: "finanzen", label: "Finanzen", icon: "💰" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto min-w-0">
        {/* Breadcrumb */}
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
                </div>
              </div>
            </div>
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

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-900 rounded-xl p-1 w-fit">
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

          {/* Profil Tab */}
          {tab === "profil" && (
            <div className="space-y-5">
              {/* Bearbeitbare Felder */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">Angaben</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Name">
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </Field>
                  <Field label="E-Mail">
                    <input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      type="email"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </Field>
                  <Field label="Segment">
                    <select
                      value={segment}
                      onChange={e => setSegment(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    >
                      {SEGMENT_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </Field>
                  {customer.birth_year && (
                    <Field label="Geburtsjahr">
                      <p className="bg-gray-700/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300">{customer.birth_year}</p>
                    </Field>
                  )}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="px-5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    {saving ? "Speichern…" : "Speichern"}
                  </button>
                  {saveMsg && (
                    <span className={`text-sm ${saveMsg.includes("Fehler") ? "text-red-400" : "text-green-400"}`}>
                      {saveMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* Nur-Lesen Felder */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">Systeminfo</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="ID">
                    <p className="font-mono text-xs text-gray-400 bg-gray-700/50 border border-gray-700 rounded-lg px-3 py-2 select-all break-all">{customer.id}</p>
                  </Field>
                  <Field label="Rolle">
                    <p className="bg-gray-700/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300">{customer.role}</p>
                  </Field>
                  <Field label="Registriert am">
                    <p className="bg-gray-700/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300">{formatDate(customer.created_at)}</p>
                  </Field>
                  {customer.primary_usecase_id && (() => {
                    const uc = USE_CASES.find(u => u.id === customer.primary_usecase_id);
                    return uc ? (
                      <Field label="Primärer Baddi">
                        <p className="flex items-center gap-2 bg-gray-700/50 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                          <span>{uc.icon}</span>
                          <span className="text-gray-300">{uc.buddyName}</span>
                          <span className="font-mono text-xs text-yellow-500 ml-auto">{uc.baddiD}</span>
                        </p>
                      </Field>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Baddis Tab */}
          {tab === "baddis" && <BaddisTab customer={customer} />}

          {/* Finanzen Tab */}
          {tab === "finanzen" && <FinanzenTab customer={customer} stats={stats} />}
        </div>
      </main>
    </div>
  );
}
