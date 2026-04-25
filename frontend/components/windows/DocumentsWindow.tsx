"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { fmtBytes as formatBytes, formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import WindowFrame from "./WindowFrame";

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

type SortKey = "name" | "category" | "date" | "size";
type ViewMode = "list" | "grid";

interface OpenFileInfo { url: string; filename: string; fileType: string; literatureEntryId?: string; literatureTitle?: string; documentEntryId?: string; }
interface Props { onOpenFile?: (info: OpenFileInfo) => void; }

// ── Constants ─────────────────────────────────────────────────────────────────

// Internal category keys (language-neutral)
const CATEGORY_MAP: Record<string, string> = {
  pdf: "document", docx: "document", doc: "document", rtf: "document",
  xlsx: "table", xls: "table", csv: "table",
  pptx: "presentation", ppt: "presentation",
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", svg: "image",
  json: "code", xml: "code", html: "code", htm: "code",
  txt: "text", md: "text", log: "text",
};

const CATEGORY_COLORS: Record<string, string> = {
  document: "text-blue-400 bg-blue-500/10",
  table: "text-green-400 bg-green-500/10",
  presentation: "text-orange-400 bg-orange-500/10",
  image: "text-pink-400 bg-pink-500/10",
  code: "text-cyan-400 bg-cyan-500/10",
  text: "text-gray-400 bg-gray-500/10",
  chat_note: "text-violet-400 bg-violet-500/10",
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
  indigo: "text-[var(--accent-light)]", blue: "text-blue-400", green: "text-green-400",
  amber: "text-amber-400", red: "text-red-400", pink: "text-pink-400",
  purple: "text-purple-400", cyan: "text-cyan-400", gray: "text-gray-400",
};

const FOLDER_COLORS = ["indigo", "blue", "green", "amber", "red", "pink", "purple", "cyan", "gray"];
const ACCEPTED = ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.xml,.html,.log";

function getCategoryKey(doc: Doc): string {
  if (doc.doc_metadata?.source === "chat") return "chat_note";
  const mapped = CATEGORY_MAP[doc.file_type?.toLowerCase()];
  return doc.doc_metadata?.category || mapped || "file";
}
function fileIcon(t: string) { return FILE_ICONS[t?.toLowerCase()] ?? "📎"; }

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconEye() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function IconTrash() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}
function IconSpinner() {
  return <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>;
}

// ── Preview Panel ─────────────────────────────────────────────────────────────

interface PreviewPanelProps {
  doc: Doc | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (doc: Doc) => void;
  deleting: string | null;
}

function PreviewPanel({ doc, onClose, onDelete, onToggleVisibility, deleting }: PreviewPanelProps) {
  const t = useT();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) { setBlobUrl(null); setText(null); return; }
    setLoading(true); setError(null); setBlobUrl(null); setText(null);

    const isText = ["txt", "md", "json", "xml", "html", "htm", "csv", "log"].includes(doc.file_type?.toLowerCase());
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(doc.file_type?.toLowerCase());

    apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/content`)
      .then(async res => {
        if (!res.ok) { setError(t("docs.preview_error_unavailable")); return; }
        const blob = await res.blob();
        if (isText || doc.doc_metadata?.source === "chat") {
          setText(await blob.text());
        } else if (isImage || doc.file_type === "pdf") {
          setBlobUrl(URL.createObjectURL(blob));
        } else {
          setError(t("docs.preview_error_format"));
        }
      })
      .catch(() => setError(t("docs.preview_error_connection")))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  if (!doc) return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
      <span className="text-3xl opacity-10">👁</span>
      <p className="text-gray-600 text-xs">{t("docs.preview_select")}</p>
    </div>
  );

  const catKey = getCategoryKey(doc);
  const catLabel = t(`docs.cat_${catKey}`) !== `docs.cat_${catKey}` ? t(`docs.cat_${catKey}`) : catKey;
  const catColor = CATEGORY_COLORS[catKey] ?? "text-gray-400 bg-gray-500/10";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/6 shrink-0">
        <span className="text-sm shrink-0">{fileIcon(doc.file_type)}</span>
        <span className="flex-1 text-xs text-white font-medium truncate min-w-0" title={doc.original_filename}>
          {doc.original_filename}
        </span>
        {doc.doc_metadata?.source !== "chat" && (
          <button
            onClick={() => onToggleVisibility(doc)}
            title={doc.baddi_readable ? t("docs.baddi_readable_title") : t("docs.baddi_private_title")}
            className={`shrink-0 p-1 rounded transition-colors ${doc.baddi_readable ? "text-emerald-400 hover:text-emerald-300" : "text-gray-600 hover:text-gray-400"}`}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {doc.baddi_readable
                ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>}
            </svg>
          </button>
        )}
        <button
          onClick={() => onDelete(doc.id)}
          disabled={deleting === doc.id}
          title={t("docs.delete")}
          className="shrink-0 p-1 rounded text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30">
          {deleting === doc.id ? <IconSpinner /> : <IconTrash />}
        </button>
        <button onClick={onClose} className="shrink-0 p-1 text-gray-600 hover:text-gray-400 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 border-b border-white/4 shrink-0">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${catColor}`}>{catLabel}</span>
        <span className="text-[10px] text-gray-600">{formatBytes(doc.file_size_bytes)}</span>
        {doc.page_count > 0 && <span className="text-[10px] text-gray-600">{doc.page_count} S.</span>}
        <span className="text-[10px] text-gray-600">{formatDate(doc.created_at)}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && !text && !blobUrl && !error && (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">{t("docs.loading")}</div>
        )}
        {error && (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">{error}</div>
        )}
        {blobUrl && doc.file_type === "pdf" && (
          <iframe src={blobUrl} className="w-full h-full border-0" title={doc.original_filename} />
        )}
        {blobUrl && ["jpg","jpeg","png","gif","webp","svg"].includes(doc.file_type?.toLowerCase()) && (
          <div className="flex items-center justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blobUrl} alt={doc.original_filename} className="max-w-full object-contain rounded-lg" />
          </div>
        )}
        {text !== null && (
          text.trim() === ""
            ? <div className="flex items-center justify-center h-24 text-gray-600 text-xs">{t("docs.preview_no_content")}</div>
            : <div className="p-3 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap break-words">{text}</div>
        )}
      </div>
    </div>
  );
}

// ── New Folder Dialog ─────────────────────────────────────────────────────────

function NewFolderDialog({ onSave, onCancel }: { onSave: (n: string, c: string) => void; onCancel: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [color, setColor] = useState("indigo");
  return (
    <div className="mx-2 my-2 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2.5 shrink-0">
      <p className="text-xs font-medium text-white">{t("docs.new_folder")}</p>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={t("docs.folder_name_placeholder")}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-[var(--accent)]/50"
        onKeyDown={e => { if (e.key === "Enter" && name.trim()) onSave(name.trim(), color); if (e.key === "Escape") onCancel(); }} />
      <div className="flex items-center gap-1.5">
        {FOLDER_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-4 h-4 rounded-full border-2 transition-all bg-current ${FOLDER_COLOR_MAP[c]?.replace("text-", "bg-").replace("-400", "-500") ?? ""} ${color === c ? "border-white scale-110" : "border-transparent opacity-60"}`} />
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => name.trim() && onSave(name.trim(), color)} disabled={!name.trim()}
          className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-xs py-1.5 rounded-lg transition-colors">{t("docs.create")}</button>
        <button onClick={onCancel} className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 text-xs py-1.5 rounded-lg transition-colors">{t("docs.cancel")}</button>
      </div>
    </div>
  );
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({ checked, onChange, onClick }: { checked: boolean; onChange: (v: boolean) => void; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick?.(e); onChange(!checked); }}
      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-[var(--accent)] border-[var(--accent)]" : "border-white/20 hover:border-white/40 bg-transparent"}`}>
      {checked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DocumentsWindow({ onOpenFile }: Props) {
  const t = useT();
  const [docs, setDocs]               = useState<Doc[]>([]);
  const [folders, setFolders]         = useState<Folder[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc]   = useState<Doc | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode]       = useState<ViewMode>("list");
  const [search, setSearch]           = useState("");
  const [sortKey, setSortKey]         = useState<SortKey>("date");
  const [sortAsc, setSortAsc]         = useState(false);
  const [dragOver, setDragOver]       = useState(false);
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(240);

  const isResizing     = useRef(false);
  const resizeStartX   = useRef(0);
  const resizeStartW   = useRef(0);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartW.current = previewWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [previewWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = resizeStartX.current - e.clientX;
      setPreviewWidth(Math.min(Math.max(resizeStartW.current + delta, 160), 520));
    };
    const onUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, fr] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/documents/mine`),
        apiFetch(`${BACKEND_URL}/v1/document-folders`),
      ]);
      if (dr.ok) setDocs(await dr.json());
      if (fr.ok) setFolders(await fr.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadAll, 30_000);
    return () => clearInterval(timer);
  }, [loadAll]);

  const filteredDocs = docs.filter(d => {
    const q = search.toLowerCase();
    const catKey = getCategoryKey(d);
    const catLabel = t(`docs.cat_${catKey}`) !== `docs.cat_${catKey}` ? t(`docs.cat_${catKey}`) : catKey;
    const matchSearch = !q || d.original_filename.toLowerCase().includes(q) || catLabel.toLowerCase().includes(q);
    if (selectedFolder === "chat")   return matchSearch && d.doc_metadata?.source === "chat";
    if (selectedFolder === "images") return matchSearch && ["jpg","jpeg","png","gif","webp","svg"].includes(d.file_type?.toLowerCase());
    if (selectedFolder === "tables") return matchSearch && ["xlsx","xls","csv"].includes(d.file_type?.toLowerCase());
    if (selectedFolder === null)     return matchSearch;
    return matchSearch && d.folder_id === selectedFolder;
  });

  const sortedDocs = [...filteredDocs].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name")     cmp = a.original_filename.localeCompare(b.original_filename);
    if (sortKey === "category") cmp = getCategoryKey(a).localeCompare(getCategoryKey(b));
    if (sortKey === "date")     cmp = a.created_at.localeCompare(b.created_at);
    if (sortKey === "size")     cmp = a.file_size_bytes - b.file_size_bytes;
    return sortAsc ? cmp : -cmp;
  });

  const totalBytes = docs.reduce((s, d) => s + d.file_size_bytes, 0);
  const allFilteredSelected = sortedDocs.length > 0 && sortedDocs.every(d => selected.has(d.id));

  const toggleVisibility = useCallback(async (doc: Doc) => {
    const val = !doc.baddi_readable;
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, baddi_readable: val } : d));
    if (previewDoc?.id === doc.id) setPreviewDoc(p => p ? { ...p, baddi_readable: val } : p);
    await apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/visibility`, {
      method: "PATCH", body: JSON.stringify({ baddi_readable: val }),
    });
  }, [previewDoc]);

  const deleteDoc = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDocs(prev => prev.filter(d => d.id !== id));
        setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
        if (previewDoc?.id === id) { setPreviewDoc(null); setShowPreview(false); }
      }
    } finally { setDeleting(null); }
  }, [previewDoc]);

  async function bulkDelete() {
    setBulkDeleting(true);
    for (const id of Array.from(selected)) {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${id}`, { method: "DELETE" });
      if (res.ok) setDocs(prev => prev.filter(d => d.id !== id));
    }
    setSelected(new Set());
    if (previewDoc && selected.has(previewDoc.id)) { setPreviewDoc(null); setShowPreview(false); }
    setBulkDeleting(false);
  }

  async function bulkToggleBaddi(readable: boolean) {
    for (const id of Array.from(selected)) {
      await apiFetch(`${BACKEND_URL}/v1/documents/mine/${id}/visibility`, {
        method: "PATCH", body: JSON.stringify({ baddi_readable: readable }),
      });
      setDocs(prev => prev.map(d => selected.has(d.id) ? { ...d, baddi_readable: readable } : d));
    }
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
          const err = await res.json().catch(() => ({ detail: t("docs.upload") }));
          setUploadError(err.detail ?? t("docs.uploading"));
        }
      } catch { setUploadError(t("docs.preview_error_connection")); }
    }
    setUploading(false);
    await loadAll();
  }

  async function createFolder(name: string, color: string) {
    const res = await apiFetch(`${BACKEND_URL}/v1/document-folders`, {
      method: "POST", body: JSON.stringify({ name, color }),
    });
    if (res.ok) { const folder = await res.json(); setFolders(prev => [...prev, folder]); }
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
    if (res.ok) setDocs(prev => prev.map(d => d.id === docId ? { ...d, folder_id: folderId } : d));
  }

  function openPreview(doc: Doc) { setPreviewDoc(doc); setShowPreview(true); }

  async function openInViewer(doc: Doc) {
    if (!onOpenFile) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/content`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      onOpenFile({ url, filename: doc.original_filename, fileType: doc.file_type, documentEntryId: doc.id });
    } catch { /* silent */ }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected(prev => { const s = new Set(prev); sortedDocs.forEach(d => s.delete(d.id)); return s; });
    } else {
      setSelected(prev => { const s = new Set(prev); sortedDocs.forEach(d => s.add(d.id)); return s; });
    }
  }

  function handleDocDragStart(e: React.DragEvent, docId: string) {
    e.dataTransfer.setData("docId", docId);
    setDraggingDocId(docId);
  }

  function handleFolderDrop(e: React.DragEvent, folderId: string | null) {
    e.preventDefault();
    const id = e.dataTransfer.getData("docId");
    if (id) moveDocToFolder(id, folderId);
    setDraggingDocId(null); setDragOverFolderId(null);
  }

  function cycleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  const smartFolders = [
    { id: null,     name: t("docs.all_files"),   icon: "📁", count: docs.length },
    { id: "chat",   name: t("docs.chat_notes"),  icon: "💬", count: docs.filter(d => d.doc_metadata?.source === "chat").length },
    { id: "images", name: t("docs.images"),      icon: "🖼", count: docs.filter(d => ["jpg","jpeg","png","gif","webp","svg"].includes(d.file_type?.toLowerCase())).length },
    { id: "tables", name: t("docs.tables"),      icon: "📊", count: docs.filter(d => ["xlsx","xls","csv"].includes(d.file_type?.toLowerCase())).length },
  ] as const;

  const sortColumns: [SortKey, string][] = [
    ["name", t("docs.col_name")],
    ["category", t("docs.col_type")],
    ["size", t("docs.col_size")],
    ["date", t("docs.col_date")],
  ];

  return (
    <WindowFrame>
    <div
      className={`relative flex flex-col h-full transition-colors ${dragOver ? "bg-[var(--accent-10)] ring-2 ring-[var(--accent-50)] ring-inset" : ""}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b window-border-soft shrink-0">
        <button onClick={() => setSidebarOpen(v => !v)} title="Sidebar"
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
        <span className="text-xs text-gray-500 flex-1">{t("docs.file_count", { n: String(docs.length), size: formatBytes(totalBytes) })}</span>
        <button onClick={loadAll} disabled={loading} title={t("docs.refresh")}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-40">
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("docs.search_placeholder")}
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-[var(--accent)]/50 w-28" />
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(["list", "grid"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`p-1.5 transition-colors ${viewMode === v ? "bg-white/10 text-white" : "text-gray-600 hover:text-gray-400"}`}>
              {v === "list"
                ? <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}
            </button>
          ))}
        </div>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
          {uploading ? <IconSpinner /> : <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
          {uploading ? t("docs.uploading") : t("docs.upload")}
        </button>
        <input ref={fileInputRef} type="file" multiple accept={ACCEPTED} className="hidden" onChange={e => handleUpload(e.target.files)} />
      </div>

      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-[var(--accent)] text-[var(--accent-text)] text-sm font-medium px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {t("docs.drop_hint")}
          </div>
        </div>
      )}

      {uploadError && (
        <div className="mx-3 mt-2 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2 text-xs text-red-300 shrink-0">
          ⚠️ {uploadError}
          <button onClick={() => setUploadError(null)} className="ml-2 text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-44 shrink-0 border-r border-white/6 flex flex-col overflow-y-auto">
            <div className="px-2 pt-2 pb-1">
              {smartFolders.map(sf => (
                <button key={String(sf.id)} onClick={() => setSelectedFolder(sf.id as string | null)}
                  onDragOver={e => { e.preventDefault(); setDragOverFolderId(String(sf.id)); }}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={e => handleFolderDrop(e, sf.id as string | null)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                    selectedFolder === sf.id ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"
                  } ${dragOverFolderId === String(sf.id) ? "ring-1 ring-[var(--accent-50)]" : ""}`}>
                  <span className="text-sm">{sf.icon}</span>
                  <span className="flex-1 truncate">{sf.name}</span>
                  <span className="text-[10px] text-gray-600">{sf.count}</span>
                </button>
              ))}
            </div>
            <div className="mx-2 my-1 border-t border-white/6" />
            <div className="px-2 flex-1">
              <div className="flex items-center justify-between px-2 py-1 mb-1">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">{t("docs.folders")}</span>
                <button onClick={() => setShowNewFolder(true)} className="text-gray-600 hover:text-gray-400 transition-colors">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
              {folders.filter(f => !f.parent_id).map(folder => (
                <div key={folder.id} className="group">
                  <button onClick={() => setSelectedFolder(folder.id)}
                    onDragOver={e => { e.preventDefault(); setDragOverFolderId(folder.id); }}
                    onDragLeave={() => setDragOverFolderId(null)}
                    onDrop={e => handleFolderDrop(e, folder.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                      selectedFolder === folder.id ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"
                    } ${dragOverFolderId === folder.id ? "ring-1 ring-[var(--accent-50)]" : ""}`}>
                    <svg className={`w-3.5 h-3.5 shrink-0 ${FOLDER_COLOR_MAP[folder.color] ?? "text-[var(--accent-light)]"}`} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span className="flex-1 truncate">{folder.name}</span>
                    <span className="text-[10px] text-gray-600">{folder.document_count}</span>
                    <button onClick={e => { e.stopPropagation(); deleteFolder(folder.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all p-0.5 rounded">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </button>
                  {folders.filter(f => f.parent_id === folder.id).map(sub => (
                    <button key={sub.id} onClick={() => setSelectedFolder(sub.id)}
                      onDragOver={e => { e.preventDefault(); setDragOverFolderId(sub.id); }}
                      onDragLeave={() => setDragOverFolderId(null)}
                      onDrop={e => handleFolderDrop(e, sub.id)}
                      className={`w-full flex items-center gap-2 pl-6 pr-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                        selectedFolder === sub.id ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-500 hover:bg-white/5 hover:text-white"
                      } ${dragOverFolderId === sub.id ? "ring-1 ring-[var(--accent-50)]" : ""}`}>
                      <svg className={`w-3 h-3 shrink-0 ${FOLDER_COLOR_MAP[sub.color] ?? "text-gray-400"}`} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span className="flex-1 truncate">{sub.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {showNewFolder && <NewFolderDialog onSave={createFolder} onCancel={() => setShowNewFolder(false)} />}
          </div>
        )}

        {/* ── File area ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">

          {loading ? (
            <div className="flex items-center justify-center flex-1 text-gray-600 text-xs">{t("docs.loading")}</div>
          ) : sortedDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
              <span className="text-4xl opacity-20">📁</span>
              <p className="text-gray-600 text-xs">{search ? t("docs.empty_search") : t("docs.empty_files")}</p>
              {!search && <button onClick={() => fileInputRef.current?.click()} className="text-[var(--accent-light)] hover:text-[var(--accent-hover)] text-xs underline underline-offset-2">{t("docs.upload_first")}</button>}
            </div>
          ) : viewMode === "list" ? (

            /* ══ LIST / TABLE VIEW ══════════════════════════════════════════ */
            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-[#0f1117]">
                  <tr className="border-b border-white/6">
                    <th className="w-8 px-3 py-2">
                      <Checkbox checked={allFilteredSelected} onChange={toggleSelectAll} />
                    </th>
                    {sortColumns.map(([key, label]) => (
                      <th key={key} onClick={() => cycleSort(key)}
                        className={`text-left px-2 py-2 font-medium cursor-pointer select-none whitespace-nowrap transition-colors ${sortKey === key ? "text-[var(--accent-light)]" : "text-gray-600 hover:text-gray-400"}`}>
                        {label}{sortKey === key && <span className="ml-0.5">{sortAsc ? "↑" : "↓"}</span>}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{t("docs.col_pages")}</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{t("docs.col_baddi")}</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">{t("docs.col_actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/4">
                  {sortedDocs.map(doc => {
                    const catKey = getCategoryKey(doc);
                    const catLabel = t(`docs.cat_${catKey}`) !== `docs.cat_${catKey}` ? t(`docs.cat_${catKey}`) : catKey;
                    const catColor = CATEGORY_COLORS[catKey] ?? "text-gray-400 bg-gray-500/10";
                    const isSelected = previewDoc?.id === doc.id && showPreview;
                    const isChecked = selected.has(doc.id);
                    return (
                      <tr key={doc.id}
                        draggable
                        onDragStart={e => handleDocDragStart(e, doc.id)}
                        onDragEnd={() => setDraggingDocId(null)}
                        onClick={() => openPreview(doc)}
                        onDoubleClick={() => openInViewer(doc)}
                        className={`cursor-pointer transition-colors ${isSelected ? "bg-[var(--accent-10)]" : "hover:bg-white/3"} ${draggingDocId === doc.id ? "opacity-40" : ""} ${isChecked ? "bg-[var(--accent-10)]" : ""}`}>
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={isChecked} onChange={() => toggleSelect(doc.id)} />
                        </td>
                        <td className="px-2 py-2 max-w-[180px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="shrink-0">{fileIcon(doc.file_type)}</span>
                            <span className="truncate text-white font-medium" title={doc.original_filename}>{doc.original_filename}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${catColor}`}>{catLabel}</span>
                        </td>
                        <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatBytes(doc.file_size_bytes)}</td>
                        <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(doc.created_at)}</td>
                        <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{doc.page_count > 0 ? doc.page_count : "—"}</td>
                        <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                          {doc.doc_metadata?.source !== "chat" && (
                            <button onClick={() => toggleVisibility(doc)} title={doc.baddi_readable ? t("docs.readable") : t("docs.private")}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-all ${doc.baddi_readable ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20" : "text-gray-500 bg-gray-500/10 hover:bg-gray-500/20"}`}>
                              {doc.baddi_readable ? "🤖" : "🔒"}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openPreview(doc)} title={t("docs.preview_select")}
                              className="p-1 rounded text-gray-600 hover:text-[var(--accent-light)] hover:bg-[var(--accent-10)] transition-all">
                              <IconEye />
                            </button>
                            <button onClick={() => deleteDoc(doc.id)} disabled={deleting === doc.id} title={t("docs.delete")}
                              className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30">
                              {deleting === doc.id ? <IconSpinner /> : <IconTrash />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          ) : (

            /* ══ GRID VIEW ══════════════════════════════════════════════════ */
            <div className="flex-1 overflow-auto min-h-0">
              <div className="p-3 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(156px, 1fr))" }}>
                {sortedDocs.map(doc => {
                  const catKey = getCategoryKey(doc);
                  const catLabel = t(`docs.cat_${catKey}`) !== `docs.cat_${catKey}` ? t(`docs.cat_${catKey}`) : catKey;
                  const catColor = CATEGORY_COLORS[catKey] ?? "text-gray-400 bg-gray-500/10";
                  const isSelected = previewDoc?.id === doc.id && showPreview;
                  const isChecked = selected.has(doc.id);
                  return (
                    <div key={doc.id}
                      draggable
                      onDragStart={e => handleDocDragStart(e, doc.id)}
                      onDragEnd={() => setDraggingDocId(null)}
                      onClick={() => openPreview(doc)}
                      onDoubleClick={() => openInViewer(doc)}
                      className={`relative flex flex-col rounded-xl border cursor-pointer transition-all overflow-hidden ${
                        isSelected ? "border-[var(--accent-50)] bg-[var(--accent-10)]" : isChecked ? "border-[var(--accent-30)] bg-[var(--accent-10)]" : "border-white/6 hover:border-white/14 hover:bg-white/3"
                      } ${draggingDocId === doc.id ? "opacity-40" : ""}`}>

                      <div className="flex items-center gap-1.5 px-2 pt-2" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={isChecked} onChange={() => toggleSelect(doc.id)} />
                        <span className={`flex-1 text-[9px] font-medium px-1 py-0.5 rounded truncate ${catColor}`}>{catLabel}</span>
                        {doc.doc_metadata?.source !== "chat" && (
                          <button onClick={() => toggleVisibility(doc)} title={doc.baddi_readable ? t("docs.readable") : t("docs.private")}
                            className={`text-[11px] transition-colors ${doc.baddi_readable ? "opacity-80 hover:opacity-100" : "opacity-40 hover:opacity-70"}`}>
                            {doc.baddi_readable ? "🤖" : "🔒"}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-center py-3 text-3xl">
                        {fileIcon(doc.file_type)}
                      </div>

                      <div className="px-2 pb-2 space-y-0.5 flex-1">
                        <p className="text-[11px] text-white font-medium line-clamp-2 leading-tight" title={doc.original_filename}>
                          {doc.original_filename}
                        </p>
                        <p className="text-[10px] text-gray-600">
                          {formatBytes(doc.file_size_bytes)}{doc.page_count > 0 ? ` · ${doc.page_count} S.` : ""}
                        </p>
                        <p className="text-[10px] text-gray-600">{formatDate(doc.created_at)}</p>
                      </div>

                      <div className="flex items-center border-t border-white/6 divide-x divide-white/6" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openPreview(doc)} title={t("docs.preview_select")}
                          className="flex-1 flex items-center justify-center py-1.5 text-gray-600 hover:text-[var(--accent-light)] hover:bg-[var(--accent-10)] transition-colors">
                          <IconEye />
                        </button>
                        <button onClick={() => deleteDoc(doc.id)} disabled={deleting === doc.id} title={t("docs.delete")}
                          className="flex-1 flex items-center justify-center py-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30">
                          {deleting === doc.id ? <IconSpinner /> : <IconTrash />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Floating bulk action bar ── */}
          {selected.size > 0 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-gray-900/95 border border-white/10 backdrop-blur-sm rounded-xl px-3 py-2 shadow-xl">
              <span className="text-xs text-gray-400 font-medium shrink-0">{t("docs.selected_n", { n: String(selected.size) })}</span>
              <div className="w-px h-4 bg-white/10 shrink-0" />
              <button onClick={() => bulkToggleBaddi(true)} title={t("docs.readable")} className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors whitespace-nowrap">
                🤖 {t("docs.readable")}
              </button>
              <button onClick={() => bulkToggleBaddi(false)} title={t("docs.private")} className="text-xs text-gray-400 hover:text-gray-300 px-2 py-1 rounded hover:bg-white/5 transition-colors whitespace-nowrap">
                🔒 {t("docs.private")}
              </button>
              <button onClick={bulkDelete} disabled={bulkDeleting} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors disabled:opacity-40 whitespace-nowrap">
                {bulkDeleting ? <IconSpinner /> : <IconTrash />} {t("docs.delete")}
              </button>
              <div className="w-px h-4 bg-white/10 shrink-0" />
              <button onClick={() => setSelected(new Set())} className="text-gray-600 hover:text-gray-400 transition-colors p-1 rounded">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}
        </div>

        {/* ── Resizable preview panel ── */}
        {showPreview && previewDoc && (
          <>
            <div onMouseDown={onResizeMouseDown}
              className="group relative flex items-center justify-center shrink-0 w-[5px] cursor-col-resize hover:bg-[var(--accent-20)] active:bg-[var(--accent-30)] transition-colors border-x border-white/5">
              <div className="w-[2px] h-8 rounded-full bg-white/10 group-hover:bg-[var(--accent-50)] transition-colors" />
            </div>
            <div className="shrink-0 border-l border-white/6 overflow-hidden h-full" style={{ width: previewWidth }}>
              <PreviewPanel
                doc={previewDoc}
                onClose={() => { setShowPreview(false); setPreviewDoc(null); }}
                onDelete={deleteDoc}
                onToggleVisibility={toggleVisibility}
                deleting={deleting}
              />
            </div>
          </>
        )}
      </div>
    </div>
    </WindowFrame>
  );
}
