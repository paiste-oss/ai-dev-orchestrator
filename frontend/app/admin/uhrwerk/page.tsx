"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface UhrwerkConfig {
  name: string;
  identity: string;
  analyse_model: string;
  reply_model: string;
  language: string;
}

const MODELS = [
  { id: "claude-haiku-4-5-20251001",  label: "Claude Haiku 4.5 — schnell & günstig" },
  { id: "claude-sonnet-4-6",          label: "Claude Sonnet 4.6 — ausgewogen" },
  { id: "claude-opus-4-6",            label: "Claude Opus 4.6 — am leistungsstärksten" },
];

const DEFAULTS: UhrwerkConfig = {
  name: "Uhrwerk",
  identity:
    "Du bist das Uhrwerk — der interne Entwicklungs-Assistent von Baddi. " +
    "Du analysierst Anfragen von Kunden, planst neue Tool-Integrationen und " +
    "arbeitest eng mit dem Admin zusammen um neue Fähigkeiten zu entwickeln. " +
    "Du antwortest präzise, technisch kompetent und auf Deutsch.",
  analyse_model: "claude-haiku-4-5-20251001",
  reply_model: "claude-haiku-4-5-20251001",
  language: "de",
};

export default function UhrwerkConfigPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [config, setConfig] = useState<UhrwerkConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`${BACKEND_URL}/v1/settings/uhrwerk`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setConfig({ ...DEFAULTS, ...data }); })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/settings/uhrwerk`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail ?? `Fehler ${res.status}`);
      }
    } catch {
      setError("Verbindungsfehler");
    }
    setSaving(false);
  };

  const set = (key: keyof UhrwerkConfig, val: string) =>
    setConfig(c => ({ ...c, [key]: val }));

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        {/* Mobile Header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-gray-950/90 backdrop-blur md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">☰</button>
          <span className="font-bold text-sm text-yellow-400">Uhrwerk Konfiguration</span>
        </header>

        <div className="max-w-2xl mx-auto px-6 md:px-10 py-10 space-y-8">

          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              ⚙ Uhrwerk Konfiguration
            </h1>
            <p className="text-sm text-gray-500">
              Persönlichkeit, Identität und Modell des Entwicklungs-Assistenten einstellen.
            </p>
          </div>

          {loading ? (
            <div className="text-gray-500 text-sm">Laden...</div>
          ) : (
            <div className="space-y-5">

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</label>
                <input
                  value={config.name}
                  onChange={e => set("name", e.target.value)}
                  className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition"
                  placeholder="z.B. Uhrwerk"
                />
                <p className="text-xs text-gray-600">Wie der Assistent sich selbst nennt.</p>
              </div>

              {/* Identität / System-Prompt */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Identität & Persönlichkeit</label>
                <textarea
                  value={config.identity}
                  onChange={e => set("identity", e.target.value)}
                  rows={7}
                  className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition resize-none leading-relaxed"
                  placeholder="Du bist das Uhrwerk..."
                />
                <p className="text-xs text-gray-600">
                  Dieser Text wird als System-Prompt für alle Uhrwerk-Antworten verwendet.
                  Beschreibe Rolle, Ton und Verhalten.
                </p>
              </div>

              {/* Modelle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Analyse-Modell</label>
                  <select
                    value={config.analyse_model}
                    onChange={e => set("analyse_model", e.target.value)}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition"
                  >
                    {MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-600">Für die Erstanalyse neuer Anfragen (JSON-Output).</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dialog-Modell</label>
                  <select
                    value={config.reply_model}
                    onChange={e => set("reply_model", e.target.value)}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition"
                  >
                    {MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-600">Für Antworten im Admin-Dialog.</p>
                </div>
              </div>

              {/* Sprache */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sprache</label>
                <select
                  value={config.language}
                  onChange={e => set("language", e.target.value)}
                  className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition"
                >
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </div>

              {/* Fehler */}
              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Speichern */}
              <button
                onClick={save}
                disabled={saving}
                className="w-full py-3 rounded-xl font-semibold text-sm transition bg-yellow-500 hover:bg-yellow-400 text-black disabled:opacity-50"
              >
                {saved ? "✓ Gespeichert" : saving ? "Speichern..." : "Konfiguration speichern"}
              </button>

              {/* Vorschau */}
              <div className="rounded-2xl border border-white/5 bg-gray-900/50 p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Vorschau — so sieht sich das Uhrwerk selbst</p>
                <div className="flex items-start gap-3 pt-1">
                  <div className="w-8 h-8 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center text-sm shrink-0">⚙</div>
                  <div className="bg-gray-800/80 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-200 leading-relaxed max-w-sm">
                    Ich bin <strong>{config.name}</strong>. {config.identity.slice(0, 120)}
                    {config.identity.length > 120 ? "..." : ""}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  );
}
