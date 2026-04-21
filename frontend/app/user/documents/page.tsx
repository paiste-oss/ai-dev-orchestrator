"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { fmtBytes as formatBytes, formatDate } from "@/lib/format";
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

const ACCEPTED = ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.xml,.html,.log";

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine`);
      if (res.ok) setDocs(await res.json());
    } finally {
      setLoading(false);
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
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiFetchForm(`${BACKEND_URL}/v1/chat/upload-attachment`, formData);
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
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-white text-xl transition-colors"
          >←</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Dokumente</h1>
            <p className="text-xs text-gray-500">
              {docs.length} Datei{docs.length !== 1 ? "en" : ""} · {formatBytes(totalBytes)} gespeichert
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--accent-text)] text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            {uploading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            )}
            {uploading ? "Hochladen…" : "Hochladen"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={e => handleUpload(e.target.files)}
          />
        </div>

        {uploadError && (
          <div className="bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-300">
            ⚠️ {uploadError}
          </div>
        )}

        {/* Suche */}
        {docs.length > 4 && (
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Dateien suchen…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-[var(--accent-50)]"
            />
          </div>
        )}

        {/* Liste */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-600 text-sm">
            Lädt…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <span className="text-5xl opacity-30">📁</span>
            <p className="text-gray-500 text-sm">
              {search ? "Keine Dateien gefunden." : "Noch keine Dokumente hochgeladen."}
            </p>
            {!search && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[var(--accent-light)] hover:text-[var(--accent-hover)] text-sm underline underline-offset-2 transition-colors"
              >
                Erste Datei hochladen
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl px-4 py-3 hover:bg-white/6 transition-colors group"
              >
                <span className="text-2xl shrink-0">{fileIcon(doc.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{doc.original_filename}</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {doc.file_type.toUpperCase()}
                    {doc.page_count > 1 && ` · ${doc.page_count} Seiten`}
                    {" · "}{formatBytes(doc.file_size_bytes)}
                    {" · "}{formatDate(doc.created_at)}
                    {doc.stored_in_qdrant && (
                      <span className="ml-1.5 text-[var(--accent-light)]">● durchsuchbar</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => deleteDoc(doc.id)}
                  disabled={deleting === doc.id}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all p-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-30"
                  title="Löschen"
                >
                  {deleting === doc.id ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
