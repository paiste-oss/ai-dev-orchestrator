"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AGENTS, Agent, AgentStatus } from "@/lib/agents";

const STATUS_CONFIG: Record<AgentStatus, {
  label: string;
  badge: string;
  section: string;
  icon: string;
  info: string;
}> = {
  tool: {
    label: "Implementiert",
    badge: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    section: "bg-emerald-500/5 border-emerald-500/20",
    icon: "✅",
    info: "Echtes Tool oder Service im Backend — läuft produktiv.",
  },
  native: {
    label: "Claude-nativ",
    badge: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
    section: "bg-blue-500/5 border-blue-500/20",
    icon: "🧠",
    info: "Claude beherrscht das out-of-the-box — kein extra Tool nötig.",
  },
  roadmap: {
    label: "Roadmap",
    badge: "bg-gray-500/15 text-gray-400 border border-gray-500/30",
    section: "bg-gray-500/5 border-gray-500/20",
    icon: "🚧",
    info: "Noch nicht implementiert — Idee für die Zukunft.",
  },
};

const SKILL_AREA_STYLE: Record<string, string> = {
  reasoning:  "bg-blue-500/20 text-blue-300 border-blue-500/30",
  memory:     "bg-violet-500/20 text-violet-300 border-violet-500/30",
  tools:      "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  guardrails: "bg-red-500/20 text-red-300 border-red-500/30",
};

const SECTIONS: AgentStatus[] = ["tool", "native", "roadmap"];

export default function AgentsPage() {
  const router = useRouter();
  const user = getSession();
  const [selected, setSelected] = useState<Agent | null>(null);
  const [filter, setFilter] = useState<AgentStatus | "alle">("alle");

  if (!user || user.role !== "admin") {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  const byStatus = (status: AgentStatus) =>
    AGENTS.filter(a => a.status === status && (filter === "alle" || filter === status));

  const visible = filter === "alle"
    ? AGENTS
    : AGENTS.filter(a => a.status === filter);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-white">◈ Baddi-Agenten</h1>
            <p className="text-gray-400 text-sm mt-1">
              {AGENTS.filter(a => a.status === "tool").length} implementiert ·{" "}
              {AGENTS.filter(a => a.status === "native").length} Claude-nativ ·{" "}
              {AGENTS.filter(a => a.status === "roadmap").length} auf der Roadmap
            </p>
          </div>

          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            {([
              { key: "alle",    label: `Alle (${AGENTS.length})` },
              { key: "tool",    label: `✅ Implementiert (${AGENTS.filter(a => a.status === "tool").length})` },
              { key: "native",  label: `🧠 Claude-nativ (${AGENTS.filter(a => a.status === "native").length})` },
              { key: "roadmap", label: `🚧 Roadmap (${AGENTS.filter(a => a.status === "roadmap").length})` },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  filter === f.key
                    ? "bg-yellow-500 border-yellow-400 text-black"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Sections */}
          {SECTIONS.map(status => {
            const agents = byStatus(status);
            if (agents.length === 0) return null;
            const cfg = STATUS_CONFIG[status];
            return (
              <section key={status} className="space-y-4">
                {/* Section Header */}
                <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${cfg.section}`}>
                  <span className="text-xl mt-0.5">{cfg.icon}</span>
                  <div>
                    <p className="font-semibold text-white text-sm">{cfg.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{cfg.info}</p>
                  </div>
                </div>

                {/* Agent Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => setSelected(selected?.id === agent.id ? null : agent)}
                      className={`text-left rounded-2xl border p-5 transition-all hover:scale-[1.01] ${agent.bgColor} ${agent.borderColor} ${
                        status === "roadmap" ? "opacity-60 hover:opacity-80" : ""
                      } ${selected?.id === agent.id ? "ring-2 ring-yellow-400/50 opacity-100" : ""}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className={`text-3xl ${status === "roadmap" ? "grayscale" : ""}`}>
                          {agent.icon}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className={`font-bold text-sm ${agent.color}`}>{agent.name}</p>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                        {agent.description}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}

          {/* Detail Panel */}
          {selected && (
            <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{selected.icon}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`text-xl font-bold ${selected.color}`}>{selected.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[selected.status].badge}`}>
                        {STATUS_CONFIG[selected.status].label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">{selected.description}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-xl shrink-0 ml-4">✕</button>
              </div>

              {/* Implementation Info */}
              <div className={`rounded-xl border px-4 py-3 ${STATUS_CONFIG[selected.status].section}`}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  {selected.status === "roadmap" ? "Was benötigt wird" : "Implementierung"}
                </p>
                <p className="text-sm text-gray-300">{selected.implementation}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Skills */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Skills</p>
                  <div className="space-y-1.5">
                    {selected.skills.map(skill => (
                      <div
                        key={skill.label}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${SKILL_AREA_STYLE[skill.area]}`}
                      >
                        <span>{skill.icon}</span>
                        <span className="font-medium">{skill.label}</span>
                        <span className="ml-auto opacity-60 capitalize">{skill.area}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Use Cases */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Anwendungsfälle</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.useCases.map(uc => (
                      <span
                        key={uc}
                        className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300"
                      >
                        {uc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
    </div>
  );
}
