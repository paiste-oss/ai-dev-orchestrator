"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { useT } from "@/lib/i18n";
import { useLiteratureUpload } from "@/lib/literature-upload-context";
import WindowFrame from "./WindowFrame";

interface LitEntry {
  id: string;
  entry_type: "paper" | "book" | "patent";
  title: string;
  authors: string[] | null;
  year: number | null;
  abstract: string | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  url: string | null;
  publisher: string | null;
  isbn: string | null;
  edition: string | null;
  tags: string[] | null;
  notes: string | null;
  pdf_s3_key: string | null;
  pdf_size_bytes: number;
  baddi_readable: boolean;
  is_favorite: boolean;
  read_later: boolean;
  group_id: string | null;
  import_source: string;
  created_at: string;
}

interface LitGroup {
  id: string;
  entry_type: "paper" | "book" | "patent";
  name: string;
  parent_id: string | null;
  position: number;
}

type SidebarFilter = "all" | "new" | "paper" | "book" | "patent" | "favorites" | "read_later";

const EMPTY_FORM: Partial<LitEntry> = {
  entry_type: "paper",
  title: "",
  authors: [],
  year: undefined,
  abstract: "",
  journal: "",
  volume: "",
  issue: "",
  pages: "",
  doi: "",
  url: "",
  publisher: "",
  isbn: "",
  edition: "",
  tags: [],
  notes: "",
  baddi_readable: true,
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconTrash() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}
function IconSpinner() {
  return <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>;
}
function IconEdit() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function IconUpload() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
}
function IconChevron({ open }: { open: boolean }) {
  return <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
}
function IconStarFilled() {
  return <svg className="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}
function IconStar() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}
function IconBookmarkFilled() {
  return <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>;
}
function IconBookmarkOutline() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>;
}
function IconFolder() {
  return <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
}
function IconFolderOpen() {
  return <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
}
function IconGroup() {
  return <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>;
}
function IconPlus() {
  return <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function IconPencilTiny() {
  return <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>;
}
function IconTrashTiny() {
  return <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>;
}

function fmtAuthors(authors: string[] | null): string {
  if (!authors || authors.length === 0) return "";
  if (authors.length <= 2) return authors.join(", ");
  return `${authors[0]} et al.`;
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  entry,
  onClose,
  onDelete,
  onEdit,
  onPdfUpload,
  onPdfOpen,
  onToggleFavorite,
  onToggleReadLater,
  deleting,
}: {
  entry: LitEntry | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (entry: LitEntry) => void;
  onPdfUpload: (entry: LitEntry, file: File) => void;
  onPdfOpen: (entry: LitEntry) => void;
  onToggleFavorite: (entry: LitEntry) => void;
  onToggleReadLater: (entry: LitEntry) => void;
  deleting: string | null;
}) {
  const pdfInputRef = useRef<HTMLInputElement>(null);

  if (!entry) return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
      <span className="text-3xl opacity-10">📚</span>
      <p className="text-gray-600 text-xs">Eintrag auswählen</p>
    </div>
  );

  const doiUrl = entry.doi
    ? (entry.doi.startsWith("http") ? entry.doi : `https://doi.org/${entry.doi}`)
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start gap-2 px-3 py-2 border-b border-white/6 shrink-0">
        <span className="text-sm shrink-0 mt-0.5">{entry.entry_type === "paper" ? "📄" : entry.entry_type === "patent" ? "🏛" : "📖"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white font-medium leading-tight">{entry.title}</p>
          {entry.authors && entry.authors.length > 0 && (
            <p className="text-[10px] text-gray-500 mt-0.5">{entry.authors.join("; ")}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onToggleFavorite(entry)} title={entry.is_favorite ? "Aus Favoriten entfernen" : "Zu Favoriten"}
            className="p-1 rounded transition-colors hover:scale-110">
            {entry.is_favorite ? <IconStarFilled /> : <span className="text-gray-600 hover:text-yellow-400 block transition-colors"><IconStar /></span>}
          </button>
          <button onClick={() => onToggleReadLater(entry)} title={entry.read_later ? "Aus 'Zu lesen' entfernen" : "Zu lesen vormerken"}
            className="p-1 rounded transition-colors hover:scale-110">
            {entry.read_later ? <IconBookmarkFilled /> : <span className="text-gray-600 hover:text-blue-400 block transition-colors"><IconBookmarkOutline /></span>}
          </button>
          <button onClick={() => onEdit(entry)} title="Bearbeiten"
            className="p-1 rounded text-gray-600 hover:text-[var(--accent-light)] transition-colors">
            <IconEdit />
          </button>
          <button onClick={() => onDelete(entry.id)} disabled={deleting === entry.id} title="Löschen"
            className="p-1 rounded text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30">
            {deleting === entry.id ? <IconSpinner /> : <IconTrash />}
          </button>
          <button onClick={onClose} className="p-1 text-gray-600 hover:text-gray-400 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Meta chips */}
      <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-white/4 shrink-0">
        {entry.year && <span className="text-[10px] bg-white/6 text-gray-400 px-1.5 py-0.5 rounded">{entry.year}</span>}
        {entry.entry_type === "patent" ? (
          <>
            {entry.isbn && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-mono">{entry.isbn}</span>}
            {entry.journal && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">{entry.journal}</span>}
            {entry.publisher && <span className="text-[10px] text-gray-600 truncate max-w-[120px]">{entry.publisher}</span>}
            {entry.volume && <span className="text-[10px] text-gray-600">IPC {entry.volume}</span>}
          </>
        ) : (
          <>
            {entry.journal && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded truncate max-w-[120px]">{entry.journal}</span>}
            {entry.publisher && <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded truncate max-w-[120px]">{entry.publisher}</span>}
            {entry.volume && <span className="text-[10px] text-gray-600">Vol.{entry.volume}</span>}
            {entry.issue && <span className="text-[10px] text-gray-600">Nr.{entry.issue}</span>}
            {entry.pages && <span className="text-[10px] text-gray-600">S.{entry.pages}</span>}
            {entry.isbn && <span className="text-[10px] text-gray-600">ISBN {entry.isbn}</span>}
          </>
        )}
        {(entry.tags || []).map(tag => (
          <span key={tag} className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded">#{tag}</span>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0 p-3 space-y-3 text-xs">
        {entry.abstract && (
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Abstract</p>
            <p className="text-gray-300 leading-relaxed">{entry.abstract}</p>
          </div>
        )}
        {entry.notes && (
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Notizen</p>
            <p className="text-gray-400 leading-relaxed whitespace-pre-wrap">{entry.notes}</p>
          </div>
        )}

        {/* Links */}
        <div className="space-y-1">
          {doiUrl && (
            <a href={doiUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[var(--accent-light)] hover:underline">
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              DOI: {entry.doi}
            </a>
          )}
          {entry.url && !doiUrl && (
            <a href={entry.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[var(--accent-light)] hover:underline truncate">
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              URL öffnen
            </a>
          )}
        </div>

        {/* PDF */}
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">PDF</p>
          {entry.pdf_s3_key ? (
            <div className="flex items-center gap-2">
              <button onClick={() => onPdfOpen(entry)}
                className="flex items-center gap-1.5 text-[var(--accent-light)] hover:underline">
                <span>📄</span> PDF öffnen ({Math.round(entry.pdf_size_bytes / 1024)} KB)
              </button>
              <button onClick={() => pdfInputRef.current?.click()}
                className="text-gray-600 hover:text-gray-400 transition-colors">
                <IconEdit />
              </button>
            </div>
          ) : (
            <button onClick={() => pdfInputRef.current?.click()}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors">
              <IconUpload /> PDF anhängen
            </button>
          )}
          <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onPdfUpload(entry, f); e.target.value = ""; }} />
        </div>
      </div>
    </div>
  );
}

// ── Entry Form ────────────────────────────────────────────────────────────────

function EntryForm({
  initial,
  onSave,
  onCancel,
  saving,
  onExtractPdf,
}: {
  initial: Partial<LitEntry>;
  onSave: (data: Partial<LitEntry>, pdfFile?: File) => void;
  onCancel: () => void;
  saving: boolean;
  onExtractPdf?: (file: File) => Promise<Partial<LitEntry>>;
}) {
  const [form, setForm] = useState<Partial<LitEntry>>(initial);
  const [authorInput, setAuthorInput] = useState((initial.authors || []).join("; "));
  const [tagInput, setTagInput] = useState((initial.tags || []).join(", "));
  const [extracting, setExtracting] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const pdfExtractRef = useRef<HTMLInputElement>(null);

  async function handlePdfExtract(file: File) {
    setPendingPdfFile(file);
    if (!onExtractPdf) return;
    setExtracting(true);
    try {
      const meta = await onExtractPdf(file);
      setForm(prev => ({ ...prev, ...meta }));
      if (meta.authors && meta.authors.length > 0) setAuthorInput(meta.authors.join("; "));
      if (meta.tags && meta.tags.length > 0) setTagInput(meta.tags.join(", "));
    } catch {
      // Fehlschlag ist ok — User kann manuell ausfüllen
    } finally {
      setExtracting(false);
    }
  }

  function handleDropZoneDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropActive(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") handlePdfExtract(file);
  }

  function set(field: keyof LitEntry, value: unknown) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function handleSave() {
    const authors = authorInput.split(";").map(a => a.trim()).filter(Boolean);
    const tags = tagInput.split(",").map(t => t.trim()).filter(Boolean);
    onSave(
      { ...form, authors: authors.length ? authors : null, tags: tags.length ? tags : null },
      pendingPdfFile ?? undefined,
    );
  }

  const isPaper = form.entry_type === "paper";
  const isPatent = form.entry_type === "patent";
  const labelClass = "text-[10px] text-gray-600 uppercase tracking-wider";
  const inputClass = "w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-[var(--accent)]/50";

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/6 shrink-0">
        <p className="text-xs font-medium text-white">{initial.id ? "Bearbeiten" : "Neuer Eintrag"}</p>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-400 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* PDF Autofill — nur bei neuen Einträgen */}
        {!initial.id && onExtractPdf && (
          <div
            className={`rounded-lg border-2 border-dashed transition-colors ${
              extracting
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                : dropActive
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : pendingPdfFile
                    ? "border-emerald-600/50 bg-emerald-950/20"
                    : "border-white/10 hover:border-white/25 cursor-pointer"
            }`}
            onClick={() => !extracting && !pendingPdfFile && pdfExtractRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!extracting) setDropActive(true); }}
            onDragEnter={e => { e.preventDefault(); if (!extracting) setDropActive(true); }}
            onDragLeave={() => setDropActive(false)}
            onDrop={handleDropZoneDrop}
          >
            {extracting ? (
              <div className="flex items-center justify-center gap-2 py-3 px-3">
                <IconSpinner />
                <span className="text-xs text-[var(--accent-light)]">Analysiere PDF…</span>
              </div>
            ) : pendingPdfFile ? (
              <div className="flex items-center gap-2 py-2.5 px-3">
                <svg className="w-3.5 h-3.5 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span className="flex-1 text-xs text-emerald-300 truncate">{pendingPdfFile.name}</span>
                <span className="text-[10px] text-gray-500 shrink-0">{Math.round(pendingPdfFile.size / 1024)} KB</span>
                <button
                  onClick={e => { e.stopPropagation(); setPendingPdfFile(null); }}
                  className="text-gray-600 hover:text-red-400 transition-colors shrink-0 text-xs px-1"
                  title="PDF entfernen">
                  ×
                </button>
                <button
                  onClick={e => { e.stopPropagation(); pdfExtractRef.current?.click(); }}
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                  title="Anderes PDF wählen">
                  Ändern
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-3 px-3 text-gray-500 hover:text-gray-300 transition-colors">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                <span className="text-xs">PDF hierher ziehen oder klicken</span>
              </div>
            )}
            <input ref={pdfExtractRef} type="file" accept=".pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfExtract(f); e.target.value = ""; }} />
          </div>
        )}

        {/* Alle Felder — während Extraktion gesperrt */}
        <div className={`space-y-3 ${extracting ? "opacity-40 pointer-events-none select-none" : ""}`}>

        {/* Typ */}
        <div className="flex gap-2">
          {([["paper", "📄 Paper"], ["book", "📖 Buch"], ["patent", "🏛 Patent"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => set("entry_type", val)}
              className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${form.entry_type === val ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "bg-white/5 border-white/10 text-gray-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Titel */}
        <div>
          <label className={labelClass}>Titel *</label>
          <input value={form.title || ""} onChange={e => set("title", e.target.value)}
            placeholder="Titel der Publikation" className={`${inputClass} mt-1`} />
        </div>

        {/* Autoren */}
        <div>
          <label className={labelClass}>Autoren (Semikolon-getrennt)</label>
          <input value={authorInput} onChange={e => setAuthorInput(e.target.value)}
            placeholder="Müller, H.; Schmidt, A." className={`${inputClass} mt-1`} />
        </div>

        {/* Jahr */}
        <div>
          <label className={labelClass}>Jahr</label>
          <input type="number" value={form.year || ""} onChange={e => set("year", e.target.value ? parseInt(e.target.value) : null)}
            placeholder="2024" className={`${inputClass} mt-1`} min={1000} max={2100} />
        </div>

        {/* Paper-Felder */}
        {isPaper && (
          <>
            <div>
              <label className={labelClass}>Zeitschrift / Journal</label>
              <input value={form.journal || ""} onChange={e => set("journal", e.target.value)}
                placeholder="Nature, JAMA, ..." className={`${inputClass} mt-1`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Vol.</label>
                <input value={form.volume || ""} onChange={e => set("volume", e.target.value)}
                  placeholder="12" className={`${inputClass} mt-1`} />
              </div>
              <div>
                <label className={labelClass}>Nr.</label>
                <input value={form.issue || ""} onChange={e => set("issue", e.target.value)}
                  placeholder="3" className={`${inputClass} mt-1`} />
              </div>
              <div>
                <label className={labelClass}>Seiten</label>
                <input value={form.pages || ""} onChange={e => set("pages", e.target.value)}
                  placeholder="45–67" className={`${inputClass} mt-1`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>DOI</label>
              <input value={form.doi || ""} onChange={e => set("doi", e.target.value)}
                placeholder="10.1234/nature.2024" className={`${inputClass} mt-1`} />
            </div>
          </>
        )}

        {/* Buch-Felder */}
        {!isPaper && (
          <>
            <div>
              <label className={labelClass}>Verlag</label>
              <input value={form.publisher || ""} onChange={e => set("publisher", e.target.value)}
                placeholder="Springer, Wiley, ..." className={`${inputClass} mt-1`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>ISBN</label>
                <input value={form.isbn || ""} onChange={e => set("isbn", e.target.value)}
                  placeholder="978-3-..." className={`${inputClass} mt-1`} />
              </div>
              <div>
                <label className={labelClass}>Auflage</label>
                <input value={form.edition || ""} onChange={e => set("edition", e.target.value)}
                  placeholder="3." className={`${inputClass} mt-1`} />
              </div>
            </div>
          </>
        )}

        {/* Patent-Felder */}
        {isPatent && (
          <>
            <div>
              <label className={labelClass}>Patentnummer</label>
              <input value={form.isbn || ""} onChange={e => set("isbn", e.target.value)}
                placeholder="EP1234567A1, US9876543B2, ..." className={`${inputClass} mt-1`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Anmelder / Inhaber</label>
                <input value={form.publisher || ""} onChange={e => set("publisher", e.target.value)}
                  placeholder="Firma AG" className={`${inputClass} mt-1`} />
              </div>
              <div>
                <label className={labelClass}>Amt / Land</label>
                <input value={form.journal || ""} onChange={e => set("journal", e.target.value)}
                  placeholder="EP, US, DE, CH, ..." className={`${inputClass} mt-1`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>IPC-Klassifikation</label>
              <input value={form.volume || ""} onChange={e => set("volume", e.target.value)}
                placeholder="H01M 10/052, ..." className={`${inputClass} mt-1`} />
            </div>
          </>
        )}

        {/* URL */}
        <div>
          <label className={labelClass}>URL</label>
          <input value={form.url || ""} onChange={e => set("url", e.target.value)}
            placeholder="https://..." className={`${inputClass} mt-1`} />
        </div>

        {/* Abstract */}
        <div>
          <label className={labelClass}>Abstract / Zusammenfassung</label>
          <textarea value={form.abstract || ""} onChange={e => set("abstract", e.target.value)}
            rows={4} placeholder="Kurze Zusammenfassung..."
            className={`${inputClass} mt-1 resize-none leading-relaxed`} />
        </div>

        {/* Tags */}
        <div>
          <label className={labelClass}>Schlagworte (Komma-getrennt)</label>
          <input value={tagInput} onChange={e => setTagInput(e.target.value)}
            placeholder="KI, Medizin, Studie" className={`${inputClass} mt-1`} />
        </div>

        {/* Notizen */}
        <div>
          <label className={labelClass}>Persönliche Notizen</label>
          <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)}
            rows={3} placeholder="Eigene Anmerkungen..."
            className={`${inputClass} mt-1 resize-none`} />
        </div>

        </div>{/* Ende: Felder-Wrapper */}
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-3 py-2 border-t border-white/6 shrink-0">
        <button onClick={handleSave} disabled={saving || extracting || !form.title?.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-xs py-1.5 rounded-lg transition-colors">
          {saving ? <IconSpinner /> : null}
          {saving ? "Speichern..." : "Speichern"}
        </button>
        <button onClick={onCancel}
          className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 text-xs py-1.5 rounded-lg transition-colors">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface LiteraturePanelProps {
  onOpenFile?: (args: { url: string; filename: string; fileType: string }) => void;
}

export default function LiteraturePanel({ onOpenFile }: LiteraturePanelProps = {}) {
  const t = useT();
  const [entries, setEntries] = useState<LitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<SidebarFilter>("all");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [paperOpen, setPaperOpen] = useState(true);
  const [bookOpen, setBookOpen] = useState(true);
  const [patentOpen, setPatentOpen] = useState(true);

  // Groups state
  const [groups, setGroups] = useState<LitGroup[]>([]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [addingGroupFor, setAddingGroupFor] = useState<{ type: "paper" | "book" | "patent"; parentId: string | null } | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<LitEntry | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<Partial<LitEntry>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState<string | null>(null);
  // Upload-State aus globalem Context — überlebt Unmount beim Fensterwechsel
  const { importingZip, zipProgress, zipResult, showZipDetails, setShowZipDetails,
          dismissZipResult, startZipImport,
          importingXml: importing, startXmlImport,
          importMsg, setImportMsg, reloadKey } = useLiteratureUpload();

  const importInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, groupsRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/literature/mine`),
        apiFetch(`${BACKEND_URL}/v1/literature/groups`),
      ]);
      if (entriesRes.ok) setEntries(await entriesRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Nach abgeschlossenem Upload (via Context) die Einträge neu laden
  const firstReloadKey = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey !== firstReloadKey.current) loadAll();
  }, [reloadKey, loadAll]);

  async function handleCreateGroup(type: "paper" | "book" | "patent", parentId: string | null, name: string) {
    const res = await apiFetch(`${BACKEND_URL}/v1/literature/groups`, {
      method: "POST",
      body: JSON.stringify({ entry_type: type, name, parent_id: parentId, position: 0 }),
    });
    if (res.ok) {
      const grp: LitGroup = await res.json();
      setGroups(prev => [...prev, grp]);
      if (parentId) setOpenGroups(prev => new Set(prev).add(parentId));
    }
  }

  async function handleRenameGroup(id: string, name: string) {
    const res = await apiFetch(`${BACKEND_URL}/v1/literature/groups/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const updated: LitGroup = await res.json();
      setGroups(prev => prev.map(g => g.id === id ? updated : g));
    }
    setRenamingId(null);
  }

  async function handleDeleteGroup(id: string) {
    const res = await apiFetch(`${BACKEND_URL}/v1/literature/groups/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setGroups(prev => prev.filter(g => g.id !== id && g.parent_id !== id));
      setEntries(prev => prev.map(e => e.group_id === id ? { ...e, group_id: null } : e));
      if (groupFilter === id) setGroupFilter(null);
    }
  }

  async function handleAssignGroup(entryId: string, groupId: string | null) {
    // Optimistic
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, group_id: groupId } : e));
    const res = await apiFetch(`${BACKEND_URL}/v1/literature/${entryId}/group`, {
      method: "PATCH",
      body: JSON.stringify({ group_id: groupId }),
    });
    if (!res.ok) {
      // Rollback — reload to be safe
      loadAll();
    }
  }

  function handleDragStart(e: React.DragEvent, entryId: string) {
    e.dataTransfer.setData("entryId", entryId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroupId(groupId);
  }

  function handleDragLeave() {
    setDragOverGroupId(null);
  }

  function handleDrop(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    setDragOverGroupId(null);
    const entryId = e.dataTransfer.getData("entryId");
    if (entryId) handleAssignGroup(entryId, groupId);
  }

  const now = Date.now();
  const _24h = 24 * 60 * 60 * 1000;
  const papers = entries.filter(e => e.entry_type === "paper");
  const books = entries.filter(e => e.entry_type === "book");
  const patents = entries.filter(e => e.entry_type === "patent");
  const newEntries = entries.filter(e => now - new Date(e.created_at).getTime() < _24h);
  const favorites = entries.filter(e => e.is_favorite);
  const readLaterEntries = entries.filter(e => e.read_later);
  const entriesWithoutPdf = entries.filter(e => !e.pdf_s3_key).length;

  // All sub-folder IDs of a group (direct children)
  const subFolderIds = (groupId: string): string[] =>
    groups.filter(g => g.parent_id === groupId).map(g => g.id);

  const filtered = entries.filter(e => {
    if (typeFilter === "new") { if (now - new Date(e.created_at).getTime() >= _24h) return false; }
    else if (typeFilter === "favorites") { if (!e.is_favorite) return false; }
    else if (typeFilter === "read_later") { if (!e.read_later) return false; }
    else if (typeFilter !== "all") { if (e.entry_type !== typeFilter) return false; }
    if (groupFilter) {
      const grp = groups.find(g => g.id === groupFilter);
      if (grp) {
        const ids = grp.parent_id === null ? [grp.id, ...subFolderIds(grp.id)] : [grp.id];
        if (!ids.includes(e.group_id ?? "")) return false;
      }
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      (e.authors || []).some(a => a.toLowerCase().includes(q)) ||
      (e.abstract || "").toLowerCase().includes(q) ||
      (e.journal || "").toLowerCase().includes(q) ||
      (e.publisher || "").toLowerCase().includes(q) ||
      (e.tags || []).some(t => t.toLowerCase().includes(q))
    );
  });

  async function handleSave(data: Partial<LitEntry>, pdfFile?: File) {
    setSaving(true);
    try {
      const isEdit = !!data.id;
      const url = isEdit ? `${BACKEND_URL}/v1/literature/${data.id}` : `${BACKEND_URL}/v1/literature/`;
      const res = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) return;
      let saved: LitEntry = await res.json();

      // PDF direkt nach dem Erstellen/Aktualisieren hochladen
      if (pdfFile) {
        const fd = new FormData();
        fd.append("file", pdfFile);
        const pdfRes = await apiFetchForm(`${BACKEND_URL}/v1/literature/${saved.id}/pdf`, fd);
        if (pdfRes.ok) saved = await pdfRes.json();
      }

      setEntries(prev => isEdit ? prev.map(e => e.id === saved.id ? saved : e) : [saved, ...prev]);
      setSelected(saved);
      setShowForm(false);
      setShowDetail(true);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/literature/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== id));
        if (selected?.id === id) { setSelected(null); setShowDetail(false); }
      }
    } finally { setDeleting(null); }
  }

  async function handleToggleFlag(entry: LitEntry, flag: "is_favorite" | "read_later") {
    const newVal = !entry[flag];
    const patch = { [flag]: newVal };
    // Optimistic update
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...patch } : e));
    setSelected(prev => prev?.id === entry.id ? { ...prev, ...patch } : prev);
    try {
      await apiFetch(`${BACKEND_URL}/v1/literature/${entry.id}/flags`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } catch {
      // Rollback
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, [flag]: !newVal } : e));
      setSelected(prev => prev?.id === entry.id ? { ...prev, [flag]: !newVal } : prev);
    }
  }

  // Upload-Dispatcher — leitet an den globalen Context weiter
  const handleImport = useCallback((file: File) => {
    startXmlImport(file, { network: t("err.network"), generic: t("err.generic") });
  }, [startXmlImport, t]);

  const handleZipImport = useCallback((file: File) => {
    startZipImport(file, { network: t("err.network"), generic: t("err.generic") });
  }, [startZipImport, t]);

  async function handleExtractPdf(file: File): Promise<Partial<LitEntry>> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetchForm(`${BACKEND_URL}/v1/literature/extract-pdf-meta`, fd);
    if (!res.ok) throw new Error(t("err.generic"));
    return await res.json() as Partial<LitEntry>;
  }

  async function handlePdfUpload(entry: LitEntry, file: File) {
    setUploadingPdf(entry.id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetchForm(`${BACKEND_URL}/v1/literature/${entry.id}/pdf`, fd);
      if (res.ok) {
        const updated: LitEntry = await res.json();
        setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
        if (selected?.id === updated.id) setSelected(updated);
      }
    } finally { setUploadingPdf(null); }
  }

  // PDF im FileViewer-Fenster öffnen — apiFetch sendet JWT, Blob-URL für iframe
  async function handlePdfOpen(entry: LitEntry) {
    if (!entry.pdf_s3_key) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/literature/${entry.id}/pdf`);
      if (!res.ok) {
        setImportMsg({ type: "err", text: t("err.generic") });
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const filename = entry.pdf_s3_key.split("/").pop() || `${entry.title}.pdf`;
      if (onOpenFile) {
        onOpenFile({ url: blobUrl, filename, fileType: "pdf" });
      } else {
        // Fallback: kein Callback verfügbar → in neuem Tab öffnen (Blob-URL umgeht Auth-Problem)
        window.open(blobUrl, "_blank", "noopener");
      }
    } catch {
      setImportMsg({ type: "err", text: t("err.network") });
    }
  }

  function openEdit(entry: LitEntry) {
    setEditEntry(entry);
    setShowDetail(false);
    setShowForm(true);
  }

  function openNew() {
    setEditEntry(EMPTY_FORM);
    setShowDetail(false);
    setShowForm(true);
  }

  function selectEntry(entry: LitEntry) {
    setSelected(entry);
    setShowForm(false);
    setShowDetail(true);
  }

  // Inline name input for new group/folder
  function NewGroupInput({ onConfirm, onCancel }: { onConfirm: (name: string) => void; onCancel: () => void }) {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5">
        <input
          autoFocus
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && newGroupName.trim()) { onConfirm(newGroupName.trim()); setNewGroupName(""); }
            if (e.key === "Escape") { onCancel(); setNewGroupName(""); }
          }}
          placeholder="Name…"
          className="flex-1 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-[var(--accent)]/60 min-w-0"
        />
        <button onClick={() => { if (newGroupName.trim()) { onConfirm(newGroupName.trim()); setNewGroupName(""); } }}
          className="text-[var(--accent-light)] hover:text-white text-[10px] px-1">✓</button>
        <button onClick={() => { onCancel(); setNewGroupName(""); }}
          className="text-gray-500 hover:text-white text-[10px] px-1">✕</button>
      </div>
    );
  }

  function RenameInput({ current, onConfirm, onCancel }: { current: string; onConfirm: (name: string) => void; onCancel: () => void }) {
    const [val, setVal] = useState(current);
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 flex-1 min-w-0">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && val.trim()) onConfirm(val.trim());
            if (e.key === "Escape") onCancel();
          }}
          className="flex-1 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-[var(--accent)]/60 min-w-0"
        />
        <button onClick={() => { if (val.trim()) onConfirm(val.trim()); }}
          className="text-[var(--accent-light)] hover:text-white text-[10px] shrink-0">✓</button>
        <button onClick={onCancel} className="text-gray-500 hover:text-white text-[10px] shrink-0">✕</button>
      </div>
    );
  }

  // Sidebar section for a type (Paper / Bücher / Patente) with nested groups
  function SidebarGroup({ type, label, icon, count, open, onToggle }: {
    type: SidebarFilter; label: string; icon: string;
    count: number; open: boolean; onToggle: () => void;
  }) {
    const entryType = type as "paper" | "book" | "patent";
    const topGroups = groups.filter(g => g.entry_type === entryType && g.parent_id === null)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

    const isAddingHere = addingGroupFor?.type === entryType && addingGroupFor?.parentId === null;

    return (
      <div>
        {/* Type header */}
        <div className="flex items-center gap-1 group/type">
          <button
            className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${typeFilter === type && !groupFilter ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}
            onClick={() => { onToggle(); setTypeFilter(type); setGroupFilter(null); }}>
            <IconChevron open={open} />
            <span>{icon}</span>
            <span className="flex-1 text-left">{label}</span>
            <span className="text-[10px] text-gray-600">{count}</span>
          </button>
          <button
            onClick={() => {
              if (!open) onToggle();
              setAddingGroupFor(isAddingHere ? null : { type: entryType, parentId: null });
            }}
            title="Neue Gruppe"
            className="opacity-0 group-hover/type:opacity-100 w-5 h-5 flex items-center justify-center rounded-full border border-white/20 text-gray-400 hover:text-white hover:border-white/50 hover:bg-white/10 transition-all shrink-0">
            <IconPlus />
          </button>
        </div>

        {/* Groups + Folders */}
        {open && (
          <div className="ml-3 mt-0.5 space-y-0.5">
            {isAddingHere && (
              <NewGroupInput
                onConfirm={name => { handleCreateGroup(entryType, null, name); setAddingGroupFor(null); }}
                onCancel={() => setAddingGroupFor(null)}
              />
            )}
            {topGroups.map(grp => {
              const subFolders = groups.filter(g => g.parent_id === grp.id)
                .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
              const grpOpen = openGroups.has(grp.id);
              const grpCount = entries.filter(e => e.group_id === grp.id || subFolders.some(f => f.id === e.group_id)).length;
              const isAddingFolder = addingGroupFor?.parentId === grp.id;
              const isGrpActive = groupFilter === grp.id;
              const isDragOver = dragOverGroupId === grp.id;

              return (
                <div key={grp.id}>
                  {/* Group row */}
                  <div
                    className={`flex items-center gap-1 rounded-lg px-1.5 py-1 group/grp transition-colors ${isGrpActive ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : isDragOver ? "bg-white/10 text-white" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"}`}
                    onDragOver={e => handleDragOver(e, grp.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, grp.id)}
                  >
                    <button
                      className="shrink-0"
                      onClick={() => setOpenGroups(prev => { const s = new Set(prev); grpOpen ? s.delete(grp.id) : s.add(grp.id); return s; })}>
                      <IconChevron open={grpOpen} />
                    </button>
                    <span className="shrink-0"><IconGroup /></span>
                    {renamingId === grp.id ? (
                      <RenameInput
                        current={grp.name}
                        onConfirm={name => handleRenameGroup(grp.id, name)}
                        onCancel={() => setRenamingId(null)}
                      />
                    ) : (
                      <>
                        <button
                          className="flex-1 text-left text-[11px] truncate"
                          onClick={() => { setGroupFilter(isGrpActive ? null : grp.id); setTypeFilter(type); }}>
                          {grp.name}
                        </button>
                        <span className="text-[10px] text-gray-700 shrink-0 group-hover/grp:hidden">{grpCount > 0 ? grpCount : ""}</span>
                        <div className="hidden group-hover/grp:flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setAddingGroupFor(isAddingFolder ? null : { type: entryType, parentId: grp.id })} title="Ordner hinzufügen" className="p-0.5 hover:text-white"><IconPlus /></button>
                          <button onClick={() => { setRenamingId(grp.id); setRenameVal(grp.name); }} title="Umbenennen" className="p-0.5 hover:text-white"><IconPencilTiny /></button>
                          <button onClick={() => handleDeleteGroup(grp.id)} title="Löschen" className="p-0.5 hover:text-red-400"><IconTrashTiny /></button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Sub-folders */}
                  {grpOpen && (
                    <div className="ml-4 mt-0.5 space-y-0.5">
                      {isAddingFolder && (
                        <NewGroupInput
                          onConfirm={name => { handleCreateGroup(entryType, grp.id, name); setAddingGroupFor(null); }}
                          onCancel={() => setAddingGroupFor(null)}
                        />
                      )}
                      {subFolders.map(folder => {
                        const folderCount = entries.filter(e => e.group_id === folder.id).length;
                        const isFolderActive = groupFilter === folder.id;
                        const isDragOverFolder = dragOverGroupId === folder.id;
                        return (
                          <div key={folder.id}
                            className={`flex items-center gap-1 rounded-lg px-1.5 py-1 group/folder transition-colors ${isFolderActive ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : isDragOverFolder ? "bg-white/10 text-white" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"}`}
                            onDragOver={e => handleDragOver(e, folder.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={e => handleDrop(e, folder.id)}
                          >
                            <span className="shrink-0">{isFolderActive ? <IconFolderOpen /> : <IconFolder />}</span>
                            {renamingId === folder.id ? (
                              <RenameInput
                                current={folder.name}
                                onConfirm={name => handleRenameGroup(folder.id, name)}
                                onCancel={() => setRenamingId(null)}
                              />
                            ) : (
                              <>
                                <button
                                  className="flex-1 text-left text-[11px] truncate"
                                  onClick={() => { setGroupFilter(isFolderActive ? null : folder.id); setTypeFilter(type); }}>
                                  {folder.name}
                                </button>
                                <span className="text-[10px] text-gray-700 shrink-0 group-hover/folder:hidden">{folderCount > 0 ? folderCount : ""}</span>
                                <div className="hidden group-hover/folder:flex items-center gap-0.5 shrink-0">
                                  <button onClick={() => setRenamingId(folder.id)} title="Umbenennen" className="p-0.5 hover:text-white"><IconPencilTiny /></button>
                                  <button onClick={() => handleDeleteGroup(folder.id)} title="Löschen" className="p-0.5 hover:text-red-400"><IconTrashTiny /></button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <WindowFrame>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b window-border-soft shrink-0">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche in Literatur…"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-[var(--accent)]/50" />
        <button onClick={() => importInputRef.current?.click()}
          disabled={importing}
          title="RIS / EndNote XML importieren"
          className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-gray-300 text-xs px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
          {importing ? <IconSpinner /> : <IconUpload />}
          XML/RIS
        </button>
        <button onClick={() => zipInputRef.current?.click()}
          disabled={importingZip || entries.length === 0}
          title={entries.length === 0 ? "Zuerst XML/RIS importieren — dann PDFs zuordnen" : `ZIP mit PDFs importieren — ${entriesWithoutPdf} Einträge ohne PDF`}
          className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-xs px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
          {importingZip ? <IconSpinner /> : <span className="text-[11px]">🗜</span>}
          PDFs (ZIP)
          {importingZip && zipProgress && (
            <span className="text-[9px] text-blue-400 font-mono">
              {zipProgress.phase === "uploading"
                ? `${zipProgress.sent}/${zipProgress.total}`
                : "⏳"}
            </span>
          )}
          {!importingZip && entries.length > 0 && entriesWithoutPdf > 0 && (
            <span className="text-[9px] text-amber-500 font-medium">{entriesWithoutPdf}</span>
          )}
        </button>
        <button onClick={openNew}
          className="flex items-center gap-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Neu
        </button>
        <input ref={importInputRef} type="file" accept=".ris,.xml" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
        <input ref={zipInputRef} type="file" accept=".zip" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleZipImport(f); e.target.value = ""; }} />
      </div>

      {/* Import status */}
      {importMsg && (
        <div className={`mx-3 mt-2 shrink-0 rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${importMsg.type === "ok" ? "bg-emerald-950/50 border border-emerald-800/50 text-emerald-300" : "bg-red-950/50 border border-red-800/50 text-red-300"}`}>
          {importMsg.type === "ok" ? "✓" : "⚠️"} {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* ZIP Import Ergebnis */}
      {zipResult && (
        <div className="mx-3 mt-2 shrink-0 bg-white/4 border border-white/10 rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="text-xs text-white font-medium">PDF-Import abgeschlossen</span>
            <span className="text-[10px] text-emerald-400">✓ {zipResult.matched} zugeordnet</span>
            {zipResult.already_had_pdf > 0 && <span className="text-[10px] text-gray-500">{zipResult.already_had_pdf} hatten schon PDF</span>}
            {zipResult.unmatched > 0 && <span className="text-[10px] text-amber-400">⚠ {zipResult.unmatched} nicht gefunden</span>}
            <button onClick={() => setShowZipDetails(!showZipDetails)}
              className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
              {showZipDetails ? "Ausblenden" : "Details"}
            </button>
            <button onClick={dismissZipResult} className="text-gray-600 hover:text-gray-400">×</button>
          </div>
          {showZipDetails && (
            <div className="border-t border-white/8 max-h-40 overflow-auto">
              {zipResult.details.map((d, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-white/4 last:border-0">
                  <span className="text-[10px] shrink-0">
                    {d.status === "matched" ? "✓" : d.status === "already_has_pdf" ? "○" : "✗"}
                  </span>
                  <span className={`text-[10px] font-mono truncate flex-1 ${d.status === "unmatched" ? "text-amber-500" : "text-gray-400"}`}>
                    {d.filename}
                  </span>
                  {d.matched_title && (
                    <span className="text-[10px] text-gray-600 truncate max-w-[180px]" title={d.matched_title}>
                      → {d.matched_title}
                    </span>
                  )}
                  {d.match_method && (
                    <span className="text-[9px] text-gray-700 shrink-0">{d.match_method}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar */}
        <div className="w-44 shrink-0 border-r border-white/6 flex flex-col overflow-y-auto py-2 px-2">
          {/* Alle */}
          <button onClick={() => { setTypeFilter("all"); setGroupFilter(null); }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${typeFilter === "all" && !groupFilter ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
            <span>📚</span>
            <span className="flex-1 text-left">Alle</span>
            <span className="text-[10px] text-gray-600">{entries.length}</span>
          </button>

          {/* Neu Hinzugefügt */}
          {newEntries.length > 0 && (
            <button onClick={() => { setTypeFilter("new"); setGroupFilter(null); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors mt-0.5 ${typeFilter === "new" ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
              <span className="text-[11px]">🆕</span>
              <span className="flex-1 text-left">Neu hinzugefügt</span>
              <span className="text-[10px] text-gray-600">{newEntries.length}</span>
            </button>
          )}

          <div className="border-t border-white/6 my-1.5" />

          <SidebarGroup type="paper" label="Paper" icon="📄" count={papers.length} open={paperOpen} onToggle={() => setPaperOpen(v => !v)} />
          <SidebarGroup type="book" label="Bücher" icon="📖" count={books.length} open={bookOpen} onToggle={() => setBookOpen(v => !v)} />
          <SidebarGroup type="patent" label="Patente" icon="🏛" count={patents.length} open={patentOpen} onToggle={() => setPatentOpen(v => !v)} />

          <div className="border-t border-white/6 my-1.5" />

          {/* Favoriten */}
          <button onClick={() => setTypeFilter("favorites")}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${typeFilter === "favorites" ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
            <span className="text-yellow-400 text-[11px]">★</span>
            <span className="flex-1 text-left">Favoriten</span>
            {favorites.length > 0 && <span className="text-[10px] text-gray-600">{favorites.length}</span>}
          </button>

          {/* Zu Lesen */}
          <button onClick={() => setTypeFilter("read_later")}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors mt-0.5 ${typeFilter === "read_later" ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
            <span className="text-blue-400 text-[11px]">🔖</span>
            <span className="flex-1 text-left">Zu lesen</span>
            {readLaterEntries.length > 0 && <span className="text-[10px] text-gray-600">{readLaterEntries.length}</span>}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center flex-1 text-gray-600 text-xs">Lade…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
              <span className="text-4xl opacity-20">📚</span>
              <p className="text-gray-600 text-xs">{search ? "Keine Treffer" : "Noch keine Literatur"}</p>
              {!search && (
                <div className="flex flex-col gap-1.5 items-center">
                  <button onClick={() => importInputRef.current?.click()} className="text-[var(--accent-light)] hover:underline text-xs">
                    1. RIS / XML importieren
                  </button>
                  <p className="text-[10px] text-gray-700">dann PDFs (ZIP) hochladen</p>
                  <button onClick={openNew} className="text-gray-600 hover:text-gray-400 hover:underline text-xs mt-1">
                    oder manuell hinzufügen
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              {filtered.map(entry => {
                const isActive = selected?.id === entry.id && (showDetail || showForm);
                const entryGroup = entry.group_id ? groups.find(g => g.id === entry.group_id) : null;
                const hasPdf = !!entry.pdf_s3_key;
                return (
                  <div key={entry.id}
                    draggable
                    onDragStart={e => handleDragStart(e, entry.id)}
                    onClick={() => selectEntry(entry)}
                    title={hasPdf ? undefined : "Kein PDF hinterlegt"}
                    className={`group flex items-start gap-2 px-3 py-2.5 border-b border-white/4 cursor-pointer transition-colors border-l-2 ${isActive ? "bg-[var(--accent-10)]" : "hover:bg-white/3"} ${hasPdf ? "border-l-transparent" : "border-l-amber-500/50"}`}>
                    <span className={`text-base shrink-0 mt-0.5 ${hasPdf ? "" : "opacity-50"}`}>{entry.entry_type === "paper" ? "📄" : entry.entry_type === "patent" ? "🏛" : "📖"}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${hasPdf ? "text-white" : "text-gray-500"}`}>{entry.title}</p>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">
                        {fmtAuthors(entry.authors)}{entry.year ? ` · ${entry.year}` : ""}
                        {entry.entry_type === "patent"
                          ? (entry.isbn ? ` · ${entry.isbn}` : "") + (entry.journal ? ` · ${entry.journal}` : "")
                          : (entry.journal ? ` · ${entry.journal}` : "") + (entry.publisher ? ` · ${entry.publisher}` : "")}
                      </p>
                      {entryGroup && (
                        <span className="text-[9px] text-amber-600/80 mt-0.5 flex items-center gap-0.5">
                          <IconFolder />
                          {entryGroup.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {/* Permanente Indikatoren */}
                      {entry.pdf_s3_key && <span className="text-[9px] text-gray-600 group-hover:hidden" title="PDF angehängt">PDF</span>}
                      {uploadingPdf === entry.id && <IconSpinner />}
                      {/* Hover-Aktionen */}
                      <div className="hidden group-hover:flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleToggleFlag(entry, "is_favorite")}
                          title={entry.is_favorite ? "Favorit entfernen" : "Favorit"}
                          className="p-0.5 rounded transition-colors">
                          {entry.is_favorite ? <IconStarFilled /> : <span className="text-gray-600 hover:text-yellow-400 block transition-colors"><IconStar /></span>}
                        </button>
                        <button onClick={() => handleToggleFlag(entry, "read_later")}
                          title={entry.read_later ? "Aus 'Zu lesen' entfernen" : "Zu lesen"}
                          className="p-0.5 rounded transition-colors">
                          {entry.read_later ? <IconBookmarkFilled /> : <span className="text-gray-600 hover:text-blue-400 block transition-colors"><IconBookmarkOutline /></span>}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail / Form panel */}
        {(showDetail || showForm) && (
          <>
            <div className="w-[4px] shrink-0 bg-white/5" />
            <div className="w-72 shrink-0 border-l border-white/6 overflow-hidden h-full">
              {showForm ? (
                <EntryForm
                  initial={editEntry}
                  onSave={handleSave}
                  onCancel={() => { setShowForm(false); if (selected) setShowDetail(true); }}
                  saving={saving}
                  onExtractPdf={!editEntry.id ? handleExtractPdf : undefined}
                />
              ) : (
                <DetailPanel
                  entry={selected}
                  onClose={() => { setShowDetail(false); setSelected(null); }}
                  onDelete={handleDelete}
                  onEdit={openEdit}
                  onPdfUpload={handlePdfUpload}
                  onPdfOpen={handlePdfOpen}
                  onToggleFavorite={e => handleToggleFlag(e, "is_favorite")}
                  onToggleReadLater={e => handleToggleFlag(e, "read_later")}
                  deleting={deleting}
                />
              )}
            </div>
          </>
        )}
      </div>
    </WindowFrame>
  );
}
