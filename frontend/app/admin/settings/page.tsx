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

const CACHE_KEY = "portal_settings_cache";

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
  const [settings, setSettings] = useState<PortalSettings>({
    show_login: true,
    show_register_menschen: true,
    show_register_firmen: true,
    show_register_funktionen: true,
    show_tagline: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        </div>
      </main>
    </div>
  );
}
