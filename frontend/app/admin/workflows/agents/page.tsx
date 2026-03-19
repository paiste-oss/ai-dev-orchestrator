"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminSidebar from "@/components/AdminSidebar";
import { AGENTS, Agent, WorkflowPattern, AgentStatus } from "@/lib/agents";

const PATTERNS: Record<WorkflowPattern, { label: string; icon: string; color: string; short: string }> = {
  "react":          { label: "ReAct-Loop",       icon: "🔄", color: "text-blue-400",   short: "Reason → Act → Observe → Repeat" },
  "plan-execute":   { label: "Plan & Execute",    icon: "📋", color: "text-yellow-400", short: "Planner → Executor → Validierung" },
  "multi-agent":    { label: "Multi-Agent",       icon: "🤝", color: "text-purple-400", short: "Spezialisierte Agenten kollaborieren" },
};

const SKILL_AREAS: Record<string, { label: string; color: string }> = {
  reasoning:   { label: "Reasoning",  color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  memory:      { label: "Memory",     color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  tools:       { label: "Tools",      color: "bg-green-500/20 text-green-300 border-green-500/30" },
  guardrails:  { label: "Guardrails", color: "bg-red-500/20 text-red-300 border-red-500/30" },
};

const STATUS_LABELS: Record<AgentStatus, { label: string; color: string }> = {
  active:  { label: "Aktiv",         color: "bg-green-500/20 text-green-300 border-green-500/30" },
  beta:    { label: "Beta",          color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  planned: { label: "In Planung",    color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

type FilterKey = "alle" | WorkflowPattern | AgentStatus;

const CORE_SKILLS = [
  {
    icon: "🧩",
    title: "Reasoning & Planning",
    color: "border-blue-700/40 bg-blue-900/10",
    items: ["Task Decomposition", "Self-Reflection", "Goal-Tracking"],
  },
  {
    icon: "💾",
    title: "Memory",
    color: "border-purple-700/40 bg-purple-900/10",
    items: ["Short-term (Kontextfenster)", "Long-term (Vektordatenbank)", "RAG-Retrieval"],
  },
  {
    icon: "🔧",
    title: "Tool Use",
    color: "border-green-700/40 bg-green-900/10",
    items: ["API-Interaktion", "Code Execution", "Web Browsing"],
  },
  {
    icon: "🛡️",
    title: "Persona & Guardrails",
    color: "border-red-700/40 bg-red-900/10",
    items: ["Sicherheitsrichtlinien", "Datenschutz", "Budgetgrenzen"],
  },
];

const WORKFLOW_PATTERNS = [
  {
    icon: "🔄",
    title: "ReAct-Loop",
    subtitle: "Reason + Act",
    color: "border-blue-700/40 bg-blue-900/10",
    steps: ["Thought — Was ist der nächste Schritt?", "Action — Aktion ausführen", "Observation — Ergebnis lesen", "Repeat — Bis Ziel erreicht"],
  },
  {
    icon: "📋",
    title: "Plan & Execute",
    subtitle: "Für komplexe Projekte",
    color: "border-yellow-700/40 bg-yellow-900/10",
    steps: ["Planner erstellt vollständige Roadmap", "Executor arbeitet Schritte ab", "Validierung gegen den Plan"],
  },
  {
    icon: "🤝",
    title: "Multi-Agent",
    subtitle: "Team-Kollaboration",
    color: "border-purple-700/40 bg-purple-900/10",
    steps: ["Coder-Agent schreibt Code", "Reviewer-Agent prüft Fehler", "DevOps-Agent testet in Sandbox"],
  },
];

export default function AgentsPage() {
  const router = useRouter();
  const user = getSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("alle");
  const [selected, setSelected] = useState<Agent | null>(null);

  if (!user || user.role !== "admin") {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  const visible = AGENTS.filter(a => {
    if (filter === "alle") return true;
    if (filter === a.status) return true;
    if (filter === a.pattern) return true;
    return false;
  });

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "alle",         label: "Alle" },
    { key: "active",       label: "Aktiv" },
    { key: "beta",         label: "Beta" },
    { key: "planned",      label: "In Planung" },
    { key: "react",        label: "ReAct" },
    { key: "plan-execute", label: "Plan & Execute" },
    { key: "multi-agent",  label: "Multi-Agent" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto min-w-0">
        <div className="flex items-center gap-3 md:hidden mb-4">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl">☰</button>
          <h1 className="text-lg font-bold text-yellow-400">Agenten</h1>
        </div>

        <div className="max-w-6xl mx-auto space-y-8">
          <div>
            <h2 className="text-2xl font-bold hidden md:block">🤖 Spezialisierte Agenten</h2>
            <p className="text-gray-400 text-sm mt-1">
              {AGENTS.filter(a => a.status === "active").length} aktiv ·{" "}
              {AGENTS.filter(a => a.status === "beta").length} in Beta ·{" "}
              {AGENTS.filter(a => a.status === "planned").length} in Planung
            </p>
          </div>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Kern-Skills eines KI-Agenten</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {CORE_SKILLS.map(s => (
                <div key={s.title} className={`rounded-xl border p-4 space-y-2 ${s.color}`}>
                  <p className="text-2xl">{s.icon}</p>
                  <p className="font-semibold text-sm text-white">{s.title}</p>
                  <ul className="space-y-1">
                    {s.items.map(item => (
                      <li key={item} className="text-xs text-gray-400 flex items-start gap-1.5">
                        <span className="text-gray-600 mt-0.5">·</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Agentische Workflow-Muster</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {WORKFLOW_PATTERNS.map(p => (
                <div key={p.title} className={`rounded-xl border p-5 space-y-3 ${p.color}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <p className="font-bold text-sm text-white">{p.title}</p>
                      <p className="text-xs text-gray-400">{p.subtitle}</p>
                    </div>
                  </div>
                  <ol className="space-y-1.5">
                    {p.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="text-gray-600 font-mono shrink-0">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                  filter === f.key
                    ? "bg-yellow-500 border-yellow-400 text-black"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Agenten ({visible.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visible.map(agent => {
                const pattern = PATTERNS[agent.pattern];
                const status = STATUS_LABELS[agent.status];
                const isPlanned = agent.status === "planned";
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelected(selected?.id === agent.id ? null : agent)}
                    className={`group text-left rounded-2xl border p-5 transition-all hover:scale-[1.02] hover:shadow-xl ${agent.bgColor} ${agent.borderColor} border ${
                      isPlanned ? "opacity-50" : ""
                    } ${selected?.id === agent.id ? "ring-2 ring-yellow-400/50" : ""}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className={`text-3xl ${isPlanned ? "grayscale" : ""}`}>{agent.icon}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className={`font-bold text-sm ${agent.color}`}>{agent.name}</p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{agent.description}</p>
                    <div className="flex items-center gap-1.5 mt-3">
                      <span className="text-xs">{pattern.icon}</span>
                      <span className={`text-xs font-medium ${pattern.color}`}>{pattern.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {selected && (
            <section className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{selected.icon}</span>
                  <div>
                    <h3 className={`text-xl font-bold ${selected.color}`}>{selected.name}</h3>
                    <p className="text-sm text-gray-400 mt-0.5">{selected.description}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-xl shrink-0">✕</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Skills</p>
                  <div className="space-y-1.5">
                    {selected.skills.map(skill => (
                      <div key={skill.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${SKILL_AREAS[skill.area].color}`}>
                        <span>{skill.icon}</span>
                        <span className="font-medium">{skill.label}</span>
                        <span className="ml-auto text-xs opacity-60">{SKILL_AREAS[skill.area].label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Workflow-Muster</p>
                  <div className="bg-gray-900 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{PATTERNS[selected.pattern].icon}</span>
                      <div>
                        <p className={`font-bold text-sm ${PATTERNS[selected.pattern].color}`}>
                          {PATTERNS[selected.pattern].label}
                        </p>
                        <p className="text-xs text-gray-500">{PATTERNS[selected.pattern].short}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Anwendungsfälle</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.useCases.map(uc => (
                      <span key={uc} className="px-2.5 py-1 rounded-lg bg-gray-700 border border-gray-600 text-xs text-gray-300">
                        {uc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {selected.status !== "planned" && (
                <div className="pt-2 border-t border-gray-700 flex gap-3">
                  <button className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-sm transition-colors">
                    Konfigurieren
                  </button>
                  <button className="px-4 py-2 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm transition-colors">
                    Workflow anzeigen
                  </button>
                </div>
              )}
              {selected.status === "planned" && (
                <div className="pt-2 border-t border-gray-700">
                  <span className="text-xs text-gray-500">Dieser Agent befindet sich noch in Entwicklung.</span>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
