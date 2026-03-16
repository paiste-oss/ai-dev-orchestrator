"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface PortalSettings {
  show_login: boolean;
  show_register_menschen: boolean;
  show_register_firmen: boolean;
  show_register_funktionen: boolean;
  show_tagline: boolean;
}

interface ImpressumSettings {
  firma: string;
  strasse: string;
  plz_ort: string;
  vertreten_durch: string;
  funktion: string;
  telefon: string;
  email: string;
  handelsregister: string;
  registernummer: string;
  mwst: string;
}

const IMPRESSUM_DEFAULTS: ImpressumSettings = {
  firma: "AI Baddi GmbH",
  strasse: "Musterstraße 1",
  plz_ort: "3000 Bern, Schweiz",
  vertreten_durch: "Max Mustermann",
  funktion: "Geschäftsführer",
  telefon: "+41 00 000 00 00",
  email: "info@ai-buddy.ch",
  handelsregister: "Handelsregister des Kantons Bern",
  registernummer: "CHE-000.000.000",
  mwst: "CHE-000.000.000 MWST",
};

const CACHE_KEY = "portal_settings_cache";
const IMPRESSUM_CACHE_KEY = "impressum_settings_cache";

function Toggle({ label, description, checked, onChange }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-700 last:border-0">
      <div>
        <p className="text-sm text-white font-medium">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ml-4 ${checked ? "bg-blue-500" : "bg-gray-600"}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${checked ? "translate-x-7" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

export default function AdminSettings() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<ReturnType<typeof getSession>>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(true);
  const [impressumOpen, setImpressumOpen] = useState(false);
  const [settings, setSettings] = useState<PortalSettings>({
    show_login: true,
    show_register_menschen: true,
    show_register_firmen: true,
    show_register_funktionen: true,
    show_tagline: true,
  });
  const [impressum, setImpressum] = useState<ImpressumSettings>(IMPRESSUM_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingImpressum, setSavingImpressum] = useState(false);
  const [savedImpressum, setSavedImpressum] = useState(false);

  useEffect(() => {
    const u = getSession();
    setUser(u);
    setMounted(true);
    if (!u || u.role !== "admin") { router.replace("/login"); return; }

    // Load cache immediately, then fetch live
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) setSettings(s => ({ ...s, ...JSON.parse(cached) }));
    } catch {}

    fetch(`${BACKEND_URL}/v1/settings/portal`)
      .then(r => r.json())
      .then(data => { setSettings(s => ({ ...s, ...data })); })
      .catch(() => {});

    // Load impressum cache then live
    try {
      const cached = localStorage.getItem(IMPRESSUM_CACHE_KEY);
      if (cached) setImpressum(i => ({ ...i, ...JSON.parse(cached) }));
    } catch {}
    fetch(`${BACKEND_URL}/v1/settings/impressum`)
      .then(r => r.json())
      .then(data => {
        setImpressum(i => ({ ...i, ...data }));
        try { localStorage.setItem(IMPRESSUM_CACHE_KEY, JSON.stringify(data)); } catch {}
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`${BACKEND_URL}/v1/settings/portal`, {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      // Cache locally so landing page works when backend is offline
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch {}
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const set = (key: keyof PortalSettings, value: boolean) =>
    setSettings(s => ({ ...s, [key]: value }));

  const handleSaveImpressum = async () => {
    setSavingImpressum(true);
    try {
      await apiFetch(`${BACKEND_URL}/v1/settings/impressum`, {
        method: "PUT",
        body: JSON.stringify(impressum),
      });
      try { localStorage.setItem(IMPRESSUM_CACHE_KEY, JSON.stringify(impressum)); } catch {}
      setSavedImpressum(true);
      setTimeout(() => setSavedImpressum(false), 2000);
    } catch {}
    setSavingImpressum(false);
  };

  const setImp = (key: keyof ImpressumSettings, value: string) =>
    setImpressum(i => ({ ...i, [key]: value }));

  if (!mounted || !user) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="flex items-center gap-3 md:hidden mb-4">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl">☰</button>
          <h1 className="text-lg font-bold text-yellow-400">Konfigurieren</h1>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-2xl font-bold hidden md:block">🔧 Konfigurieren</h2>
            <p className="text-gray-400 text-sm mt-1">Konfiguration der Plattform</p>
          </div>

          {/* Portal-Sektion */}
          <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
            <button
              onClick={() => setPortalOpen(o => !o)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🌐</span>
                <div className="text-left">
                  <p className="font-semibold text-white">Portal</p>
                  <p className="text-xs text-gray-400">Was auf der Startseite angezeigt wird</p>
                </div>
              </div>
              <span className={`text-gray-400 text-xs transition-transform duration-200 ${portalOpen ? "rotate-90" : ""}`}>▶</span>
            </button>

            {portalOpen && (
              <div className="px-6 pb-6 border-t border-gray-700">
                <div className="pt-2">
                  <Toggle
                    label="Tagline anzeigen"
                    description={`"Persönliche KI-Begleiter für Menschen und Unternehmen"`}
                    checked={settings.show_tagline}
                    onChange={v => set("show_tagline", v)}
                  />
                  <Toggle
                    label="Anmelden-Button"
                    description="Der blaue Login-Button auf der Startseite"
                    checked={settings.show_login}
                    onChange={v => set("show_login", v)}
                  />
                  <Toggle
                    label="Registrierung: Menschen"
                    description="Karte «Menschen» → /register/person"
                    checked={settings.show_register_menschen}
                    onChange={v => set("show_register_menschen", v)}
                  />
                  <Toggle
                    label="Registrierung: Firmen"
                    description="Karte «Firmen» → /register/firma"
                    checked={settings.show_register_firmen}
                    onChange={v => set("show_register_firmen", v)}
                  />
                  <Toggle
                    label="Registrierung: Funktionen"
                    description="Karte «Funktionen» → /register/funktionen"
                    checked={settings.show_register_funktionen}
                    onChange={v => set("show_register_funktionen", v)}
                  />
                </div>
                <div className="pt-4">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm transition-colors bg-yellow-500 hover:bg-yellow-400 text-black disabled:opacity-50"
                  >
                    {saved ? "✓ Gespeichert" : saving ? "Speichern..." : "Einstellungen speichern"}
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Impressum-Sektion */}
          <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
            <button
              onClick={() => setImpressumOpen(o => !o)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">📄</span>
                <div className="text-left">
                  <p className="font-semibold text-white">Impressum</p>
                  <p className="text-xs text-gray-400">Angaben die im Impressum-Modal erscheinen</p>
                </div>
              </div>
              <span className={`text-gray-400 text-xs transition-transform duration-200 ${impressumOpen ? "rotate-90" : ""}`}>▶</span>
            </button>

            {impressumOpen && (
              <div className="px-6 pb-6 border-t border-gray-700 space-y-4 pt-4">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { key: "firma",           label: "Firmenname" },
                    { key: "strasse",         label: "Strasse" },
                    { key: "plz_ort",         label: "PLZ + Ort" },
                    { key: "vertreten_durch", label: "Vertreten durch" },
                    { key: "funktion",        label: "Funktion / Titel" },
                    { key: "telefon",         label: "Telefon" },
                    { key: "email",           label: "E-Mail" },
                    { key: "handelsregister", label: "Handelsregister" },
                    { key: "registernummer",  label: "Registernummer" },
                    { key: "mwst",            label: "MWST-Nummer" },
                  ] as { key: keyof ImpressumSettings; label: string }[]).map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs text-gray-400">{label}</label>
                      <input
                        value={impressum[key]}
                        onChange={e => setImp(key, e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500 transition-colors"
                      />
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleSaveImpressum}
                  disabled={savingImpressum}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm transition-colors bg-yellow-500 hover:bg-yellow-400 text-black disabled:opacity-50"
                >
                  {savedImpressum ? "✓ Gespeichert" : savingImpressum ? "Speichern..." : "Impressum speichern"}
                </button>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
