"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { getSession, apiFetch } from "@/lib/auth";
import AdminSidebar from "@/components/AdminSidebar";
import AvatarCreatorModal from "@/components/AvatarCreatorModal";
import { USE_CASES } from "@/lib/usecases";
import { BACKEND_URL } from "@/lib/config";

const BuddyAvatar = dynamic(() => import("@/components/BuddyAvatar"), { ssr: false });

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
  phone: string | null;
  phone_secondary: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  address_country: string | null;
  workplace: string | null;
  job_title: string | null;
  language: string | null;
  notes: string | null;
  interests: string[] | null;
}

interface BaddiRecord {
  id: string;
  usecase_id: string | null;
  name: string;
  segment: string;
  is_active: boolean;
  avatar_url: string | null;
}

interface CustomerStats {
  threads: number;
  messages: number;
  total_tokens: number;
  by_model: Record<string, { messages: number; tokens: number }>;
}

interface ServiceField {
  key: string;
  label: string;
  placeholder: string;
  type: string;
}

interface ServiceSchema {
  label: string;
  icon: string;
  fields: ServiceField[];
}

type Tab = "profil" | "baddis" | "zugangsdaten" | "finanzen";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

const SEGMENT_OPTIONS = [
  { value: "personal",  label: "Privat"   },
  { value: "elderly",   label: "Senioren" },
  { value: "corporate", label: "Firma"    },
];


const LANGUAGE_OPTIONS = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
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

const inputCls = "w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors";
const readCls = "bg-gray-700/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300";

// ─── Baddis Tab ───────────────────────────────────────────────────────────────

function BaddisTab({ customer }: { customer: CustomerDetail }) {
  const [buddies, setBuddies] = useState<BaddiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarCreatorFor, setAvatarCreatorFor] = useState<BaddiRecord | null>(null);
  const [previewAvatarFor, setPreviewAvatarFor] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState<string | null>(null);

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

  const saveAvatar = async (buddy: BaddiRecord, avatarUrl: string) => {
    setSavingAvatar(buddy.id);
    setAvatarCreatorFor(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/buddies/${buddy.id}/avatar`, {
        method: "PATCH",
        body: JSON.stringify({ avatar_url: avatarUrl }),
      });
      if (res.ok) await loadBuddies();
    } finally {
      setSavingAvatar(null);
    }
  };

  const removeAvatar = async (buddy: BaddiRecord) => {
    setSavingAvatar(buddy.id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/buddies/${buddy.id}/avatar`, {
        method: "PATCH",
        body: JSON.stringify({ avatar_url: null }),
      });
      if (res.ok) await loadBuddies();
    } finally {
      setSavingAvatar(null);
    }
  };


  return (
    <div className="space-y-6">

      {/* Zugewiesene Baddis mit Avatar */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">{customer.name.split(" ")[0]}s Baddi</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Wird geladen…</p>
        ) : buddies.length === 0 ? (
          <p className="text-sm text-gray-500">Noch keine Baddis zugewiesen.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {buddies.map(b => {
              const uc = USE_CASES.find(u => u.id === b.usecase_id);
              return (
                <div
                  key={b.id}
                  className={`rounded-xl border overflow-hidden ${uc ? `${uc.bgColor} ${uc.borderColor}` : "bg-gray-700 border-gray-600"}`}
                >
                  {/* Avatar Preview */}
                  {b.avatar_url && previewAvatarFor === b.id ? (
                    <div className="relative">
                      <BuddyAvatar avatarUrl={b.avatar_url} height={220} cameraDistance={2.2} />
                      <button
                        onClick={() => setPreviewAvatarFor(null)}
                        className="absolute top-2 right-2 bg-black/50 hover:bg-black/80 text-white text-xs px-2 py-1 rounded-lg transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ) : b.avatar_url ? (
                    <button
                      onClick={() => setPreviewAvatarFor(b.id)}
                      className="w-full bg-gray-900/60 hover:bg-gray-900/80 transition-colors py-3 flex flex-col items-center gap-1"
                    >
                      <span className="text-3xl">🧍</span>
                      <span className="text-xs text-gray-300">Avatar anzeigen</span>
                    </button>
                  ) : (
                    <div className="w-full bg-gray-900/40 py-4 flex flex-col items-center gap-1">
                      <span className="text-3xl opacity-30">{uc?.icon ?? "🤖"}</span>
                      <span className="text-xs text-gray-500">Kein Avatar</span>
                    </div>
                  )}

                  {/* Info + Aktionen */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-semibold text-sm ${uc?.color ?? "text-white"}`}>{b.name}</p>
                        <p className="font-mono text-xs text-yellow-500">{uc?.baddiD ?? "—"}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setAvatarCreatorFor(b)}
                        disabled={savingAvatar === b.id}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold transition-colors disabled:opacity-50"
                      >
                        {savingAvatar === b.id ? "Speichern…" : b.avatar_url ? "Avatar ändern" : "Avatar erstellen"}
                      </button>
                      {b.avatar_url && (
                        <button
                          onClick={() => removeAvatar(b)}
                          disabled={savingAvatar === b.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
                        >
                          Entfernen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* Avatar Creator Modal */}
      {avatarCreatorFor && (
        <AvatarCreatorModal
          buddyName={avatarCreatorFor.name}
          onSave={(url) => saveAvatar(avatarCreatorFor, url)}
          onClose={() => setAvatarCreatorFor(null)}
        />
      )}
    </div>
  );
}

// ─── Zugangsdaten Tab ─────────────────────────────────────────────────────────

function ZugangsdatenTab({ customerId }: { customerId: string }) {
  const [schemas, setSchemas] = useState<Record<string, ServiceSchema>>({});
  const [configured, setConfigured] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeService, setActiveService] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/credentials`);
      if (res.ok) {
        const d = await res.json();
        setSchemas(d.services ?? {});
        setConfigured(d.configured ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const openService = (key: string) => {
    setActiveService(key);
    setFormValues({});
    setMsg(null);
  };

  const save = async () => {
    if (!activeService) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/credentials/${activeService}`, {
        method: "PUT",
        body: JSON.stringify({ data: formValues }),
      });
      if (res.ok) {
        setMsg({ text: "Gespeichert ✓", ok: true });
        await load();
        setActiveService(null);
      } else {
        setMsg({ text: "Fehler beim Speichern", ok: false });
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (service: string) => {
    setDeleting(service);
    try {
      await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/credentials/${service}`, { method: "DELETE" });
      await load();
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <p className="text-sm text-gray-500">Wird geladen…</p>;

  return (
    <div className="space-y-5">
      {msg && !activeService && (
        <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"}`}>
          {msg.text}
        </div>
      )}

      <p className="text-sm text-gray-400">
        Zugangsdaten werden verschlüsselt gespeichert und nie im Klartext angezeigt.
        Der Baddi verwendet diese Daten automatisch, wenn er die entsprechenden Tools nutzt.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Object.entries(schemas).map(([key, svc]) => {
          const isConfigured = key in configured;
          return (
            <div
              key={key}
              className={`rounded-xl border p-4 space-y-2 ${
                isConfigured ? "bg-green-500/10 border-green-500/30" : "bg-gray-800 border-gray-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{svc.icon}</span>
                {isConfigured && (
                  <button
                    onClick={() => remove(key)}
                    disabled={deleting === key}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {deleting === key ? "…" : "Entfernen"}
                  </button>
                )}
              </div>
              <p className="text-sm font-medium text-white leading-tight">{svc.label}</p>
              {isConfigured
                ? <p className="text-xs text-green-400">Konfiguriert</p>
                : <p className="text-xs text-gray-500">Nicht eingerichtet</p>
              }
              <button
                onClick={() => openService(key)}
                className={`w-full text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  isConfigured
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    : "bg-yellow-400 hover:bg-yellow-300 text-gray-900"
                }`}
              >
                {isConfigured ? "Bearbeiten" : "Einrichten"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {activeService && schemas[activeService] && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{schemas[activeService].icon}</span>
              <div>
                <h3 className="text-base font-bold text-white">{schemas[activeService].label}</h3>
                <p className="text-xs text-gray-400">Wird verschlüsselt gespeichert — nie im Klartext einsehbar</p>
              </div>
            </div>

            <div className="space-y-3">
              {schemas[activeService].fields.map(f => (
                <Field key={f.key} label={f.label}>
                  <input
                    type={f.type === "password" ? "password" : "text"}
                    placeholder={f.placeholder || "—"}
                    value={formValues[f.key] ?? ""}
                    onChange={e => setFormValues(v => ({ ...v, [f.key]: e.target.value }))}
                    className={inputCls}
                  />
                </Field>
              ))}
            </div>

            {msg && (
              <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {saving ? "Speichern…" : "Speichern"}
              </button>
              <button
                onClick={() => { setActiveService(null); setMsg(null); }}
                className="flex-1 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Finanzen Tab ─────────────────────────────────────────────────────────────

function FinanzenTab({ stats }: { stats: CustomerStats | null }) {
  if (!stats) return <p className="text-sm text-gray-500">Statistiken werden geladen…</p>;

  const modelNames: Record<string, string> = {
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    "gpt-4o-mini": "GPT-4o Mini",
    "claude-sonnet-4-6": "Claude Sonnet",
    "mistral": "Mistral",
    "unbekannt": "Unbekannt",
  };

  return (
    <div className="space-y-5">
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

  // Stammdaten
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [segment, setSegment] = useState("");
  const [language, setLanguage] = useState("de");

  // Kontakt
  const [phone, setPhone] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");

  // Adresse
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Schweiz");

  // Beruf
  const [workplace, setWorkplace] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  // Interessen & Notizen
  const [notes, setNotes] = useState("");
  const [interestInput, setInterestInput] = useState("");
  const [interests, setInterests] = useState<string[]>([]);

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
          setName(c.name ?? "");
          setEmail(c.email ?? "");
          setSegment(c.segment ?? "personal");
          setLanguage(c.language ?? "de");
          setPhone(c.phone ?? "");
          setPhoneSecondary(c.phone_secondary ?? "");
          setStreet(c.address_street ?? "");
          setZip(c.address_zip ?? "");
          setCity(c.address_city ?? "");
          setCountry(c.address_country ?? "Schweiz");
          setWorkplace(c.workplace ?? "");
          setJobTitle(c.job_title ?? "");
          setNotes(c.notes ?? "");
          setInterests(c.interests ?? []);
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
        body: JSON.stringify({
          name, email, segment, language,
          phone: phone || null,
          phone_secondary: phoneSecondary || null,
          address_street: street || null,
          address_zip: zip || null,
          address_city: city || null,
          address_country: country || null,
          workplace: workplace || null,
          job_title: jobTitle || null,
          notes: notes || null,
          interests,
        }),
      });
      if (res.ok) {
        setCustomer(await res.json());
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

  const addInterest = () => {
    const v = interestInput.trim();
    if (v && !interests.includes(v)) setInterests(prev => [...prev, v]);
    setInterestInput("");
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
    { key: "profil",       label: "Profil",       icon: "👤" },
    { key: "baddis",       label: "Baddis",       icon: "🤖" },
    { key: "zugangsdaten", label: "Zugangsdaten", icon: "🔑" },
    { key: "finanzen",     label: "Finanzen",     icon: "💰" },
  ];

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

          {/* ── Profil Tab ── */}
          {tab === "profil" && (
            <div className="space-y-5">

              {/* Stammdaten */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">Stammdaten</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Name">
                    <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="E-Mail">
                    <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inputCls} />
                  </Field>
                  <Field label="Segment">
                    <select value={segment} onChange={e => setSegment(e.target.value)} className={inputCls}>
                      {SEGMENT_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Bevorzugte Sprache">
                    <select value={language} onChange={e => setLanguage(e.target.value)} className={inputCls}>
                      {LANGUAGE_OPTIONS.map(l => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              {/* Kontakt */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">Kontakt</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Telefon (Mobil / Haupt)">
                    <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+41 79 000 00 00" className={inputCls} />
                  </Field>
                  <Field label="Telefon 2 (Festnetz / Arbeit)">
                    <input value={phoneSecondary} onChange={e => setPhoneSecondary(e.target.value)} placeholder="+41 44 000 00 00" className={inputCls} />
                  </Field>
                </div>
              </div>

              {/* Adresse */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">Adresse</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Strasse & Hausnummer">
                    <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Musterstrasse 1" className={inputCls} />
                  </Field>
                  <Field label="Land">
                    <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Schweiz" className={inputCls} />
                  </Field>
                  <Field label="PLZ">
                    <input value={zip} onChange={e => setZip(e.target.value)} placeholder="8001" className={inputCls} />
                  </Field>
                  <Field label="Ort">
                    <input value={city} onChange={e => setCity(e.target.value)} placeholder="Zürich" className={inputCls} />
                  </Field>
                </div>
              </div>

              {/* Beruf */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">Beruf & Unternehmen</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Arbeitgeber / Firma">
                    <input value={workplace} onChange={e => setWorkplace(e.target.value)} placeholder="Muster AG" className={inputCls} />
                  </Field>
                  <Field label="Berufsbezeichnung">
                    <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Software Engineer" className={inputCls} />
                  </Field>
                </div>
              </div>

              {/* Interessen */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">Interessen & Hobbys</h3>
                <div className="flex gap-2">
                  <input
                    value={interestInput}
                    onChange={e => setInterestInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addInterest(); } }}
                    placeholder="Interesse eingeben + Enter"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    onClick={addInterest}
                    className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
                  >
                    +
                  </button>
                </div>
                {interests.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {interests.map(tag => (
                      <span
                        key={tag}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/15 border border-yellow-400/30 text-yellow-300 text-xs font-medium"
                      >
                        {tag}
                        <button
                          onClick={() => setInterests(prev => prev.filter(t => t !== tag))}
                          className="text-yellow-400/60 hover:text-red-400 transition-colors leading-none"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Notizen */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">Notizen (intern)</h3>
                <p className="text-xs text-gray-500">Werden dem Baddi als Kontext mitgegeben — nicht sichtbar für den Kunden.</p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Besonderheiten, Präferenzen, wichtige Hinweise…"
                  className={`${inputCls} resize-y`}
                />
              </div>

              {/* Speichern */}
              <div className="flex items-center gap-3">
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

              {/* Systeminfo */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">Systeminfo</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="ID">
                    <p className={`font-mono text-xs ${readCls} select-all break-all`}>{customer.id}</p>
                  </Field>
                  <Field label="Rolle">
                    <p className={readCls}>{customer.role}</p>
                  </Field>
                  <Field label="Registriert am">
                    <p className={readCls}>{formatDate(customer.created_at)}</p>
                  </Field>
                  {customer.primary_usecase_id && (() => {
                    const uc = USE_CASES.find(u => u.id === customer.primary_usecase_id);
                    return uc ? (
                      <Field label="Primärer Baddi">
                        <p className={`flex items-center gap-2 ${readCls}`}>
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

          {tab === "baddis" && <BaddisTab customer={customer} />}
          {tab === "zugangsdaten" && <ZugangsdatenTab customerId={customer.id} />}
          {tab === "finanzen" && <FinanzenTab stats={stats} />}
        </div>
      </main>
    </div>
  );
}
