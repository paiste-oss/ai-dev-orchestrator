"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface PromptState {
  value: string;
  original: string;
  saving: boolean;
  saved: boolean;
}


export default function MemoryManagerPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState>({ value: "", original: "", saving: false, saved: false });

  useEffect(() => {
    apiFetch(`${BACKEND_URL}/v1/admin/system-prompts/memory-manager`).then(r => r.json()).then(d =>
      setPrompt({ value: d.prompt, original: d.prompt, saving: false, saved: false })
    ).catch(() => {});
  }, []);

  const savePrompt = async () => {
    setPrompt(p => ({ ...p, saving: true }));
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/system-prompts/memory_manager`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.value }),
      });
      if (res.ok) {
        setPrompt(p => ({ ...p, original: p.value, saved: true }));
        setTimeout(() => setPrompt(p => ({ ...p, saved: false })), 2500);
      }
    } finally {
      setPrompt(p => ({ ...p, saving: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-gray-950/90 backdrop-blur md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">☰</button>
          <span className="font-bold text-sm text-yellow-400">🧠 Memory Manager</span>
        </header>

        <div className="p-6 max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">🧠 Memory Manager</h1>
            <p className="text-gray-400 text-sm mt-0.5">Langzeit-Gedächtnis · Fakten-Extraktion · Qdrant + PostgreSQL</p>
          </div>

          {/* Flow-Erklärung */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-yellow-400">Wie funktioniert das Gedächtnis?</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Nach jeder Baddi-Antwort läuft ein Celery-Task im Hintergrund. Er liest die letzten
              12 Nachrichten aus dem Redis-Kurzzeitgedächtnis, analysiert sie mit Claude Haiku
              und extrahiert dauerhafte Fakten über den Nutzer. Diese werden als Vektoren in Qdrant
              gespeichert und beim nächsten Chat automatisch als Kontext eingebunden.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Auslöser",  value: "Nach jeder Antwort",          icon: "⚡" },
                { label: "Input",     value: "Redis · 12 Nachrichten",       icon: "📥" },
                { label: "Speicher",  value: "Qdrant + PostgreSQL",          icon: "🗄" },
                { label: "Kontext",   value: "Automatisch beim nächsten Chat", icon: "🔄" },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-gray-800 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">{icon} {label}</p>
                  <p className="text-xs text-gray-200 font-mono mt-1 leading-tight">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Modell */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">Claude Haiku 4.5</p>
              <p className="text-xs text-gray-500 mt-0.5">Fixe Modellwahl für Fakten-Extraktion — schnell, günstig, läuft async im Hintergrund</p>
            </div>
            <span className="ml-auto text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full shrink-0">
              claude-haiku-4-5-20251001
            </span>
          </div>

          {/* Extraktion-Prompt */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-800">
              <div>
                <p className="font-semibold text-white text-sm">Extraktion-Prompt</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  System-Prompt für die Fakten-Extraktion · Claude Haiku 4.5
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {prompt.value !== prompt.original && (
                  <span className="text-xs text-amber-400">● Ungespeichert</span>
                )}
                {prompt.saved && (
                  <span className="text-xs text-emerald-400">✓ Gespeichert</span>
                )}
              </div>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={prompt.value}
                onChange={e => setPrompt(p => ({ ...p, value: e.target.value }))}
                rows={Math.max(8, prompt.value.split("\n").length + 1)}
                className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed focus:outline-none focus:border-yellow-500/50 resize-y transition"
                spellCheck={false}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  {prompt.value.length} Zeichen · {prompt.value.split("\n").length} Zeilen
                </span>
                <button
                  onClick={savePrompt}
                  disabled={prompt.saving || prompt.value === prompt.original}
                  className={`text-sm px-4 py-2 rounded-lg font-medium transition-all ${
                    prompt.value !== prompt.original
                      ? "bg-yellow-500 hover:bg-yellow-400 text-gray-900"
                      : "bg-gray-800 text-gray-600 cursor-default"
                  } disabled:opacity-60`}
                >
                  {prompt.saving ? "Speichere…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>


        </div>
      </main>
    </div>
  );
}
