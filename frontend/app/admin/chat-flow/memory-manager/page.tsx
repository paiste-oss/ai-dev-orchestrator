"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface Config {
  model: string;
  system_prompt: string;
}

const KNOWN_MODELS = [
  "mistral",
  "llama3.1",
  "llama3.2",
  "llama3",
  "phi3",
  "phi4",
  "gemma2",
  "qwen2.5",
  "deepseek-r1",
];

export default function MemoryManagerPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [config, setConfig]     = useState<Config | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`${BACKEND_URL}/v1/settings/memory-manager`)
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setError("Konfiguration konnte nicht geladen werden."));
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/settings/memory-manager`, {
        method: "PUT",
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center gap-4 px-6 border-b border-white/5 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-gray-400 hover:text-white"
          >☰</button>
          <div>
            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Chat-Flow</p>
            <h1 className="text-sm font-semibold text-white leading-none mt-0.5">Memory Manager</h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl">

          {/* Info-Box */}
          <div className="bg-gray-900 border border-white/5 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-yellow-400">Was macht der Memory Manager?</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Nach jeder Baddi-Antwort läuft im Hintergrund ein Celery-Task. Dieser liest die letzten
              6 Gesprächs-Turns aus dem Redis-Kurzzeitgedächtnis, analysiert sie mit dem lokalen LLM
              und extrahiert dauerhafte Fakten über den Nutzer. Die Fakten werden als Vektoren in
              Qdrant gespeichert und beim nächsten Chat automatisch als Kontext eingebunden.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              {[
                ["Auslöser", "Nach jeder Antwort"],
                ["Input", "Redis: chat:recent:{id} (12 Msg)"],
                ["Output", "Qdrant: customer_memories"],
                ["Fallback", "PostgreSQL: memory_items"],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-800 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                  <p className="text-xs text-gray-200 font-mono mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {!config ? (
            <p className="text-sm text-gray-500">{error ?? "Lädt…"}</p>
          ) : (
            <div className="space-y-5">

              {/* Modell */}
              <div className="bg-gray-900 border border-white/5 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-white">Lokales LLM</h2>
                <p className="text-xs text-gray-500">
                  Ollama-Modell das für die Fakten-Extraktion verwendet wird.
                  Das Modell muss auf dem Ollama-Server installiert sein.
                </p>
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={config.model}
                    onChange={e => setConfig({ ...config, model: e.target.value })}
                    className="flex-1 bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-yellow-500/50"
                    placeholder="z.B. mistral"
                  />
                  <div className="flex flex-wrap gap-1">
                    {KNOWN_MODELS.map(m => (
                      <button
                        key={m}
                        onClick={() => setConfig({ ...config, model: m })}
                        className={`px-2 py-1 rounded-md text-xs font-mono transition-colors ${
                          config.model === m
                            ? "bg-yellow-400 text-gray-900 font-semibold"
                            : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aktuelles Modell Badge */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                  <span className="text-xs text-gray-400">
                    Aktiv: <span className="text-green-400 font-mono">{config.model}</span>
                  </span>
                </div>
              </div>

              {/* System Prompt */}
              <div className="bg-gray-900 border border-white/5 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">System-Prompt (Persönlichkeit / Filter)</h2>
                  <span className="text-xs text-gray-600 font-mono">{config.system_prompt.length} Zeichen</span>
                </div>
                <p className="text-xs text-gray-500">
                  Dieser Prompt bestimmt, welche Fakten das LLM extrahiert und welche es ignoriert.
                  Die Antwort muss immer eine JSON-Liste sein.
                </p>
                <textarea
                  value={config.system_prompt}
                  onChange={e => setConfig({ ...config, system_prompt: e.target.value })}
                  rows={16}
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed focus:outline-none focus:border-yellow-500/50 resize-y"
                />
                <p className="text-xs text-gray-600">
                  Pflicht: Der Prompt muss am Ende eine JSON-Liste verlangen, z.B.{" "}
                  <code className="text-yellow-500/80">["Fakt 1", "Fakt 2"]</code>
                </p>
              </div>

              {/* Speichern */}
              <div className="flex items-center gap-4">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {saving ? "Speichern…" : "Speichern"}
                </button>
                {saved && (
                  <span className="text-sm text-green-400">✓ Gespeichert — gilt ab dem nächsten Chat-Turn</span>
                )}
                {error && (
                  <span className="text-sm text-red-400">{error}</span>
                )}
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
