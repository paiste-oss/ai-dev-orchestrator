"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface Tool {
  key: string;
  name: string;
  description: string;
  prompt_hint: string;
  category: string;
  tier: string;
}

interface Intent {
  intent: string;
  label: string;
  tool_key: string | null;
  tool_name: string | null;
  status: "tool" | "vision" | "llm" | "gap" | "blocked";
}

interface LearnedRoute {
  intent: string;
  route: string;
  score: number;
}

const STATUS_STYLE: Record<string, string> = {
  tool:    "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  vision:  "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  llm:     "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  gap:     "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  blocked: "bg-red-500/15 text-red-300 border border-red-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  tool:    "Tool aktiv",
  vision:  "Vision / LLM",
  llm:     "Direkt LLM",
  gap:     "Kein Tool",
  blocked: "Blockiert",
};

const CATEGORY_COLOR: Record<string, string> = {
  transport:    "text-sky-400",
  data:         "text-teal-400",
  productivity: "text-violet-400",
  communication:"text-pink-400",
  system:       "text-gray-400",
};

const TIER_STYLE: Record<string, string> = {
  free:       "bg-gray-700 text-gray-300",
  starter:    "bg-blue-900 text-blue-300",
  pro:        "bg-violet-900 text-violet-300",
  enterprise: "bg-amber-900 text-amber-300",
};

export default function RouterAdminPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tools, setTools]       = useState<Tool[]>([]);
  const [intents, setIntents]   = useState<Intent[]>([]);
  const [dynTools, setDynTools] = useState<string[]>([]);
  const [memory, setMemory]     = useState<LearnedRoute[]>([]);
  const [prompt, setPrompt]     = useState("");
  const [promptMeta, setPromptMeta] = useState<{ tool_count: number; base_prompt_source: string } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"tools" | "intents" | "memory" | "prompt">("tools");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [overviewRes, memRes, promptRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/admin/router/overview`),
        apiFetch(`${BACKEND_URL}/v1/admin/router/memory`),
        apiFetch(`${BACKEND_URL}/v1/admin/router/system-prompt`),
      ]);
      if (overviewRes.ok) {
        const d = await overviewRes.json();
        setTools(d.tools);
        setIntents(d.intents);
        setDynTools(d.dynamic_tools);
      }
      if (memRes.ok) {
        const d = await memRes.json();
        setMemory(d.learned_routes);
      }
      if (promptRes.ok) {
        const d = await promptRes.json();
        setPrompt(d.system_prompt);
        setPromptMeta({ tool_count: d.tool_count, base_prompt_source: d.base_prompt_source });
      }
    } finally {
      setLoading(false);
    }
  }

  const TABS = [
    { key: "tools",   label: `Tools (${tools.length})`,     icon: "🔧" },
    { key: "intents", label: `Intents (${intents.length})`, icon: "⚡" },
    { key: "memory",  label: `Gedächtnis (${memory.length})`, icon: "🧠" },
    { key: "prompt",  label: "System-Prompt",               icon: "📝" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        {/* Mobile Header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-gray-950/90 backdrop-blur md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">☰</button>
          <span className="font-bold text-sm text-yellow-400">⚡ Router</span>
        </header>

    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            ⚡ Router
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Agent-Router · Tool-Katalog · Gelernte Routen · System-Prompt
          </p>
        </div>
        <button
          onClick={load}
          className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          ↻ Aktualisieren
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Aktive Tools",    value: tools.length,                             color: "text-emerald-400" },
          { label: "Intents",         value: intents.length,                           color: "text-blue-400" },
          { label: "Gaps (kein Tool)",value: intents.filter(i => i.status === "gap").length, color: "text-amber-400" },
          { label: "Gelernte Routen", value: memory.length,                            color: "text-violet-400" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className={`text-2xl font-bold ${kpi.color}`}>{loading ? "…" : kpi.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Dynamic tools notice */}
      {dynTools.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-400 mt-0.5">⚡</span>
          <div>
            <p className="text-sm font-semibold text-amber-300">Dynamische Tools aktiv</p>
            <p className="text-xs text-amber-400/70 mt-0.5">{dynTools.join(", ")} — via Entwicklung deployed</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key
                ? "bg-gray-900 text-white border border-b-gray-900 border-gray-800 -mb-px"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Tools ── */}
      {tab === "tools" && (
        <div className="grid md:grid-cols-2 gap-4">
          {tools.map(tool => (
            <div key={tool.key} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{tool.name}</p>
                  <p className={`text-xs font-medium mt-0.5 ${CATEGORY_COLOR[tool.category] ?? "text-gray-400"}`}>
                    {tool.category}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TIER_STYLE[tool.tier] ?? ""}`}>
                  {tool.tier}
                </span>
              </div>

              <p className="text-sm text-gray-400 leading-relaxed">{tool.description}</p>

              {tool.prompt_hint && (
                <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500 mb-0.5">System-Prompt Hint</p>
                  <p className="text-xs text-emerald-300">{tool.prompt_hint}</p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <code className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{tool.key}</code>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Intents ── */}
      {tab === "intents" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Intent</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Label</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Tool</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {intents.map((intent, i) => (
                <tr key={intent.intent} className={`border-b border-gray-800/50 ${i % 2 === 0 ? "" : "bg-gray-800/20"}`}>
                  <td className="px-4 py-3">
                    <code className="text-xs text-gray-400">{intent.intent}</code>
                  </td>
                  <td className="px-4 py-3 text-gray-200">{intent.label}</td>
                  <td className="px-4 py-3">
                    {intent.tool_name ? (
                      <span className="text-emerald-400 text-xs">{intent.tool_name}</span>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[intent.status]}`}>
                      {STATUS_LABEL[intent.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Gedächtnis ── */}
      {tab === "memory" && (
        <div>
          {memory.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-500 text-sm">Noch keine gelernten Routen vorhanden.</p>
              <p className="text-gray-600 text-xs mt-1">Das Router-Gedächtnis füllt sich nach den ersten Chat-Anfragen.</p>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left">
                    <th className="px-4 py-3 text-xs text-gray-500 font-medium">Intent</th>
                    <th className="px-4 py-3 text-xs text-gray-500 font-medium">Gelernte Route</th>
                    <th className="px-4 py-3 text-xs text-gray-500 font-medium">Score</th>
                    <th className="px-4 py-3 text-xs text-gray-500 font-medium">Bewertung</th>
                  </tr>
                </thead>
                <tbody>
                  {memory.map((r, i) => (
                    <tr key={`${r.intent}-${r.route}`} className={`border-b border-gray-800/50 ${i % 2 === 0 ? "" : "bg-gray-800/20"}`}>
                      <td className="px-4 py-3">
                        <code className="text-xs text-gray-400">{r.intent}</code>
                      </td>
                      <td className="px-4 py-3 text-gray-200">{r.route}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-800 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-emerald-500"
                              style={{ width: `${Math.max(0, Math.min(100, r.score * 100))}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{r.score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${r.score >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {r.score >= 0.5 ? "Bevorzugt" : r.score >= 0 ? "Neutral" : "Vermieden"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: System-Prompt ── */}
      {tab === "prompt" && (
        <div className="space-y-4">
          {promptMeta && (
            <div className="flex gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex-1">
                <p className="text-xs text-gray-500">Aktive Tools im Prompt</p>
                <p className="text-lg font-bold text-emerald-400 mt-0.5">{promptMeta.tool_count}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex-1">
                <p className="text-xs text-gray-500">Basis-Prompt Quelle</p>
                <p className="text-sm font-semibold text-white mt-0.5 capitalize">
                  {promptMeta.base_prompt_source === "redis" ? "🔴 Redis (Admin-Konfiguration)" : "⚪ Standard (Code)"}
                </p>
              </div>
            </div>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">Vorschau System-Prompt</p>
              <p className="text-xs text-gray-600">Memory & History werden zur Laufzeit ergänzt</p>
            </div>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed font-mono bg-gray-950 rounded-lg p-4 max-h-[500px] overflow-y-auto border border-gray-800">
              {prompt || "Lade…"}
            </pre>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300">
            💡 Den Basis-Prompt anpassen: Admin → Uhrwerk → Konfiguration → System-Prompt
          </div>
        </div>
      )}
    </div>
      </main>
    </div>
  );
}
