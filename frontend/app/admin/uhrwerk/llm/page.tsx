"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface LocalModel {
  name: string;
  base: string;
  size_bytes: number;
  modified_at: string;
  role: string | null;
  description: string;
  has_update: boolean;
  latest: string;
}

interface ExternalModel {
  id: string;
  name: string;
  tier: string;
  use: string;
}

interface ExternalProvider {
  configured: boolean;
  in_use: string[];
  models: ExternalModel[];
}

interface Overview {
  ollama_url: string;
  ollama_online: boolean;
  roles: { router: string; chat: string; code: string };
  local: LocalModel[];
  suggested: { name: string; description: string }[];
  external: {
    anthropic: ExternalProvider;
    google: ExternalProvider;
    openai: ExternalProvider;
  };
}

interface NewsItem {
  title: string;
  url: string;
  text?: string;
}

const TIER_STYLE: Record<string, string> = {
  "Schnell":         "bg-emerald-900/50 text-emerald-300 border border-emerald-700/40",
  "Ausgewogen":      "bg-blue-900/50 text-blue-300 border border-blue-700/40",
  "Leistungsstark":  "bg-violet-900/50 text-violet-300 border border-violet-700/40",
  "Spezial":         "bg-amber-900/50 text-amber-300 border border-amber-700/40",
};

function fmtBytes(b: number) {
  if (!b) return "—";
  const gb = b / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`;
}

export default function LLMAdminPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overview, setOverview]       = useState<Overview | null>(null);
  const [loading, setLoading]         = useState(true);
  const [pulling, setPulling]         = useState<string | null>(null);
  const [pullMsg, setPullMsg]         = useState<Record<string, string>>({});
  const [checking, setChecking]       = useState(false);
  const [news, setNews]               = useState<{ ollama_news: NewsItem[]; claude_news: NewsItem[]; gemini_news: NewsItem[]; checked_at: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/llm/overview`);
      if (res.ok) setOverview(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function pullModel(modelName: string) {
    setPulling(modelName);
    setPullMsg(m => ({ ...m, [modelName]: "Wird heruntergeladen…" }));
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/llm/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName }),
      });
      const d = await res.json();
      setPullMsg(m => ({ ...m, [modelName]: d.status === "ok" ? "✓ Installiert" : `Fehler: ${d.detail}` }));
      if (d.status === "ok") setTimeout(() => load(), 1500);
    } catch {
      setPullMsg(m => ({ ...m, [modelName]: "Verbindungsfehler" }));
    } finally {
      setPulling(null);
    }
  }

  async function checkUpdates() {
    setChecking(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/llm/check-updates`, { method: "POST" });
      if (res.ok) setNews(await res.json());
    } finally {
      setChecking(false);
    }
  }

  const PROVIDERS = overview ? [
    { key: "anthropic", label: "Anthropic Claude", icon: "◆", color: "text-orange-400", data: overview.external.anthropic },
    { key: "google",    label: "Google Gemini",    icon: "◇", color: "text-sky-400",    data: overview.external.google },
    { key: "openai",    label: "OpenAI",           icon: "○", color: "text-emerald-400",data: overview.external.openai },
  ] : [];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-gray-950/90 backdrop-blur md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">☰</button>
          <span className="font-bold text-sm text-yellow-400">LLM Übersicht</span>
        </header>

        <div className="p-6 max-w-6xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">LLM Übersicht</h1>
              <p className="text-gray-400 text-sm mt-0.5">Lokale Modelle (Ollama) · Externe APIs · Updates</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={checkUpdates}
                disabled={checking}
                className="text-sm border border-violet-700/50 text-violet-300 hover:border-violet-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {checking ? "Suche…" : "🔍 Updates prüfen"}
              </button>
              <button
                onClick={load}
                className="text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                ↻ Aktualisieren
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-gray-500 text-sm">Laden…</div>
          ) : overview ? (
            <>
              {/* Ollama Status */}
              <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-5 py-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${overview.ollama_online ? "bg-emerald-400" : "bg-red-500"}`} />
                <span className="text-sm text-gray-300">
                  Ollama <span className="text-gray-500">{overview.ollama_url}</span>
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  Router: <span className="text-gray-300">{overview.roles.router}</span> ·
                  Chat: <span className="text-gray-300">{overview.roles.chat}</span> ·
                  Code: <span className="text-gray-300">{overview.roles.code}</span>
                </span>
              </div>

              {/* Lokale Modelle */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Ollama — Installiert ({overview.local.length})
                </h2>
                {overview.local.length === 0 ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
                    Keine Modelle installiert oder Ollama nicht erreichbar.
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    {overview.local.map(m => (
                      <div key={m.name} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-white text-sm">{m.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{m.description || m.base}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {m.role && (
                              <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                                {m.role}
                              </span>
                            )}
                            <span className="text-xs text-gray-600">{fmtBytes(m.size_bytes)}</span>
                          </div>
                        </div>
                        {m.has_update && (
                          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                            <span className="text-xs text-amber-300">Update verfügbar → <code className="text-amber-200">{m.latest}</code></span>
                            <button
                              onClick={() => pullModel(m.latest)}
                              disabled={pulling === m.latest}
                              className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                            >
                              {pulling === m.latest ? "…" : "Installieren"}
                            </button>
                          </div>
                        )}
                        {pullMsg[m.latest] && (
                          <p className="text-xs text-gray-400">{pullMsg[m.latest]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Neue Modelle installieren */}
              {overview.suggested.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                    Ollama — Empfohlene Modelle
                  </h2>
                  <div className="grid md:grid-cols-2 gap-3">
                    {overview.suggested.map(s => (
                      <div key={s.name} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white text-sm">{s.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          {pullMsg[s.name] ? (
                            <span className="text-xs text-gray-400">{pullMsg[s.name]}</span>
                          ) : (
                            <button
                              onClick={() => pullModel(s.name)}
                              disabled={pulling === s.name}
                              className="text-xs bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {pulling === s.name ? "Wird geladen…" : "⬇ Installieren"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Externe Anbieter */}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Externe APIs
                </h2>
                {PROVIDERS.map(({ key, label, icon, color, data }) => (
                  <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
                      <div className="flex items-center gap-2">
                        <span className={`${color} font-bold`}>{icon}</span>
                        <span className="font-semibold text-white text-sm">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${data.configured ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-red-500/15 text-red-400 border border-red-500/30"}`}>
                          {data.configured ? "API Key konfiguriert" : "Kein API Key"}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-800/50">
                      {data.models.map(m => (
                        <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium">{m.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{m.use}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${TIER_STYLE[m.tier] ?? "text-gray-400"}`}>
                            {m.tier}
                          </span>
                          {data.in_use.includes(m.id) && (
                            <span className="text-xs text-emerald-400 shrink-0">✓ Im Einsatz</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>

              {/* Update-News */}
              {news && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    Update-News
                    <span className="text-gray-600 font-normal normal-case text-xs">
                      Geprüft: {new Date(news.checked_at).toLocaleString("de-CH")}
                    </span>
                  </h2>
                  {[
                    { label: "Ollama", items: news.ollama_news },
                    { label: "Claude", items: news.claude_news },
                    { label: "Gemini", items: news.gemini_news },
                  ].map(group => group.items.length > 0 && (
                    <div key={group.label} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      <p className="px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-800">{group.label}</p>
                      <div className="divide-y divide-gray-800/50">
                        {group.items.map((item, i) => (
                          <a
                            key={i}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-3 px-4 py-3 hover:bg-gray-800/40 transition-colors group"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-200 group-hover:text-white transition-colors line-clamp-1">{item.title}</p>
                              {item.text && <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{item.text}</p>}
                            </div>
                            <span className="text-gray-600 text-xs shrink-0 mt-0.5">↗</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </>
          ) : (
            <div className="text-red-400 text-sm">Fehler beim Laden der LLM-Übersicht.</div>
          )}
        </div>
      </main>
    </div>
  );
}
