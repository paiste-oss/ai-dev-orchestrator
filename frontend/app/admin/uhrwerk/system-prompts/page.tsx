"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface AgentPrompt {
  key: string;
  name: string;
  icon: string;
  description: string;
  model: string;
  prompt: string;
}

export default function SystemPromptsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agents, setAgents]           = useState<AgentPrompt[]>([]);
  const [drafts, setDrafts]           = useState<Record<string, string>>({});
  const [saving, setSaving]           = useState<Record<string, boolean>>({});
  const [saved, setSaved]             = useState<Record<string, boolean>>({});
  const [loading, setLoading]         = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/system-prompts`);
      if (res.ok) {
        const d = await res.json();
        setAgents(d.agents);
        const init: Record<string, string> = {};
        d.agents.forEach((a: AgentPrompt) => { init[a.key] = a.prompt; });
        setDrafts(init);
      }
    } finally {
      setLoading(false);
    }
  }

  async function save(key: string) {
    setSaving(s => ({ ...s, [key]: true }));
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/system-prompts/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: drafts[key] }),
      });
      if (res.ok) {
        setSaved(s => ({ ...s, [key]: true }));
        setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2500);
      }
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  }

  function isDirty(key: string) {
    const original = agents.find(a => a.key === key)?.prompt ?? "";
    return drafts[key] !== original;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-gray-950/90 backdrop-blur md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">☰</button>
          <span className="font-bold text-sm text-yellow-400">System-Prompts</span>
        </header>

        <div className="p-6 max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">System-Prompts</h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Rollen aller Agenten im Projekt — LLM + System-Prompt = Agent
              </p>
            </div>
            <button
              onClick={load}
              className="text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
            >
              ↻ Neu laden
            </button>
          </div>

          {/* Info */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300">
            💡 Änderungen werden sofort in Redis gespeichert und beim nächsten Chat-Request aktiv — kein Neustart nötig.
          </div>

          {loading ? (
            <div className="text-gray-500 text-sm">Laden…</div>
          ) : (
            <div className="space-y-5">
              {agents.map(agent => (
                <div key={agent.key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

                  {/* Agent Header */}
                  <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{agent.icon}</span>
                      <div>
                        <p className="font-semibold text-white">{agent.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{agent.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-lg border border-gray-700">
                        {agent.model}
                      </span>
                      {isDirty(agent.key) && (
                        <span className="text-xs text-amber-400">● Ungespeichert</span>
                      )}
                      {saved[agent.key] && (
                        <span className="text-xs text-emerald-400">✓ Gespeichert</span>
                      )}
                    </div>
                  </div>

                  {/* Textarea */}
                  <div className="p-5 space-y-3">
                    <textarea
                      value={drafts[agent.key] ?? ""}
                      onChange={e => setDrafts(d => ({ ...d, [agent.key]: e.target.value }))}
                      rows={Math.max(6, (drafts[agent.key] ?? "").split("\n").length + 1)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed focus:outline-none focus:border-yellow-500/50 resize-y transition"
                      spellCheck={false}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">
                        {(drafts[agent.key] ?? "").length} Zeichen · {(drafts[agent.key] ?? "").split("\n").length} Zeilen
                      </span>
                      <button
                        onClick={() => save(agent.key)}
                        disabled={saving[agent.key] || !isDirty(agent.key)}
                        className={`text-sm px-4 py-2 rounded-lg font-medium transition-all ${
                          isDirty(agent.key)
                            ? "bg-yellow-500 hover:bg-yellow-400 text-gray-900"
                            : "bg-gray-800 text-gray-600 cursor-default"
                        } disabled:opacity-60`}
                      >
                        {saving[agent.key] ? "Speichere…" : "Speichern"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
