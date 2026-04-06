"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface KnowledgeSource {
  id: string;
  name: string;
  source_type: string;
  domain: string;
  language: string;
  url: string | null;
  description: string | null;
  is_active: boolean;
  doc_count: number;
  chunk_count: number;
  last_crawled_at: string | null;
  created_at: string;
}

interface KnowledgeDoc {
  id: string;
  title: string;
  url: string | null;
  language: string;
  chunk_count: number;
  published_at: string;
  created_at: string;
}

interface Stats {
  qdrant: { vectors_count: number; points_count: number };
  sources: number;
  documents: number;
}

interface SearchResult {
  text: string;
  title: string;
  source_type: string;
  domain: string;
  url: string | null;
  score: number;
}

const SOURCE_TYPES = ["fedlex", "openalex", "wikipedia_de"];
const SOURCE_LABELS: Record<string, string> = {
  fedlex: "Schweizer Bundesrecht (Fedlex)",
  openalex: "Wissenschaftliche Papers (OpenAlex)",
  wikipedia_de: "Wikipedia Deutsch",
};

export default function KnowledgePage() {
  const router = useRouter();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [ingestMsg, setIngestMsg] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newSource, setNewSource] = useState({
    name: "", source_type: "fedlex", domain: "recht", language: "de", description: "",
  });
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, KnowledgeDoc[]>>({});
  const [loadingDocs, setLoadingDocs] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [srcRes, statsRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/knowledge/sources`),
        apiFetch(`${BACKEND_URL}/v1/knowledge/stats`),
      ]);
      if (srcRes.ok) setSources(await srcRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } finally {
      setLoading(false);
    }
  }

  async function toggleDocs(srcId: string) {
    if (expandedDocs === srcId) { setExpandedDocs(null); return; }
    setExpandedDocs(srcId);
    if (docs[srcId]) return;
    setLoadingDocs(srcId);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/knowledge/sources/${srcId}/documents`);
      if (res.ok) { const data = await res.json(); setDocs(d => ({ ...d, [srcId]: data })); }
    } finally {
      setLoadingDocs(null);
    }
  }

  async function ingestSource(id: string) {
    setIngesting(id);
    setIngestMsg(m => ({ ...m, [id]: "Gestartet…" }));
    // Docs-Cache für diese Quelle leeren (wird nach Ingest neu geladen)
    setDocs(d => { const n = { ...d }; delete n[id]; return n; });
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/knowledge/sources/${id}/ingest`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIngestMsg(m => ({ ...m, [id]: `+${data.docs_added ?? "?"} neu, ${data.docs_skipped ?? "?"} übersprungen, +${data.chunks_added ?? "?"} Chunks` }));
        await loadAll();
      } else {
        setIngestMsg(m => ({ ...m, [id]: data.detail ?? "Fehler" }));
      }
    } catch {
      setIngestMsg(m => ({ ...m, [id]: "Verbindungsfehler" }));
    } finally {
      setIngesting(null);
    }
  }

  async function toggleActive(src: KnowledgeSource) {
    await apiFetch(`${BACKEND_URL}/v1/knowledge/sources/${src.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !src.is_active }),
    });
    await loadAll();
  }

  async function deleteSource(id: string) {
    if (!confirm("Quelle und alle indizierten Dokumente löschen?")) return;
    await apiFetch(`${BACKEND_URL}/v1/knowledge/sources/${id}`, { method: "DELETE" });
    setDocs(d => { const n = { ...d }; delete n[id]; return n; });
    if (expandedDocs === id) setExpandedDocs(null);
    await loadAll();
  }

  async function createSource() {
    setCreating(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/knowledge/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSource),
      });
      if (res.ok) {
        setShowAdd(false);
        setNewSource({ name: "", source_type: "fedlex", domain: "recht", language: "de", description: "" });
        await loadAll();
      }
    } finally {
      setCreating(false);
    }
  }

  async function runSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/knowledge/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, top_k: 5, min_score: 0.5 }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results ?? []);
      }
    } finally {
      setSearching(false);
    }
  }

  function fmtDate(iso: string | null) {
    if (!iso) return "–";
    return new Date(iso).toLocaleDateString("de-CH");
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-xl">←</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Globale Wissensbasis</h1>
            <p className="text-xs text-gray-500">Quellen verwalten · Indizieren · Suche testen</p>
          </div>
          {stats && (
            <div className="text-right text-xs text-gray-500">
              <div>{(stats.qdrant?.vectors_count ?? 0).toLocaleString()} Chunks in Qdrant</div>
              <div>{stats.documents} Dokumente · {stats.sources} Quellen</div>
            </div>
          )}
        </div>

        {/* Quellen-Liste */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Quellen</h2>
            <button
              onClick={() => setShowAdd(v => !v)}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              + Quelle hinzufügen
            </button>
          </div>

          {/* Neue Quelle Form */}
          {showAdd && (
            <div className="bg-white/4 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Name</label>
                  <input
                    value={newSource.name}
                    onChange={e => setNewSource(s => ({ ...s, name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                    placeholder="z.B. Schweizer Bundesrecht"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Typ</label>
                  <select
                    value={newSource.source_type}
                    onChange={e => setNewSource(s => ({ ...s, source_type: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                  >
                    {SOURCE_TYPES.map(t => (
                      <option key={t} value={t} className="bg-gray-900">{SOURCE_LABELS[t] ?? t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Domain</label>
                  <input
                    value={newSource.domain}
                    onChange={e => setNewSource(s => ({ ...s, domain: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                    placeholder="recht / wissenschaft / allgemein"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Beschreibung</label>
                  <input
                    value={newSource.description}
                    onChange={e => setNewSource(s => ({ ...s, description: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5">Abbrechen</button>
                <button
                  onClick={createSource}
                  disabled={creating || !newSource.name}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-1.5 rounded-lg font-medium transition-colors"
                >
                  {creating ? "Erstellen…" : "Erstellen"}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-gray-600 text-sm py-8 text-center">Lädt…</div>
          ) : sources.length === 0 ? (
            <div className="text-gray-600 text-sm py-8 text-center">Noch keine Quellen konfiguriert.</div>
          ) : (
            sources.map(src => (
              <div key={src.id} className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
                {/* Quelle Header */}
                <div className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{src.name}</span>
                      <span className="text-[10px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded">{src.source_type}</span>
                      <span className="text-[10px] bg-white/6 text-gray-500 px-1.5 py-0.5 rounded">{src.domain}</span>
                      {!src.is_active && (
                        <span className="text-[10px] bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded">inaktiv</span>
                      )}
                    </div>
                    {src.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{src.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-gray-600">
                        {src.doc_count} Dokumente · {src.chunk_count} Chunks
                        {src.last_crawled_at && ` · Zuletzt: ${fmtDate(src.last_crawled_at)}`}
                      </span>
                      {src.doc_count > 0 && (
                        <button
                          onClick={() => toggleDocs(src.id)}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                        >
                          <span className={`transition-transform duration-150 inline-block ${expandedDocs === src.id ? "rotate-90" : ""}`}>▶</span>
                          {expandedDocs === src.id ? "Ausblenden" : "Dokumente anzeigen"}
                        </button>
                      )}
                    </div>
                    {ingestMsg[src.id] && (
                      <p className="text-[11px] text-indigo-400 mt-1">{ingestMsg[src.id]}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => ingestSource(src.id)}
                      disabled={ingesting === src.id}
                      className="text-[11px] bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-40 px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1"
                    >
                      {ingesting === src.id ? (
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                        </svg>
                      ) : "▶"}
                      {ingesting === src.id ? "Läuft…" : "Indizieren"}
                    </button>
                    <button
                      onClick={() => toggleActive(src)}
                      className="text-[11px] text-gray-500 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      {src.is_active ? "Pause" : "Aktiv"}
                    </button>
                    <button
                      onClick={() => deleteSource(src.id)}
                      className="text-[11px] text-gray-600 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      Löschen
                    </button>
                  </div>
                </div>

                {/* Dokumente aufklappbar */}
                {expandedDocs === src.id && (
                  <div className="border-t border-white/6 bg-black/20">
                    {loadingDocs === src.id ? (
                      <div className="px-4 py-3 text-[11px] text-gray-600">Lädt Dokumente…</div>
                    ) : (docs[src.id] ?? []).length === 0 ? (
                      <div className="px-4 py-3 text-[11px] text-gray-600">Keine Dokumente gefunden.</div>
                    ) : (
                      <div className="divide-y divide-white/4">
                        {(docs[src.id] ?? []).map((doc, i) => (
                          <div key={doc.id} className="px-4 py-2 flex items-center gap-3">
                            <span className="text-[10px] text-gray-700 w-5 shrink-0 text-right">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              {doc.url ? (
                                <a
                                  href={doc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-gray-300 hover:text-indigo-300 transition-colors truncate block"
                                >
                                  {doc.title}
                                </a>
                              ) : (
                                <span className="text-xs text-gray-400 truncate block">{doc.title}</span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-700 shrink-0">{doc.chunk_count} Chunks</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Test-Suche */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Suche testen</h2>
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runSearch()}
              placeholder="Suchbegriff eingeben…"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={runSearch}
              disabled={searching || !searchQuery.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {searching ? "Sucht…" : "Suchen"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((r, i) => (
                <div key={i} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-white truncate flex-1">{r.title}</span>
                    <span className="text-[10px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded shrink-0">{r.source_type}</span>
                    <span className="text-[10px] text-indigo-400 shrink-0">{(r.score * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-3">{r.text}</p>
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 mt-1 block truncate">
                      {r.url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && !searching && searchQuery && (
            <p className="text-xs text-gray-600 text-center py-4">Keine Ergebnisse.</p>
          )}
        </div>

    </div>
  );
}
