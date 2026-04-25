"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchForm, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { useT } from "@/lib/i18n";
import { useLiteratureUpload } from "@/lib/literature-upload-context";
import WindowFrame from "./WindowFrame";

// ── Eintragstypen — zentral definiert ─────────────────────────────────────────
type EntryType = "paper" | "book" | "patent" | "norm" | "law" | "regulatory" | "manual";

const ENTRY_TYPES: EntryType[] = ["paper", "book", "patent", "norm", "law", "regulatory", "manual"];

const TYPE_ICON: Record<EntryType, string> = {
  paper: "📄", book: "📖", patent: "🏛",
  norm: "📐", law: "⚖️", regulatory: "📋", manual: "📘",
};
const TYPE_LABEL_SINGULAR: Record<EntryType, string> = {
  paper: "Paper", book: "Buch", patent: "Patent",
  norm: "Norm", law: "Gesetz", regulatory: "Regulatorie", manual: "Manual",
};
const TYPE_LABEL_PLURAL: Record<EntryType, string> = {
  paper: "Paper", book: "Bücher", patent: "Patente",
  norm: "Normen", law: "Gesetze", regulatory: "Regulatorien", manual: "Manuals",
};

function typeIcon(t: string): string { return TYPE_ICON[t as EntryType] ?? "📄"; }
function typeLabel(t: string): string { return TYPE_LABEL_SINGULAR[t as EntryType] ?? t; }
function typeLabelPlural(t: string): string { return TYPE_LABEL_PLURAL[t as EntryType] ?? t; }

interface LitEntry {
  id: string;
  entry_type: EntryType;
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
  entry_type: EntryType;
  name: string;
  parent_id: string | null;
  position: number;
}

type SidebarFilter = "all" | "new" | EntryType | "favorites" | "read_later";

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
  onCollapse,
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
  onCollapse: () => void;
  onDelete: (id: string) => void;
  onEdit: (entry: LitEntry) => void;
  onPdfUpload: (entry: LitEntry, file: File) => void;
  onPdfOpen: (entry: LitEntry) => void;
  onToggleFavorite: (entry: LitEntry) => void;
  onToggleReadLater: (entry: LitEntry) => void;
  deleting: string | null;
}) {
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Wiederverwendbarer Header — exakt gleich hoch wie der PDF-Vorschau-Header
  const headerBar = (
    <div className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b window-border-soft">
      <button onClick={onCollapse} title="Detail einklappen"
        className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <span className="flex-1" />
      <button onClick={onClose} title="Schliessen"
        className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );

  if (!entry) return (
    <div className="flex flex-col h-full overflow-hidden">
      {headerBar}
      <div className="flex flex-col items-center justify-center flex-1 text-center gap-2">
        <span className="text-3xl opacity-10">📚</span>
        <p className="text-gray-600 text-xs">Eintrag auswählen</p>
      </div>
    </div>
  );

  const doiUrl = entry.doi
    ? (entry.doi.startsWith("http") ? entry.doi : `https://doi.org/${entry.doi}`)
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header-Bar (gleich hoch wie PDF-Vorschau) — nur Buttons, kein Titel */}
      {headerBar}

      {/* Titel-Section unter dem Header */}
      <div className="px-4 py-3 border-b border-white/6 shrink-0">
        <p className="text-sm text-white font-semibold leading-snug">{entry.title}</p>
        <p className="text-[11px] text-gray-400 mt-1 uppercase tracking-wider font-medium">
          {typeLabel(entry.entry_type)}
        </p>
      </div>

      {/* Content — strukturierte Felder */}
      <div className="flex-1 overflow-auto min-h-0 p-4 space-y-4 text-xs">

        {/* Autoren */}
        {entry.authors && entry.authors.length > 0 && (
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-1.5">Autoren</p>
            <p className="text-sm text-gray-200 leading-relaxed">{entry.authors.join("; ")}</p>
          </div>
        )}

        {/* Publikations-Daten als Grid mit Labels */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {entry.year && (
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Jahr</p>
              <p className="text-sm text-white tabular-nums">{entry.year}</p>
            </div>
          )}
          {entry.journal && (
            <div className="col-span-2">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{entry.entry_type === "patent" ? "Patentamt" : "Journal"}</p>
              <p className="text-sm text-white">{entry.journal}</p>
            </div>
          )}
          {entry.publisher && (
            <div className="col-span-2">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Verlag</p>
              <p className="text-sm text-white">{entry.publisher}</p>
            </div>
          )}
          {entry.entry_type !== "patent" && (entry.volume || entry.issue || entry.pages) && (
            <div className="col-span-2">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Ausgabe</p>
              <p className="text-sm text-gray-300">
                {entry.volume && <>Vol. <span className="text-white">{entry.volume}</span></>}
                {entry.issue && <>{entry.volume ? " · " : ""}Nr. <span className="text-white">{entry.issue}</span></>}
                {entry.pages && <>{(entry.volume || entry.issue) ? " · " : ""}S. <span className="text-white">{entry.pages}</span></>}
              </p>
            </div>
          )}
          {entry.isbn && (
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{entry.entry_type === "patent" ? "Patentnummer" : "ISBN"}</p>
              <p className="text-sm text-white font-mono">{entry.isbn}</p>
            </div>
          )}
          {entry.edition && (
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Auflage</p>
              <p className="text-sm text-white">{entry.edition}</p>
            </div>
          )}
        </div>

        {/* Tags */}
        {entry.tags && entry.tags.length > 0 && (
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {entry.tags.map(tag => (
                <span key={tag} className="text-xs bg-white/5 text-gray-300 px-2 py-0.5 rounded-full border border-white/10">#{tag}</span>
              ))}
            </div>
          </div>
        )}
        {entry.abstract && (
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-1.5">Abstract</p>
            <p className="text-sm text-gray-300 leading-relaxed">{entry.abstract}</p>
          </div>
        )}
        {entry.notes && (
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-1.5">Notizen</p>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{entry.notes}</p>
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

        {/* PDF — nur wenn keines angehängt ist; sonst ist es schon in der Vorschau */}
        {!entry.pdf_s3_key && (
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium mb-1">PDF</p>
            <button onClick={() => pdfInputRef.current?.click()}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors">
              <IconUpload /> PDF anhängen
            </button>
            <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onPdfUpload(entry, f); e.target.value = ""; }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── PDF Preview ───────────────────────────────────────────────────────────────

function PdfPreview({
  entry,
  pendingFile,
  onOpenFullView,
  onToggleFavorite,
  onToggleReadLater,
  onEdit,
}: {
  entry: LitEntry | null;
  pendingFile?: File | null;
  onOpenFullView: (entry: LitEntry) => void;
  onToggleFavorite: (entry: LitEntry) => void;
  onToggleReadLater: (entry: LitEntry) => void;
  onEdit: (entry: LitEntry) => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);

    // Vorrang: hochgeladene aber noch nicht gespeicherte Datei (Neu-Modus)
    if (pendingFile) {
      const url = URL.createObjectURL(pendingFile);
      setBlobUrl(url);
      setLoading(false);
      return () => { URL.revokeObjectURL(url); };
    }

    if (!entry?.pdf_s3_key) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch(`${BACKEND_URL}/v1/literature/${entry.id}/pdf`)
      .then(async res => res.ok ? res.blob() : null)
      .then(blob => {
        if (cancelled) return;
        if (blob) {
          setBlobUrl(URL.createObjectURL(blob));
        } else {
          setError(true);
        }
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entry?.id, entry?.pdf_s3_key, pendingFile]);

  // Alte Blob-URL freigeben wenn neue gesetzt wird
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 flex items-center justify-end gap-0.5 px-3 py-1.5 border-b window-border-soft">
        {entry && (
          <>
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
            {entry.pdf_s3_key && (
              <button onClick={() => onOpenFullView(entry)} title="Gesamtansicht"
                className="p-1 rounded text-gray-600 hover:text-[var(--accent-light)] transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M21 14v7H3V3h7"/>
                </svg>
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 bg-black/20 relative">
        {!entry && !pendingFile && (
          <div className="flex flex-col items-center justify-center h-full gap-2 window-text-subtle text-xs px-4 text-center">
            <span className="text-3xl opacity-40">📄</span>
            <span>Kein Eintrag ausgewählt</span>
          </div>
        )}
        {entry && !entry.pdf_s3_key && !pendingFile && (
          <div className="flex flex-col items-center justify-center h-full gap-2 window-text-subtle text-xs px-4 text-center">
            <span className="text-3xl opacity-40">📎</span>
            <span>Kein PDF angehängt</span>
          </div>
        )}
        {entry?.pdf_s3_key && !pendingFile && loading && (
          <div className="flex items-center justify-center h-full window-text-subtle text-xs">PDF wird geladen…</div>
        )}
        {entry?.pdf_s3_key && !pendingFile && error && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 window-text-subtle text-xs px-4 text-center">
            <span className="text-2xl">⚠️</span>
            <span>PDF konnte nicht geladen werden</span>
          </div>
        )}
        {blobUrl && !loading && !error && (
          // PDF-Open-Parameter: view=FitH = Fenster-Breite, toolbar=0 spart Platz
          <iframe src={`${blobUrl}#view=FitH&toolbar=0&navpanes=0`} title={pendingFile?.name ?? entry?.title ?? "PDF"} className="w-full h-full border-0 block" />
        )}
      </div>
    </div>
  );
}

// ── Grid-Header (sortierbar) ──────────────────────────────────────────────────

function SortableGrid({ sortKey, sortDir, onSort, allSelected, someSelected, onToggleAll, titleColWidth, onStartTitleResize }: {
  sortKey: "title" | "authors" | "year" | "journal" | "type";
  sortDir: "asc" | "desc";
  onSort: (k: "title" | "authors" | "year" | "journal" | "type") => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  titleColWidth: number;
  onStartTitleResize: (e: React.MouseEvent) => void;
}) {
  const headerRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = someSelected && !allSelected;
  }, [allSelected, someSelected]);

  const arrow = (k: typeof sortKey) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const Th = ({ k, label, className = "" }: { k: typeof sortKey; label: string; className?: string }) => (
    <button onClick={() => onSort(k)}
      className={`text-left text-[10px] uppercase tracking-wider font-semibold py-1 hover:text-white transition-colors truncate ${sortKey === k ? "text-[var(--accent-light)]" : "text-gray-500"} ${className}`}>
      {label}{arrow(k)}
    </button>
  );

  return (
    <div data-lit-grid="1"
      className="grid items-center gap-2 px-3 py-1.5 border-b border-white/8 sticky top-0 bg-black/40 backdrop-blur-sm z-10"
      style={{ gridTemplateColumns: `32px 28px ${titleColWidth}px 56px 180px 180px 60px` }}>
      <input ref={headerRef} type="checkbox" checked={allSelected} onChange={onToggleAll}
        className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer" title="Alle (de-)selektieren" />
      <Th k="type" label="" className="text-center" />
      <div className="relative">
        <Th k="title" label="Titel" />
        {/* Resize-Handle für die Titel-Spalte */}
        <div onMouseDown={onStartTitleResize}
          className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[var(--accent)]/40 transition-colors"
          title="Spaltenbreite ziehen" />
      </div>
      <Th k="year" label="Jahr" />
      <Th k="authors" label="Autoren" />
      <Th k="journal" label="Journal" />
      <span></span>
    </div>
  );
}

// ── Entry Form ────────────────────────────────────────────────────────────────

function EntryForm({
  initial,
  onSave,
  onCancel,
  onCollapse,
  saving,
  onExtractPdf,
  pendingPdfFile,
  setPendingPdfFile,
  groups,
}: {
  initial: Partial<LitEntry>;
  onSave: (data: Partial<LitEntry>, pdfFile?: File) => void;
  onCancel: () => void;
  onCollapse: () => void;
  saving: boolean;
  groups: LitGroup[];
  onExtractPdf?: (file: File) => Promise<Partial<LitEntry>>;
  pendingPdfFile: File | null;
  setPendingPdfFile: (f: File | null) => void;
}) {
  const [form, setForm] = useState<Partial<LitEntry>>(initial);
  const [authorInput, setAuthorInput] = useState((initial.authors || []).join("; "));
  const [tagInput, setTagInput] = useState((initial.tags || []).join(", "));
  const [extracting, setExtracting] = useState(false);
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
  const labelClass = "text-[11px] text-gray-400 uppercase tracking-wider font-medium";
  const inputClass = "w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-[var(--accent)]/50";

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header-Bar (gleich hoch wie PDF-Vorschau) — Collapse-Button + Schliessen */}
      <div className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b window-border-soft">
        <button onClick={onCollapse} title="Detail einklappen"
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="flex-1" />
        <button onClick={onCancel} title="Abbrechen"
          className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Form-Title */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/6 shrink-0">
        <p className="text-xs font-medium text-white">{initial.id ? "Bearbeiten" : "Neuer Eintrag"}</p>
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

        {/* Typ — Dropdown */}
        <div>
          <label className={labelClass}>Typ</label>
          <select value={form.entry_type ?? "paper"}
            onChange={e => set("entry_type", e.target.value)}
            style={{ colorScheme: "dark" }}
            className={`${inputClass} mt-1 cursor-pointer`}>
            {ENTRY_TYPES.map(val => (
              <option key={val} value={val} style={{ background: "#1f2937", color: "#fff" }}>
                {TYPE_ICON[val]} {TYPE_LABEL_SINGULAR[val]}
              </option>
            ))}
          </select>
        </div>

        {/* Gruppe / Ordner */}
        <div>
          <label className={labelClass}>Gruppe / Ordner</label>
          <select value={form.group_id ?? ""}
            onChange={e => set("group_id", e.target.value || null)}
            style={{ colorScheme: "dark" }}
            className={`${inputClass} mt-1 cursor-pointer`}>
            <option value="" style={{ background: "#1f2937", color: "#fff" }}>— Keine Gruppe —</option>
            {(() => {
              // Nur Gruppen des aktuellen Eintrag-Typs anzeigen
              const type = form.entry_type ?? "paper";
              const topGroups = groups.filter(g => g.entry_type === type && g.parent_id === null)
                .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
              return topGroups.map(top => {
                const subFolders = groups.filter(g => g.parent_id === top.id)
                  .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
                return (
                  <optgroup key={top.id} label={top.name} style={{ background: "#1f2937", color: "#9ca3af" }}>
                    <option value={top.id} style={{ background: "#1f2937", color: "#fff" }}>{top.name} (Gruppe)</option>
                    {subFolders.map(f => (
                      <option key={f.id} value={f.id} style={{ background: "#1f2937", color: "#fff" }}>↳ {f.name}</option>
                    ))}
                  </optgroup>
                );
              });
            })()}
          </select>
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
  onOpenFile?: (args: { url: string; filename: string; fileType: string; literatureEntryId?: string; literatureTitle?: string }) => void;
}

export default function LiteraturePanel({ onOpenFile }: LiteraturePanelProps = {}) {
  const t = useT();
  const [entries, setEntries] = useState<LitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<SidebarFilter>("all");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [openTypes, setOpenTypes] = useState<Record<EntryType, boolean>>({
    paper: true, book: true, patent: true,
    norm: true, law: true, regulatory: true, manual: true,
  });
  const toggleType = useCallback((t: EntryType) => {
    setOpenTypes(prev => ({ ...prev, [t]: !prev[t] }));
  }, []);

  // Groups state
  const [groups, setGroups] = useState<LitGroup[]>([]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [addingGroupFor, setAddingGroupFor] = useState<{ type: EntryType; parentId: string | null } | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  // PDF beim Neu-Erfassen — gehoben aus EntryForm, damit Vorschau es sofort zeigt
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);

  // Grid-Sortierung + Multi-Select
  type SortKey = "title" | "authors" | "year" | "journal" | "type";
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }
  function toggleRowSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // T-Layout: Splitter-Positionen (Prozent) — werden user-scoped persistiert
  const layoutKey = useMemo(() => {
    const email = getSession()?.email;
    return email ? `baddi:lit_layout:${encodeURIComponent(email)}` : null;
  }, []);
  const [topPercent, setTopPercent] = useState(45);
  const [leftPercent, setLeftPercent] = useState(45);
  const [titleColWidth, setTitleColWidth] = useState(320); // px, resizable
  const titleColRef = useRef(320);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const layoutLoaded = useRef(false);
  const tBodyRef = useRef<HTMLDivElement>(null);
  const tBottomRef = useRef<HTMLDivElement>(null);
  // Direkte DOM-Refs für ruckfreies Drag (kein React-Re-Render während mousemove)
  const topPanelRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  // Beim Mount: gespeicherte Layout-Werte laden
  useEffect(() => {
    if (!layoutKey || layoutLoaded.current) return;
    try {
      const raw = localStorage.getItem(layoutKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { topPercent?: number; leftPercent?: number; titleColWidth?: number; detailCollapsed?: boolean };
        if (typeof parsed.topPercent === "number" && parsed.topPercent >= 15 && parsed.topPercent <= 80) {
          setTopPercent(parsed.topPercent);
        }
        if (typeof parsed.leftPercent === "number" && parsed.leftPercent >= 15 && parsed.leftPercent <= 85) {
          setLeftPercent(parsed.leftPercent);
        }
        if (typeof parsed.titleColWidth === "number" && parsed.titleColWidth >= 150 && parsed.titleColWidth <= 800) {
          setTitleColWidth(parsed.titleColWidth);
          titleColRef.current = parsed.titleColWidth;
        }
        if (typeof parsed.detailCollapsed === "boolean") {
          setDetailCollapsed(parsed.detailCollapsed);
        }
      }
    } catch { /* ignore */ }
    layoutLoaded.current = true;
  }, [layoutKey]);

  // Bei Änderung: persistieren (nur nach initialem Laden, sonst überschreiben wir)
  useEffect(() => {
    if (!layoutKey || !layoutLoaded.current) return;
    try {
      localStorage.setItem(layoutKey, JSON.stringify({ topPercent, leftPercent, titleColWidth, detailCollapsed }));
    } catch { /* QuotaExceeded etc. */ }
  }, [topPercent, leftPercent, titleColWidth, detailCollapsed, layoutKey]);

  // Drag-Handler für Title-Spaltenbreite (direkte DOM-Manipulation während Drag)
  const startDragTitleCol = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = titleColRef.current;
    document.body.classList.add("splitter-dragging-v");
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(150, Math.min(800, startWidth + (ev.clientX - startX)));
      titleColRef.current = w;
      // Direkt alle Grid-Templates im DOM updaten — kein React-Re-Render
      document.querySelectorAll<HTMLElement>("[data-lit-grid='1']").forEach(el => {
        el.style.gridTemplateColumns = `32px 28px ${w}px 56px 180px 180px 60px`;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("splitter-dragging-v");
      setTitleColWidth(titleColRef.current);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const startDragH = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = tBodyRef.current;
    const panel = topPanelRef.current;
    if (!container || !panel) return;
    const rect = container.getBoundingClientRect();
    let finalPct = parseFloat(panel.style.height) || 45;

    document.body.classList.add("splitter-dragging-h");

    const onMove = (ev: MouseEvent) => {
      const pct = Math.max(15, Math.min(80, ((ev.clientY - rect.top) / rect.height) * 100));
      finalPct = pct;
      // Direkt im DOM setzen — kein React-Re-Render → keine Liste-Diff, keine iframe-Reflow-Kaskade
      panel.style.height = `${pct}%`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("splitter-dragging-h");
      // Erst jetzt React-State committen → genau ein Render + ein localStorage-Write
      setTopPercent(finalPct);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const startDragV = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = tBottomRef.current;
    const panel = detailPanelRef.current;
    if (!container || !panel) return;
    const rect = container.getBoundingClientRect();
    let finalPct = parseFloat(panel.style.width) || 45;

    document.body.classList.add("splitter-dragging-v");

    const onMove = (ev: MouseEvent) => {
      const pct = Math.max(15, Math.min(85, ((ev.clientX - rect.left) / rect.width) * 100));
      finalPct = pct;
      panel.style.width = `${pct}%`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("splitter-dragging-v");
      setLeftPercent(finalPct);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);
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

  async function handleCreateGroup(type: EntryType, parentId: string | null, name: string) {
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
  const countByType = (t: EntryType) => entries.filter(e => e.entry_type === t).length;
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

  // Sortierung anwenden
  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    if (sortKey === "title")     { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
    else if (sortKey === "year") { av = a.year ?? -Infinity; bv = b.year ?? -Infinity; }
    else if (sortKey === "authors") {
      av = (a.authors?.[0] ?? "").toLowerCase();
      bv = (b.authors?.[0] ?? "").toLowerCase();
    }
    else if (sortKey === "journal") {
      av = (a.journal ?? a.publisher ?? "").toLowerCase();
      bv = (b.journal ?? b.publisher ?? "").toLowerCase();
    }
    else if (sortKey === "type") { av = a.entry_type; bv = b.entry_type; }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  async function handleSave(data: Partial<LitEntry>, pdfFile?: File) {
    setSaving(true);
    try {
      const isEdit = !!data.id;
      const url = isEdit ? `${BACKEND_URL}/v1/literature/${data.id}` : `${BACKEND_URL}/v1/literature/`;
      // Felder filtern, die der Backend-Updater nicht erwartet
      // (id, entry_type, pdf_*, is_favorite, read_later, group_id, etc. sind nicht
      // in LiteratureUpdateRequest — Pydantic ignoriert sie zwar, aber wir bleiben
      // explizit damit die Wartung einfacher ist und keine Daten ungewollt überschrieben werden)
      const allowedFields: (keyof LitEntry)[] = ["entry_type", "title", "authors", "year",
        "abstract", "journal", "volume", "issue", "pages", "doi", "url", "publisher",
        "isbn", "edition", "tags", "notes", "baddi_readable"];
      const body: Record<string, unknown> = {};
      for (const k of allowedFields) {
        if (data[k] !== undefined) body[k] = data[k];
      }

      const res = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: `HTTP ${res.status}` })) as { detail?: string | object };
        const detailText = typeof errBody.detail === "string"
          ? errBody.detail
          : JSON.stringify(errBody.detail ?? errBody);
        setImportMsg({ type: "err", text: `Speichern fehlgeschlagen: ${detailText}` });
        return;
      }
      let saved: LitEntry = await res.json();

      // PDF direkt nach dem Erstellen/Aktualisieren hochladen
      if (pdfFile) {
        const fd = new FormData();
        fd.append("file", pdfFile);
        const pdfRes = await apiFetchForm(`${BACKEND_URL}/v1/literature/${saved.id}/pdf`, fd);
        if (pdfRes.ok) saved = await pdfRes.json();
      }

      // Gruppen-Zuordnung über separaten PATCH-Endpoint (akzeptiert auch null
      // zum Entfernen — Update-Endpoint mit exclude_none=True kann das nicht)
      const originalGroupId = isEdit ? entries.find(e => e.id === data.id)?.group_id ?? null : null;
      const newGroupId = data.group_id ?? null;
      if (newGroupId !== originalGroupId) {
        const grpRes = await apiFetch(`${BACKEND_URL}/v1/literature/${saved.id}/group`, {
          method: "PATCH",
          body: JSON.stringify({ group_id: newGroupId }),
        });
        if (grpRes.ok) saved = await grpRes.json();
      }

      setEntries(prev => isEdit ? prev.map(e => e.id === saved.id ? saved : e) : [saved, ...prev]);
      setSelected(saved);
      setShowForm(false);
      setShowDetail(true);
      setPendingPdfFile(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setImportMsg({ type: "err", text: msg === "ERR_NETWORK" ? t("err.network") : msg || t("err.generic") });
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

  async function handleExportPdfs(ids: string[]) {
    if (ids.length === 0) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/literature/export-pdfs`, {
        method: "POST",
        body: JSON.stringify({ entry_ids: ids }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: t("err.generic") })) as { detail?: string };
        setImportMsg({ type: "err", text: errBody.detail || t("err.generic") });
        return;
      }
      const blob = await res.blob();
      // Dateiname aus Content-Disposition extrahieren, sonst Default
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const fallback = ids.length === 1 ? "literatur.pdf" : `literatur_export_${Date.now()}.zip`;
      const filename = match ? match[1] : fallback;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setImportMsg({ type: "err", text: msg === "ERR_NETWORK" ? t("err.network") : msg || t("err.generic") });
    }
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
        onOpenFile({ url: blobUrl, filename, fileType: "pdf", literatureEntryId: entry.id, literatureTitle: entry.title });
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
    setPendingPdfFile(null);
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
    const entryType = type as EntryType;
    const topGroups = groups.filter(g => g.entry_type === entryType && g.parent_id === null)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

    const isAddingHere = addingGroupFor?.type === entryType && addingGroupFor?.parentId === null;

    return (
      <div>
        {/* Type header — Klick togglt offen/zu UND filtert; kein Chevron-Icon
             damit Paper/Bücher/Patente exakt wie Alle/Neu/Favoriten/Zu lesen ausgerichtet sind */}
        <div className="flex items-center gap-1 group/type">
          <button
            className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${typeFilter === type && !groupFilter ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}
            onClick={() => { onToggle(); setTypeFilter(type); setGroupFilter(null); }}>
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
      {/* Toolbar — nur Aktions-Buttons; Suchfeld liegt oben in der Listenspalte */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-b window-border-soft shrink-0">
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
          {/* Header-Section: Höhe so wie Suchfeld+Grid-Header rechts, damit
               die Trennlinie unten exakt unter 'Titel, Jahr, ...' liegt */}
          <div className="flex flex-col shrink-0" style={{ minHeight: 62 }}>
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
          </div>

          <div className="border-t border-white/6" />

          <div className="mt-1.5">
            {ENTRY_TYPES.map(t => (
              <SidebarGroup key={t} type={t} label={typeLabelPlural(t)} icon={typeIcon(t)}
                count={countByType(t)} open={openTypes[t]} onToggle={() => toggleType(t)} />
            ))}
          </div>

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

        {/* T-Layout: oben Liste, unten Detail | PDF */}
        <div ref={tBodyRef} className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* List (oben) — Suchfeld + Grid mit sortierbaren Spalten */}
        <div ref={topPanelRef} className="overflow-hidden flex flex-col" style={{ height: `${topPercent}%` }}>
          {/* Suchfeld — bündig zur Listenspalte (geht nicht über die Buttons rechts) */}
          <div className="shrink-0 px-3 pt-2 pb-1.5">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche in Literatur…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-[var(--accent)]/50" />
          </div>

          {/* Selektions-Aktionen — bleibt sichtbar beim Scrollen (außerhalb des Scroll-Containers) */}
          {selectedIds.size > 0 && (
            <div className="shrink-0 flex items-center gap-3 px-3 py-1.5 bg-[var(--accent-10)] border-y border-[var(--accent-30)] text-[11px] text-[var(--accent-light)]">
              <span>{selectedIds.size} ausgewählt</span>
              <button onClick={() => setSelectedIds(new Set())} className="hover:underline">Auswahl aufheben</button>
              <button onClick={() => handleExportPdfs(Array.from(selectedIds))}
                className="hover:underline flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                PDFs exportieren
              </button>
              <button onClick={() => {
                if (!confirm(`${selectedIds.size} Einträge wirklich löschen?`)) return;
                Array.from(selectedIds).forEach(id => handleDelete(id));
                setSelectedIds(new Set());
              }} className="text-red-400 hover:underline">Löschen</button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center flex-1 text-gray-600 text-xs">Lade…</div>
          ) : sorted.length === 0 ? (
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
              <div style={{ minWidth: `${32 + 28 + titleColWidth + 56 + 180 + 180 + 60 + 24}px` }}>
                {/* Grid-Header */}
                <SortableGrid sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}
                  allSelected={selectedIds.size > 0 && sorted.every(e => selectedIds.has(e.id))}
                  someSelected={selectedIds.size > 0}
                  titleColWidth={titleColWidth}
                  onStartTitleResize={startDragTitleCol}
                  onToggleAll={() => {
                    setSelectedIds(prev => {
                      const allOn = sorted.every(e => prev.has(e.id));
                      if (allOn) return new Set();
                      const next = new Set(prev);
                      sorted.forEach(e => next.add(e.id));
                      return next;
                    });
                  }} />


                {sorted.map(entry => {
                  const isActive = selected?.id === entry.id && (showDetail || showForm);
                  const isChecked = selectedIds.has(entry.id);
                  const entryGroup = entry.group_id ? groups.find(g => g.id === entry.group_id) : null;
                  const hasPdf = !!entry.pdf_s3_key;
                  const yearStr = entry.year ? String(entry.year) : "";
                  const journalStr = entry.entry_type === "patent"
                    ? (entry.journal ?? entry.isbn ?? "")
                    : (entry.journal ?? entry.publisher ?? "");
                  return (
                    <div key={entry.id}
                      data-lit-grid="1"
                      draggable
                      onDragStart={e => handleDragStart(e, entry.id)}
                      onClick={() => selectEntry(entry)}
                      title={hasPdf ? undefined : "Kein PDF hinterlegt"}
                      className={`group grid items-center gap-2 px-3 py-1.5 border-b border-white/4 cursor-pointer transition-colors border-l-2 ${isActive ? "bg-[var(--accent-10)]" : isChecked ? "bg-white/3" : "hover:bg-white/3"} ${hasPdf ? "border-l-transparent" : "border-l-amber-500/50"}`}
                      style={{ gridTemplateColumns: `32px 28px ${titleColWidth}px 56px 180px 180px 60px` }}>
                      <input type="checkbox" checked={isChecked} onClick={e => toggleRowSelect(entry.id, e)} onChange={() => {}}
                        className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer" />
                      <span className={`text-base ${hasPdf ? "" : "opacity-50"}`}>{typeIcon(entry.entry_type)}</span>
                      <div className="min-w-0">
                        <p className={`text-xs font-medium truncate ${hasPdf ? "text-white" : "text-gray-500"}`}>{entry.title}</p>
                        {entryGroup && (
                          <span className="text-[9px] text-amber-600/80 flex items-center gap-0.5"><IconFolder />{entryGroup.name}</span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 tabular-nums">{yearStr}</span>
                      <span className="text-[11px] text-gray-400 truncate" title={(entry.authors ?? []).join("; ")}>{fmtAuthors(entry.authors)}</span>
                      <span className="text-[11px] text-gray-400 truncate" title={journalStr}>{journalStr}</span>
                      <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                        {uploadingPdf === entry.id && <IconSpinner />}
                        <button onClick={() => handleToggleFlag(entry, "is_favorite")}
                          title={entry.is_favorite ? "Favorit entfernen" : "Favorit"}
                          className="p-0.5 rounded transition-colors">
                          {entry.is_favorite ? <IconStarFilled /> : <span className="text-gray-600 hover:text-yellow-400 block opacity-0 group-hover:opacity-100 transition-opacity"><IconStar /></span>}
                        </button>
                        <button onClick={() => handleToggleFlag(entry, "read_later")}
                          title={entry.read_later ? "Aus 'Zu lesen' entfernen" : "Zu lesen"}
                          className="p-0.5 rounded transition-colors">
                          {entry.read_later ? <IconBookmarkFilled /> : <span className="text-gray-600 hover:text-blue-400 block opacity-0 group-hover:opacity-100 transition-opacity"><IconBookmarkOutline /></span>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Horizontaler Splitter zwischen Liste und Detail/Vorschau */}
        <div onMouseDown={startDragH}
          className="h-[5px] shrink-0 bg-white/5 hover:bg-[var(--accent)]/40 cursor-row-resize transition-colors"
          title="Ziehen um Höhe zu ändern" />

        {/* Bottom: Detail (links) | PDF Preview (rechts) */}
        <div ref={tBottomRef} className="flex flex-1 min-h-0 overflow-hidden">
          {detailCollapsed ? (
            // Eingeklappt: schmaler Streifen mit Ausklapp-Button
            <div className="w-9 shrink-0 border-r window-border-soft flex flex-col items-center justify-start py-2 bg-black/10">
              <button onClick={() => setDetailCollapsed(false)}
                title="Detail ausklappen"
                className="p-1.5 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          ) : (
            <>
              {/* Detail / Form */}
              <div ref={detailPanelRef} className="overflow-hidden h-full" style={{ width: `${leftPercent}%` }}>
                {showForm ? (
                  <EntryForm
                    initial={editEntry}
                    onSave={handleSave}
                    onCancel={() => { setShowForm(false); setPendingPdfFile(null); if (selected) setShowDetail(true); }}
                    saving={saving}
                    onExtractPdf={!editEntry.id ? handleExtractPdf : undefined}
                    pendingPdfFile={pendingPdfFile}
                    setPendingPdfFile={setPendingPdfFile}
                    onCollapse={() => setDetailCollapsed(true)}
                    groups={groups}
                  />
                ) : (
                  <DetailPanel
                    entry={selected}
                    onClose={() => { setShowDetail(false); setSelected(null); }}
                    onCollapse={() => setDetailCollapsed(true)}
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

              {/* Vertikaler Splitter zwischen Detail und Vorschau */}
              <div onMouseDown={startDragV}
                className="w-[5px] shrink-0 bg-white/5 hover:bg-[var(--accent)]/40 cursor-col-resize transition-colors"
                title="Ziehen um Breite zu ändern" />
            </>
          )}

          {/* PDF Preview */}
          <div className="flex-1 overflow-hidden border-l window-border-soft">
            <PdfPreview
              // Im Neu-Modus (Form ohne id): kein bestehender Eintrag — Vorschau
              // zeigt entweder die hochgeladene PDF oder bleibt leer.
              entry={showForm && !editEntry.id ? null : selected}
              pendingFile={showForm && !editEntry.id ? pendingPdfFile : null}
              onOpenFullView={handlePdfOpen}
              onToggleFavorite={e => handleToggleFlag(e, "is_favorite")}
              onToggleReadLater={e => handleToggleFlag(e, "read_later")}
              onEdit={openEdit}
            />
          </div>
        </div>

        </div> {/* /T-Layout */}
      </div>
    </WindowFrame>
  );
}
