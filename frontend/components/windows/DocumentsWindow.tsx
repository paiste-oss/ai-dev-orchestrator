"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { fmtBytes as formatBytes, formatDate } from "@/lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocMeta {
  category?: string;
  reference?: string;
  source_url?: string;
  description?: string;
  source?: string;
  saved_at?: string;
}

interface Doc {
  id: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  page_count: number;
  char_count: number;
  stored_in_qdrant: boolean;
  stored_in_s3: boolean;
  baddi_readable: boolean;
  folder_id: string | null;
  created_at: string;
  doc_metadata?: DocMeta | null;
}

interface Folder {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  created_at: string;
  document_count: number;
}

interface OpenFileInfo { url: string; filename: string; fileType: string; }
interface Props { onOpenFile?: (info: OpenFileInfo) => void; }

// ── Constants ─────────────────────────────────────────────────────────────────

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
  Tabelle: "text-green-400 bg-green-500/10",
  Präsentation: "text-orange-400 bg-orange-500/10",
  Bild: "text-pink-400 bg-pink-500/10",
  Code: "text-cyan-400 bg-cyan-500/10",
  Text: "text-gray-400 bg-gray-500/10",
  "Chat-Notiz": "text-violet-400 bg-violet-500/10",
};

const FILE_ICONS: Record<string, string> = {
  pdf: "📄", docx: "📝", doc: "📝",
  xlsx: "📊", xls: "📊", csv: "📋",
  pptx: "📑", ppt: "📑",
  jpg: "🖼", jpeg: "🖼", png: "🖼", gif: "🖼", webp: "🖼", svg: "🖼",
  json: "🔧", xml: "🔧", html: "🌐", htm: "🌐",
  txt: "📃", md: "📃", log: "📃",
};

const FOLDER_COLOR_MAP: Record<string, string> = {
  indigo: "text-indigo-400", blue: "text-blue-400", green: "text-green-400",
  amber: "text-amber-400", red: "text-red-400", pink: "text-pink-400",
  purple: "text-purple-400", cyan: "text-cyan-400", gray: "text-gray-400",
};

const FOLDER_COLORS = ["indigo", "blue", "green", "amber", "red", "pink", "purple", "cyan", "gray"];

const ACCEPTED = ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.xml,.html,.log";

function getCategory(doc: Doc): string {
  if (doc.doc_metadata?.source === "chat") return "Chat-Notiz";
  return doc.doc_metadata?.category || CATEGORY_MAP[doc.file_type?.toLowerCase()] || "Datei";
}
function fileIcon(type: string) { return FILE_ICONS[type?.toLowerCase()] ?? "📎"; }

// ── Preview Component ─────────────────────────────────────────────────────────

function PreviewPanel({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) { setBlobUrl(null); setText(null); return; }
    setLoading(true); setError(null); setBlobUrl(null); setText(null);

    const isText = ["txt", "md", "json", "xml", "html", "htm", "csv", "log"].includes(doc.file_type);
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(doc.file_type);

    apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/content`)
      .then(async res => {
        if (!res.ok) { setError("Vorschau nicht verfügbar"); return; }
        const blob = await res.blob();
        if (isText || doc.doc_metadata?.source === "chat") {
          const t = await blob.text();
          setText(t);
        } else if (isImage || doc.file_type === "pdf") {
          setBlobUrl(URL.createObjectURL(blob));
        } else {
          setError("Keine Vorschau für diesen Dateityp");
        }
      })
      .catch(() => setError("Verbindungsfehler"))
      .finally(() => setLoading(false));

    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  if (!doc) return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
      <span className="text-4xl opacity-10">👁</span>
      <p className="text-gray-600 text-xs">Datei auswählen für Vorschau</p>
    </div>
  );

  const cat = getCategory(doc);

  return (
    <div className="flex flex-col h-full">
      {/* Preview Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/6 shrink-0">
        <span className="text-sm">{fileIcon(doc.file_type)}</span>
        <span className="flex-1 text-xs text-white font-medium truncate">{doc.original_filename}</span>
        <button onClick={onClose} className="p-1 text-gray-600 hover:text-gray-400 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Meta strip */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/4 shrink-0">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CATEGORY_COLORS[cat] ?? "text-gray-400 bg-gray-500/10"}`}>{cat}</span>
        <span className="text-[10px] text-gray-600">{formatBytes(doc.file_size_bytes)}</span>
        <span className="text-[10px] text-gray-600">{formatDate(doc.created_at)}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">Lädt…</div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">{error}</div>
        )}
        {blobUrl && doc.file_type === "pdf" && (
          <iframe src={blobUrl} className="w-full h-full border-0" title={doc.original_filename} />
        )}
        {blobUrl && ["jpg","jpeg","png","gif","webp","svg"].includes(doc.file_type) && (
          <div className="flex items-center justify-center h-full p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blobUrl} alt={doc.original_filename} className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        )}
        {text !== null && (
          <pre className="p-3 text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{text}</pre>
        )}
      </div>
    </div>
  );
}

// ── New Folder Dialog ─────────────────────────────────────────────────────────

function NewFolderDialog({ onSave, onCancel }: {
  onSave: (name: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("indigo");

  return (
    <div className="mx-3 my-2 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2.5 shrink-0">
      <p className="text-xs font-medium text-white">Neuer Ordner</p>
      <input
        autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder="Ordnername…"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-indigo-500/50"
        onKeyDown={e => { if (e.key === "Enter" && name.trim()) onSave(name.trim(), color); if (e.key === "Escape") onCancel(); }}
      />
      <div className="flex items-center gap-1.5">
        {FOLDER_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-4 h-4 rounded-full transition-all border-2 ${FOLDER_COLOR_MAP[c]?.replace("text-", "bg-").replace("-400", "-500")} ${color === c ? "border-white scale-110" : "border-transparent opacity-60"}`}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => name.trim() && onSave(name.trim(), color)}
          disabled={!name.trim()}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs py-1.5 rounded-lg transition-colors">
          Erstellen
        </button>
        <button onClick={onCancel} className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 text-xs py-1.5 rounded-lg transition-colors">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DocumentsWindow({ onOpenFile }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = Alle
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, foldersRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/documents/mine`),
        apiFetch(`${BACKEND_URL}/v1/document-folders`),
      ]);
      if (docsRes.ok) setDocs(await docsRes.json());
      if (foldersRes.ok) setFolders(await foldersRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30_000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Filtered docs
  const filteredDocs = docs.filter(d => {
    const matchesSearch = !search ||
      d.original_filename.toLowerCase().includes(search.toLowerCase()) ||
      getCategory(d).toLowerCase().includes(search.toLowerCase());

    if (selectedFolder === "chat") return matchesSearch && d.doc_metadata?.source === "chat";
    if (selectedFolder === "images") return matchesSearch && ["jpg","jpeg","png","gif","webp","svg"].includes(d.file_type);
    if (selectedFolder === "tables") return matchesSearch && ["xlsx","xls","csv"].includes(d.file_type);
    if (selectedFolder === null) return matchesSearch; // Alle
    return matchesSearch && d.folder_id === selectedFolder;
  });

  const totalBytes = docs.reduce((s, d) => s + d.file_size_bytes, 0);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function toggleVisibility(doc: Doc) {
    const newVal = !doc.baddi_readable;
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, baddi_readable: newVal } : d));
    await apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/visibility`, {
      method: "PATCH", body: JSON.stringify({ baddi_readable: newVal }),
    });
  }

  async function deleteDoc(id: string) {
    setDeleting(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDocs(prev => prev.filter(d => d.id !== id));
        if (previewDoc?.id === id) { setPreviewDoc(null); setShowPreview(false); }
      }
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
    await loadAll();
  }

  async function createFolder(name: string, color: string) {
    const res = await apiFetch(`${BACKEND_URL}/v1/document-folders`, {
      method: "POST", body: JSON.stringify({ name, color }),
    });
    if (res.ok) {
      const f: Folder = await res.json();
      setFolders(prev => [...prev, f]);
    }
    setShowNewFolder(false);
  }

  async function deleteFolder(id: string) {
    const res = await apiFetch(`${BACKEND_URL}/v1/document-folders/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFolders(prev => prev.filter(f => f.id !== id));
      setDocs(prev => prev.map(d => d.folder_id === id ? { ...d, folder_id: null } : d));
      if (selectedFolder === id) setSelectedFolder(null);
    }
  }

  async function moveDocToFolder(docId: string, folderId: string | null) {
    const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${docId}/folder`, {
      method: "PATCH", body: JSON.stringify({ folder_id: folderId }),
    });
    if (res.ok) {
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, folder_id: folderId } : d));
    }
  }

  function openPreview(doc: Doc) {
    setPreviewDoc(doc);
    setShowPreview(true);
  }

  // ── Drag & Drop für Ordner ────────────────────────────────────────────────

  function handleDocDragStart(e: React.DragEvent, docId: string) {
    e.dataTransfer.setData("docId", docId);
    setDraggingDocId(docId);
  }

  function handleFolderDrop(e: React.DragEvent, folderId: string | null) {
    e.preventDefault();
    const docId = e.dataTransfer.getData("docId");
    if (docId) moveDocToFolder(docId, folderId);
    setDraggingDocId(null);
    setDragOverFolderId(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const smartFolders = [
    { id: null, name: "Alle Dateien", icon: "📁", count: docs.length },
    { id: "chat", name: "Chat-Notizen", icon: "💬", count: docs.filter(d => d.doc_metadata?.source === "chat").length },
    { id: "images", name: "Bilder", icon: "🖼", count: docs.filter(d => ["jpg","jpeg","png","gif","webp","svg"].includes(d.file_type)).length },
    { id: "tables", name: "Tabellen", icon: "📊", count: docs.filter(d => ["xlsx","xls","csv"].includes(d.file_type)).length },
  ] as const;

  return (
    <div
      className={`relative flex flex-col h-full text-white overflow-hidden transition-colors ${dragOver ? "bg-indigo-950/40 ring-2 ring-indigo-500/50 ring-inset" : ""}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/6 shrink-0">
        <button onClick={() => setSidebarOpen(v => !v)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          title={sidebarOpen ? "Sidebar ausblenden" : "Sidebar einblenden"}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>

        <span className="text-xs text-gray-500 flex-1">{docs.length} Dateien · {formatBytes(totalBytes)}</span>

        <button onClick={loadAll} disabled={loading} title="Aktualisieren"
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-40">
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>

        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-indigo-500/50 w-28" />

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button onClick={() => setViewMode("list")}
            className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-white/10 text-white" : "text-gray-600 hover:text-gray-400"}`}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
          <button onClick={() => setViewMode("grid")}
            className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-white/10 text-white" : "text-gray-600 hover:text-gray-400"}`}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </button>
        </div>

        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
          {uploading
            ? <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>
            : <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
          {uploading ? "Lädt…" : "Hochladen"}
        </button>
        <input ref={fileInputRef} type="file" multiple accept={ACCEPTED} className="hidden"
          onChange={e => handleUpload(e.target.files)} />
      </div>

      {/* Drag overlay */}
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

      {/* ── Body: Sidebar + Liste + Vorschau ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-44 shrink-0 border-r border-white/6 flex flex-col overflow-y-auto">
            {/* Smart folders */}
            <div className="px-2 pt-2 pb-1">
              {smartFolders.map(sf => (
                <button key={String(sf.id)} onClick={() => setSelectedFolder(sf.id as string | null)}
                  onDragOver={e => { e.preventDefault(); setDragOverFolderId(String(sf.id)); }}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={e => handleFolderDrop(e, sf.id as string | null)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                    selectedFolder === sf.id
                      ? "bg-indigo-600/20 text-indigo-300"
                      : "text-gray-400 hover:bg-white/5 hover:text-white"
                  } ${dragOverFolderId === String(sf.id) ? "ring-1 ring-indigo-500/50" : ""}`}>
                  <span className="text-sm">{sf.icon}</span>
                  <span className="flex-1 truncate">{sf.name}</span>
                  <span className="text-[10px] text-gray-600">{sf.count}</span>
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="mx-2 my-1 border-t border-white/6" />

            {/* User folders */}
            <div className="px-2 flex-1">
              <div className="flex items-center justify-between px-2 py-1 mb-1">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Ordner</span>
                <button onClick={() => setShowNewFolder(true)}
                  className="text-gray-600 hover:text-gray-400 transition-colors" title="Neuer Ordner">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              </div>

              {folders.filter(f => !f.parent_id).map(folder => (
                <div key={folder.id} className="group">
                  <button
                    onClick={() => setSelectedFolder(folder.id)}
                    onDragOver={e => { e.preventDefault(); setDragOverFolderId(folder.id); }}
                    onDragLeave={() => setDragOverFolderId(null)}
                    onDrop={e => handleFolderDrop(e, folder.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                      selectedFolder === folder.id
                        ? "bg-indigo-600/20 text-indigo-300"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    } ${dragOverFolderId === folder.id ? "ring-1 ring-indigo-500/50" : ""}`}>
                    <svg className={`w-3.5 h-3.5 shrink-0 ${FOLDER_COLOR_MAP[folder.color] ?? "text-indigo-400"}`} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span className="flex-1 truncate">{folder.name}</span>
                    <span className="text-[10px] text-gray-600">{folder.document_count}</span>
                    <button onClick={e => { e.stopPropagation(); deleteFolder(folder.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all p-0.5 rounded">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </button>

                  {/* Sub-folders */}
                  {folders.filter(f => f.parent_id === folder.id).map(sub => (
                    <button key={sub.id}
                      onClick={() => setSelectedFolder(sub.id)}
                      onDragOver={e => { e.preventDefault(); setDragOverFolderId(sub.id); }}
                      onDragLeave={() => setDragOverFolderId(null)}
                      onDrop={e => handleFolderDrop(e, sub.id)}
                      className={`w-full flex items-center gap-2 pl-6 pr-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                        selectedFolder === sub.id ? "bg-indigo-600/20 text-indigo-300" : "text-gray-500 hover:bg-white/5 hover:text-white"
                      } ${dragOverFolderId === sub.id ? "ring-1 ring-indigo-500/50" : ""}`}>
                      <svg className={`w-3 h-3 shrink-0 ${FOLDER_COLOR_MAP[sub.color] ?? "text-gray-400"}`} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span className="flex-1 truncate">{sub.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* New folder dialog */}
            {showNewFolder && (
              <NewFolderDialog
                onSave={createFolder}
                onCancel={() => setShowNewFolder(false)}
              />
            )}
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-auto min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-600 text-xs">Lädt…</div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <span className="text-4xl opacity-20">📁</span>
              <p className="text-gray-600 text-xs">{search ? "Keine Treffer." : "Keine Dateien."}</p>
              {!search && (
                <button onClick={() => fileInputRef.current?.click()}
                  className="text-indigo-400 hover:text-indigo-300 text-xs underline underline-offset-2">
                  Erste Datei hochladen
                </button>
              )}
            </div>
          ) : viewMode === "list" ? (
            <div className="divide-y divide-white/4">
              {filteredDocs.map(doc => {
                const cat = getCategory(doc);
                const catColor = CATEGORY_COLORS[cat] ?? "text-gray-400 bg-gray-500/10";
                const isSelected = previewDoc?.id === doc.id && showPreview;
                return (
                  <div
                    key={doc.id}
                    draggable
                    onDragStart={e => handleDocDragStart(e, doc.id)}
                    onDragEnd={() => setDraggingDocId(null)}
                    onClick={() => openPreview(doc)}
                    className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                      isSelected ? "bg-indigo-600/10" : "hover:bg-white/3"
                    } ${draggingDocId === doc.id ? "opacity-40" : ""}`}
                  >
                    <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${catColor}`}>
                      {fileIcon(doc.file_type)} {cat}
                    </span>
                    <p className="flex-1 text-xs text-white font-medium truncate min-w-0">{doc.original_filename}</p>
                    <span className="text-[10px] text-gray-600 shrink-0">{formatBytes(doc.file_size_bytes)}</span>
                    <span className="text-[10px] text-gray-600 shrink-0">{formatDate(doc.created_at)}</span>

                    <button onClick={e => { e.stopPropagation(); toggleVisibility(doc); }}
                      title={doc.baddi_readable ? "Baddi darf lesen" : "Privat"}
                      className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium transition-all ${
                        doc.baddi_readable ? "text-emerald-400 bg-emerald-500/10" : "text-gray-500 bg-gray-500/10"
                      }`}>
                      {doc.baddi_readable ? "🤖" : "🔒"}
                    </button>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {onOpenFile && (
                        <button onClick={e => { e.stopPropagation(); openPreview(doc); }}
                          className="p-1 rounded text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all" title="Vorschau">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }} disabled={deleting === doc.id}
                        className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30" title="Löschen">
                        {deleting === doc.id
                          ? <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>
                          : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Grid view
            <div className="p-3 grid grid-cols-3 gap-2">
              {filteredDocs.map(doc => {
                const cat = getCategory(doc);
                const isSelected = previewDoc?.id === doc.id && showPreview;
                return (
                  <div key={doc.id}
                    draggable
                    onDragStart={e => handleDocDragStart(e, doc.id)}
                    onDragEnd={() => setDraggingDocId(null)}
                    onClick={() => openPreview(doc)}
                    className={`group relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected ? "border-indigo-500/50 bg-indigo-600/10" : "border-white/6 hover:border-white/12 hover:bg-white/3"
                    } ${draggingDocId === doc.id ? "opacity-40" : ""}`}>
                    <span className="text-2xl">{fileIcon(doc.file_type)}</span>
                    <p className="text-[10px] text-gray-300 text-center line-clamp-2 leading-tight">{doc.original_filename}</p>
                    <span className="text-[9px] text-gray-600">{formatBytes(doc.file_size_bytes)}</span>
                    <button onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }} disabled={deleting === doc.id}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 transition-all">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Preview panel */}
        {showPreview && previewDoc && (
          <div className="w-64 shrink-0 border-l border-white/6">
            <PreviewPanel doc={previewDoc} onClose={() => { setShowPreview(false); setPreviewDoc(null); }} />
          </div>
        )}
      </div>
    </div>
  );
}
