"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { fmtBytes as formatBytes, formatDate } from "@/lib/format";

interface DocMeta {
  category?: string;
  reference?: string;
  source_url?: string;
  description?: string;
}

interface Doc {
  id: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  page_count: number;
  char_count: number;
  stored_in_qdrant: boolean;
  baddi_readable: boolean;
  created_at: string;
  doc_metadata?: DocMeta | null;
}

// ── Kategorie ────────────────────────────────────────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  pdf: "Dokument", docx: "Dokument", doc: "Dokument", rtf: "Dokument",
  xlsx: "Tabelle", xls: "Tabelle", csv: "Tabelle",
  pptx: "Präsentation", ppt: "Präsentation",
  jpg: "Bild", jpeg: "Bild", png: "Bild", gif: "Bild", webp: "Bild", svg: "Bild",
  json: "Code", xml: "Code", html: "Code", htm: "Code",
  txt: "Text", md: "Text", log: "Text",
};
const CATEGORY_COLORS: Record<string, string> = {
  Dokument: "text-blue-400 bg-blue-500/10",
  Tabelle:  "text-green-400 bg-green-500/10",
  Präsentation: "text-orange-400 bg-orange-500/10",
  Bild:     "text-pink-400 bg-pink-500/10",
  Code:     "text-cyan-400 bg-cyan-500/10",
  Text:     "text-gray-400 bg-gray-500/10",
};
const FILE_ICONS: Record<string, string> = {
  pdf: "📄", docx: "📝", doc: "📝",
  xlsx: "📊", xls: "📊", csv: "📋",
  pptx: "📑", ppt: "📑",
  jpg: "🖼", jpeg: "🖼", png: "🖼", gif: "🖼", webp: "🖼", svg: "🖼",
  json: "🔧", xml: "🔧", html: "🌐", htm: "🌐",
  txt: "📃", md: "📃", log: "📃",
};

function getCategory(doc: Doc): string {
  return doc.doc_metadata?.category
    || CATEGORY_MAP[doc.file_type?.toLowerCase()] || "Datei";
}
function fileIcon(type: string) {
  return FILE_ICONS[type?.toLowerCase()] ?? "📎";
}

type SortKey = "name" | "category" | "date" | "size";

const ACCEPTED = ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.xml,.html,.log";

interface OpenFileInfo { url: string; filename: string; fileType: string; }
interface Props { onOpenFile?: (info: OpenFileInfo) => void; }

export default function DocumentsWindow({ onOpenFile }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocs();
    const interval = setInterval(loadDocs, 30_000); // Auto-Refresh alle 30s
    return () => clearInterval(interval);
  }, []);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine`);
      if (res.ok) setDocs(await res.json());
    } finally { setLoading(false); }
  }

  async function toggleVisibility(doc: Doc) {
    const newVal = !doc.baddi_readable;
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, baddi_readable: newVal } : d));
    await apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ baddi_readable: newVal }),
    });
  }

  async function openDoc(doc: Doc) {
    if (!onOpenFile || opening) return;
    setOpening(doc.id); setOpenError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/content`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setOpenError(err?.detail === "Datei-Inhalt nicht gespeichert"
          ? `"${doc.original_filename}" löschen und neu hochladen.`
          : (err?.detail ?? "Datei konnte nicht geladen werden."));
        return;
      }
      const blob = await res.blob();
      onOpenFile({ url: URL.createObjectURL(blob), filename: doc.original_filename, fileType: doc.file_type });
    } catch { setOpenError("Verbindungsfehler."); }
    finally { setOpening(null); }
  }

  async function deleteDoc(id: string) {
    setDeleting(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${id}`, { method: "DELETE" });
      if (res.ok) setDocs(prev => prev.filter(d => d.id !== id));
    } finally { setDeleting(null); }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null); setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await apiFetchForm(`${BACKEND_URL}/v1/chat/upload-attachment`, fd);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Fehler" }));
          setUploadError(err.detail ?? "Upload fehlgeschlagen");
        }
      } catch { setUploadError("Verbindungsfehler beim Upload"); }
    }
    setUploading(false);
    await loadDocs();
  }

  const filtered = docs.filter(d =>
    d.original_filename.toLowerCase().includes(search.toLowerCase()) ||
    getCategory(d).toLowerCase().includes(search.toLowerCase()) ||
    (d.doc_metadata?.reference ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name")     cmp = a.original_filename.localeCompare(b.original_filename);
    if (sortKey === "category") cmp = getCategory(a).localeCompare(getCategory(b));
    if (sortKey === "date")     cmp = a.created_at.localeCompare(b.created_at);
    if (sortKey === "size")     cmp = a.file_size_bytes - b.file_size_bytes;
    return sortAsc ? cmp : -cmp;
  });

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  const totalBytes = docs.reduce((s, d) => s + d.file_size_bytes, 0);

  return (
    <div
      className={`relative flex flex-col h-full text-white overflow-hidden transition-colors ${dragOver ? "bg-indigo-950/40 ring-2 ring-indigo-500/50 ring-inset" : ""}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/6 shrink-0">
        <span className="text-xs text-gray-500 flex-1">
          {docs.length} Datei{docs.length !== 1 ? "en" : ""} · {formatBytes(totalBytes)}
        </span>
        <button
          onClick={loadDocs} disabled={loading}
          title="Aktualisieren"
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-40 shrink-0"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-indigo-500/50 w-32"
        />
        <button
          onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
        >
          {uploading ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
            </svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          )}
          {uploading ? "Lädt…" : "Hochladen"}
        </button>
        <input ref={fileInputRef} type="file" multiple accept={ACCEPTED} className="hidden"
          onChange={e => handleUpload(e.target.files)} />
      </div>

      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-indigo-600/90 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Dateien hier ablegen
          </div>
        </div>
      )}

      {uploadError && (
        <div className="mx-3 mt-2 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2 text-xs text-red-300 shrink-0">
          ⚠️ {uploadError}
          <button onClick={() => setUploadError(null)} className="ml-2 text-red-400 hover:text-red-200">×</button>
        </div>
      )}
      {openError && (
        <div className="mx-3 mt-2 bg-amber-950/50 border border-amber-800/50 rounded-lg px-3 py-2 text-xs text-amber-300 shrink-0">
          ⚠️ {openError}
          <button onClick={() => setOpenError(null)} className="ml-2 text-amber-400 hover:text-amber-200">×</button>
        </div>
      )}

      {/* Sortier-Header */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/4 shrink-0 text-[10px] text-gray-600">
        {(["category", "name", "date", "size"] as SortKey[]).map(k => (
          <button key={k} onClick={() => { if (sortKey === k) setSortAsc(v => !v); else { setSortKey(k); setSortAsc(true); } }}
            className={`px-2 py-0.5 rounded transition-colors ${sortKey === k ? "text-indigo-400" : "hover:text-gray-400"}`}>
            {{ category: "Kategorie", name: "Name", date: "Datum", size: "Grösse" }[k]}
            {sortKey === k && <span className="ml-0.5">{sortAsc ? "↑" : "↓"}</span>}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">Lädt…</div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <span className="text-4xl opacity-20">📁</span>
            <p className="text-gray-600 text-xs">{search ? "Keine Treffer." : "Noch keine Dokumente."}</p>
            {!search && (
              <button onClick={() => fileInputRef.current?.click()}
                className="text-indigo-400 hover:text-indigo-300 text-xs underline underline-offset-2">
                Erste Datei hochladen
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {sorted.map(doc => {
              const cat = getCategory(doc);
              const catColor = CATEGORY_COLORS[cat] ?? "text-gray-400 bg-gray-500/10";
              const isExpanded = expanded.has(doc.id);
              return (
                <div key={doc.id} className="group hover:bg-white/3 transition-colors">
                  {/* Hauptzeile — Doppelklick öffnet Datei */}
                  <div className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                    onDoubleClick={() => onOpenFile && openDoc(doc)}>
                    {/* Kategorie-Badge */}
                    <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${catColor}`}>
                      {fileIcon(doc.file_type)} {cat}
                    </span>

                    {/* Name */}
                    <p className="flex-1 text-xs text-white font-medium truncate min-w-0" title={doc.original_filename}>
                      {doc.original_filename}
                    </p>

                    {/* Baddi-Toggle */}
                    <button
                      onClick={() => toggleVisibility(doc)}
                      title={doc.baddi_readable ? "Lesbar — klicken zum Sperren" : "Privat — klicken zum Freigeben"}
                      className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium transition-all ${
                        doc.baddi_readable
                          ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                          : "text-gray-500 bg-gray-500/10 hover:bg-gray-500/20"
                      }`}
                    >
                      {doc.baddi_readable ? "🤖" : "🔒"}
                    </button>

                    {/* Aktionen (hover) */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {onOpenFile && (
                        <button onClick={() => openDoc(doc)} disabled={opening === doc.id}
                          className="p-1 rounded text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all disabled:opacity-40" title="Öffnen">
                          {opening === doc.id
                            ? <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>
                            : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>}
                        </button>
                      )}
                      <button onClick={() => deleteDoc(doc.id)} disabled={deleting === doc.id}
                        className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30" title="Löschen">
                        {deleting === doc.id
                          ? <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>
                          : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>}
                      </button>
                    </div>

                    {/* Expand-Chevron */}
                    <button onClick={() => toggleExpand(doc.id)}
                      className="shrink-0 p-1 rounded text-gray-600 hover:text-gray-400 transition-all">
                      <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                  </div>

                  {/* Aufklappbare Metadaten */}
                  {isExpanded && (
                    <div className="px-3 pb-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                      <div className="flex justify-between"><span className="text-gray-600">Format</span><span className="text-gray-400 uppercase font-mono">{doc.file_type}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Grösse</span><span className="text-gray-400">{formatBytes(doc.file_size_bytes)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Seiten</span><span className="text-gray-400">{doc.page_count > 0 ? doc.page_count : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Datum</span><span className="text-gray-400">{formatDate(doc.created_at)}</span></div>
                      {doc.doc_metadata?.reference && (
                        <div className="col-span-2 flex justify-between"><span className="text-gray-600">Referenz</span><span className="text-gray-400 truncate ml-2">{doc.doc_metadata.reference}</span></div>
                      )}
                      {doc.doc_metadata?.description && (
                        <div className="col-span-2 flex justify-between"><span className="text-gray-600">Beschreibung</span><span className="text-gray-400 truncate ml-2">{doc.doc_metadata.description}</span></div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
