"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

const NAV = [
  { label: "Dashboard",        href: "/admin",            icon: "🏠" },
  { label: "Dev Orchestrator", href: "/admin/devtool",    icon: "🛠️" },
  { label: "Kunden",           href: "/admin/customers",  icon: "👥" },
  { label: "AI Buddies",       href: "/admin/buddies",    icon: "🤖" },
  { label: "Dokumente",        href: "/admin/documents",  icon: "📁" },
  { label: "Workflows",        href: "/admin/workflows",  icon: "⚙️" },
  { label: "Analytik",         href: "/admin/analytics",  icon: "📊" },
  { label: "Einstellungen",    href: "/admin/settings",   icon: "🔧" },
];

interface PortalSettings {
  show_login: boolean;
  show_register_person: boolean;
  show_register_firma: boolean;
  show_register_allgemein: boolean;
}

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
        className={`relative w-12 h-6 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-gray-600"}`}
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
    show_register_person: true,
    show_register_firma: true,
    show_register_allgemein: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const u = getSession();
    setUser(u);
    setMounted(true);
    if (!u || u.role !== "admin") { router.replace("/login"); return; }

    fetch(`${BACKEND_URL}/v1/settings/portal`)
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`${BACKEND_URL}/v1/settings/portal`, {
        method: "PUT",
        body: JSON.stringify(settings),
      });
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
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-40 w-56 bg-gray-900 border-r border-gray-800
        flex flex-col p-4 space-y-1 transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:relative md:translate-x-0
      `}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-yellow-400">AI Buddy</h1>
            <p className="text-xs text-gray-500">Admin</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-500 hover:text-white text-xl">✕</button>
        </div>
        {NAV.map((item) => (
          <button
            key={item.href}
            onClick={() => { router.push(item.href); setSidebarOpen(false); }}
            className={`flex items-center gap-3 text-sm px-3 py-2 rounded transition-colors text-left ${
              item.href === "/admin/settings"
                ? "bg-yellow-400/10 text-yellow-400"
                : "text-gray-300 hover:text-white hover:bg-gray-800"
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => { clearSession(); router.push("/"); }}
          className="flex items-center gap-3 text-sm text-gray-500 hover:text-red-400 px-3 py-2 rounded transition-colors"
        >
          <span>🚪</span><span>Abmelden</span>
        </button>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="flex items-center gap-3 md:hidden mb-4">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl">☰</button>
          <h1 className="text-lg font-bold text-yellow-400">Einstellungen</h1>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-2xl font-bold hidden md:block">🔧 Einstellungen</h2>
            <p className="text-gray-400 text-sm mt-1">Konfiguration der Plattform</p>
          </div>

          {/* Portal-Sektion */}
          <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
            {/* Header — aufklappbar */}
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
              <span className={`text-gray-400 transition-transform ${portalOpen ? "rotate-180" : ""}`}>▾</span>
            </button>

            {portalOpen && (
              <div className="px-6 pb-6 space-y-1 border-t border-gray-700">
                <div className="pt-4 space-y-0">
                  <Toggle
                    label="Anmelden-Button"
                    description="Der blaue Login-Button auf der Startseite"
                    checked={settings.show_login}
                    onChange={v => set("show_login", v)}
                  />
                  <Toggle
                    label="Registrierung: Privatpersonen"
                    description="Karte «Ältere Menschen» → /register/person"
                    checked={settings.show_register_person}
                    onChange={v => set("show_register_person", v)}
                  />
                  <Toggle
                    label="Registrierung: Unternehmen"
                    description="Karte «Unternehmen» → /register/firma"
                    checked={settings.show_register_firma}
                    onChange={v => set("show_register_firma", v)}
                  />
                  <Toggle
                    label="Registrierung: Alle"
                    description="Karte «Alle» → /register/allgemein"
                    checked={settings.show_register_allgemein}
                    onChange={v => set("show_register_allgemein", v)}
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
