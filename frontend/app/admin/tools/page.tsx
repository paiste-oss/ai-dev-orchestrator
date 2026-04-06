"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface ApiStatus {
  provider: string;
  key_required: boolean;
  configured: boolean;
}

interface Tool {
  key: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  tool_count: number;
  tool_names: string[];
  api_status: ApiStatus;
}

interface ToolParam {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, ToolParam>;
    required?: string[];
  };
}

interface HandlerInfo {
  function: string;
  module: string;
  file: string;
  line: number | null;
}

interface ToolDetail extends Tool {
  tool_defs: ToolDef[];
  handler: HandlerInfo | null;
}

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

export default function ToolsAdminPage() {
  const [tools, setTools]             = useState<Tool[]>([]);
  const [selected, setSelected]       = useState<ToolDetail | null>(null);
  const [loading, setLoading]         = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openDefs, setOpenDefs]       = useState<Record<string, boolean>>({});

  useEffect(() => { loadTools(); }, []);

  async function loadTools() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/tools`);
      if (res.ok) {
        const d = await res.json();
        setTools(d.tools);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(key: string) {
    if (selected?.key === key) { setSelected(null); return; }
    setDetailLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/tools/${key}`);
      if (res.ok) setSelected(await res.json());
    } finally {
      setDetailLoading(false);
    }
  }

  const configured  = tools.filter(t => t.api_status.configured).length;
  const unconfigured = tools.filter(t => t.api_status.key_required && !t.api_status.configured).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">🔧 Tool-Katalog</h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Alle Tools die Baddi im Chat nutzen kann — Klick für Details & Definitionen
              </p>
            </div>
            <button
              onClick={loadTools}
              className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
            >
              ↻ Aktualisieren
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Registrierte Tools", value: tools.length,   color: "text-white" },
              { label: "Bereit",             value: configured,      color: "text-emerald-400" },
              { label: "API fehlt",          value: unconfigured,    color: unconfigured > 0 ? "text-amber-400" : "text-gray-600" },
            ].map(k => (
              <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className={`text-2xl font-bold ${k.color}`}>{loading ? "…" : k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Tool Cards */}
          <div className="space-y-3">
            {loading && (
              <div className="text-center py-12 text-gray-600">Lade Tools…</div>
            )}
            {tools.map(tool => (
              <div key={tool.key}>
                <button
                  onClick={() => loadDetail(tool.key)}
                  className={`w-full text-left bg-gray-900 border rounded-xl p-5 transition-all ${
                    selected?.key === tool.key
                      ? "border-yellow-500/40 bg-yellow-500/5"
                      : "border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="font-semibold text-white">{tool.name}</p>
                        <span className={`text-xs font-medium ${CATEGORY_COLOR[tool.category] ?? "text-gray-400"}`}>
                          {tool.category}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIER_STYLE[tool.tier] ?? ""}`}>
                          {tool.tier}
                        </span>
                        {/* API Status Badge */}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          tool.api_status.configured
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        }`}>
                          {tool.api_status.configured ? "✓ Bereit" : "⚠ API fehlt"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{tool.description}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <code className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{tool.key}</code>
                        <span className="text-xs text-gray-600">{tool.tool_count} Funktion{tool.tool_count !== 1 ? "en" : ""}</span>
                        <span className="text-xs text-gray-600">via {tool.api_status.provider}</span>
                      </div>
                    </div>
                    <span className={`text-gray-600 text-xs mt-1 shrink-0 transition-transform ${selected?.key === tool.key ? "rotate-90" : ""}`}>
                      ▶
                    </span>
                  </div>
                </button>

                {/* Detail Panel */}
                {selected?.key === tool.key && (
                  <div className="border border-yellow-500/20 border-t-0 bg-gray-900/60 rounded-b-xl px-5 py-4 space-y-5">
                    {detailLoading ? (
                      <p className="text-gray-500 text-sm">Lade Details…</p>
                    ) : (
                      <>
                        {/* Handler */}
                        {selected.handler && (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Python Handler</p>
                            <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                              <div>
                                <p className="text-[10px] text-gray-600 mb-0.5">Funktion</p>
                                <code className="text-sm text-emerald-400 font-semibold">{selected.handler.function}()</code>
                              </div>
                              <div>
                                <p className="text-[10px] text-gray-600 mb-0.5">Datei</p>
                                <code className="text-xs text-sky-400">{selected.handler.file}{selected.handler.line ? `:${selected.handler.line}` : ""}</code>
                              </div>
                              <div>
                                <p className="text-[10px] text-gray-600 mb-0.5">Modul</p>
                                <code className="text-xs text-gray-400">{selected.handler.module}</code>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Tool-Definitionen */}
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                            Tool-Definitionen (JSON-Schema) · {selected.tool_defs.length}
                          </p>
                          {selected.tool_defs.map(def => {
                            const isOpen = openDefs[def.name] ?? false;
                            return (
                              <div key={def.name} className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                                {/* Header — immer sichtbar */}
                                <button
                                  onClick={() => setOpenDefs(s => ({ ...s, [def.name]: !s[def.name] }))}
                                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <code className="text-sm text-yellow-400 font-semibold">{def.name}</code>
                                    <span className="text-xs text-gray-600">{Object.keys(def.input_schema.properties).length} Parameter</span>
                                  </div>
                                  <span className={`text-gray-600 text-[10px] transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>▶</span>
                                </button>

                                {/* Body — aufklappbar */}
                                {isOpen && (
                                  <div className="px-4 pb-4 space-y-3 border-t border-gray-800">
                                    <p className="text-xs text-gray-400 leading-relaxed pt-3">{def.description}</p>

                                    {Object.keys(def.input_schema.properties).length > 0 && (
                                      <div className="space-y-1.5">
                                        <p className="text-[10px] text-gray-600 font-medium uppercase tracking-wider">Parameter</p>
                                        {Object.entries(def.input_schema.properties).map(([pname, param]) => {
                                          const required = def.input_schema.required?.includes(pname);
                                          return (
                                            <div key={pname} className="grid grid-cols-[160px_1fr] gap-2 items-start py-1 border-b border-gray-800/50 last:border-0">
                                              <div className="flex items-center gap-1.5">
                                                <code className="text-xs text-sky-400">{pname}</code>
                                                {required && <span className="text-[10px] text-red-400/70 font-bold">*</span>}
                                              </div>
                                              <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="text-[11px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{param.type}</span>
                                                  {param.enum && <span className="text-[11px] text-violet-400/70">{param.enum.join(" | ")}</span>}
                                                  {param.default !== undefined && <span className="text-[11px] text-gray-600">default: {String(param.default)}</span>}
                                                </div>
                                                {param.description && <p className="text-[11px] text-gray-500 mt-0.5">{param.description}</p>}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
    </div>
  );
}
