"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface Doc {
  id: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  page_count: number;
  char_count: number;
  stored_in_qdrant: boolean;
  created_at: string;
}

const FILE_ICONS: Record<string, string> = {
  pdf: "📄", docx: "📝", doc: "📝",
  xlsx: "📊", xls: "📊",
  pptx: "📑", ppt: "📑",
  csv: "📋", txt: "📃", md: "📃", log: "📃",
  json: "🔧", xml: "🔧",
  html: "🌐", htm: "🌐",
  jpg: "🖼", jpeg: "🖼", png: "🖼", gif: "🖼", webp: "🖼",
};

function fileIcon(type: string) {
  return FILE_ICONS[type?.toLowerCase()] ?? "📎";
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

const ACCEPTED = ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.xml,.html,.log";

interface OpenFileInfo {
  url: string;
  filename: string;
  fileType: string;
}

interface Props {
  onOpenFile?: (info: OpenFileInfo) => void;
}

export default function DocumentsWindow({ onOpenFile }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadDocs(); }, []);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine`);
      if (res.ok) setDocs(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function openDoc(doc: Doc) {
    if (!onOpenFile || opening) return;
    setOpening(doc.id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/content`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      onOpenFile({ url, filename: doc.original_filename, fileType: doc.file_type });
    } finally {
      setOpening(null);
    }
  }

  async function deleteDoc(id: string) {
    setDeleting(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${id}`, { method: "DELETE" });
      if (res.ok) setDocs(prev => prev.filter(d => d.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("aibuddy_token") : null;
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${BACKEND_URL}/v1/chat/upload-attachment`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Fehler" }));
          setUploadError(err.detail ?? "Upload fehlgeschlagen");
        }
      } catch {
        setUploadError("Verbindungsfehler beim Upload");
      }
    }
    setUploading(false);
    await loadDocs();
  }

  const filtered = docs.filter(d =>
    d.original_filename.toLowerCase().includes(search.toLowerCase()) ||
    d.file_type.toLowerCase().includes(search.toLowerCase())
  );

  const totalBytes = docs.reduce((s, d) => s + d.file_size_bytes, 0);

  return (
    <div className="flex flex-col h-full text-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/6 shrink-0">
        <span className="text-xs text-gray-500 flex-1">
          {docs.length} Datei{docs.length !== 1 ? "en" : ""} · {formatBytes(totalBytes)}
        </span>
        {docs.length > 3 && (
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-indigo-500/50 w-36"
          />
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {uploading ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          )}
          {uploading ? "Hochladen…" : "Hochladen"}
        </button>
        <input ref={fileInputRef} type="file" multiple accept={ACCEPTED} className="hidden"
          onChange={e => handleUpload(e.target.files)} />
      </div>

      {uploadError && (
        <div className="mx-3 mt-2 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2 text-xs text-red-300 shrink-0">
          ⚠️ {uploadError}
          <button onClick={() => setUploadError(null)} className="ml-2 text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      {/* Liste */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">Lädt…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <span className="text-4xl opacity-20">📁</span>
            <p className="text-gray-600 text-xs">
              {search ? "Keine Dateien gefunden." : "Noch keine Dokumente vorhanden."}
            </p>
            {!search && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-indigo-400 hover:text-indigo-300 text-xs underline underline-offset-2 transition-colors"
              >
                Erste Datei hochladen
              </button>
            )}
          </div>
        ) : (
          filtered.map(doc => (
            <div
              key={doc.id}
              onDoubleClick={() => openDoc(doc)}
              className="flex items-center gap-2.5 bg-white/4 hover:bg-white/6 border border-white/6 rounded-xl px-3 py-2.5 transition-colors group cursor-default select-none"
            >
              <span className="text-xl shrink-0">{fileIcon(doc.file_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{doc.original_filename}</p>
                <p className="text-gray-600 text-[11px] mt-0.5">
                  {doc.file_type.toUpperCase()}
                  {doc.page_count > 1 && ` · ${doc.page_count} S.`}
                  {" · "}{formatBytes(doc.file_size_bytes)}
                  {" · "}{formatDate(doc.created_at)}
                </p>
              </div>
              {/* Öffnen-Button */}
              {onOpenFile && (
                <button
                  onClick={() => openDoc(doc)}
                  disabled={opening === doc.id}
                  className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-[11px] font-medium px-2 py-1 rounded-lg hover:bg-indigo-500/10 transition-all disabled:opacity-40"
                  title="Datei öffnen"
                >
                  {opening === doc.id ? (
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  )}
                  {opening === doc.id ? "Lädt…" : "Öffnen"}
                </button>
              )}
              {/* Löschen-Button */}
              <button
                onClick={() => deleteDoc(doc.id)}
                disabled={deleting === doc.id}
                className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all p-1 rounded-lg hover:bg-red-500/10 disabled:opacity-30"
                title="Löschen"
              >
                {deleting === doc.id ? (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
