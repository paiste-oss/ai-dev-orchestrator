"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PdfMatchDetail {
  filename: string;
  status: "matched" | "already_has_pdf" | "unmatched";
  match_method: "doi" | "filename" | "title_text" | null;
  matched_title: string | null;
  entry_id: string | null;
}

interface BulkPdfResult {
  matched: number;
  already_had_pdf: number;
  unmatched: number;
  details: PdfMatchDetail[];
}

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
  import_source: string;
  created_at: string;
}

type EntryTypeFilter = "all" | "paper" | "book" | "patent";

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
  deleting,
}: {
  entry: LitEntry | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (entry: LitEntry) => void;
  onPdfUpload: (entry: LitEntry, file: File) => void;
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
              <a href={`${BACKEND_URL}/v1/literature/${entry.id}/pdf`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[var(--accent-light)] hover:underline">
                <span>📄</span> PDF öffnen ({Math.round(entry.pdf_size_bytes / 1024)} KB)
              </a>
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
}: {
  initial: Partial<LitEntry>;
  onSave: (data: Partial<LitEntry>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<LitEntry>>(initial);
  const [authorInput, setAuthorInput] = useState((initial.authors || []).join("; "));
  const [tagInput, setTagInput] = useState((initial.tags || []).join(", "));

  function set(field: keyof LitEntry, value: unknown) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function handleSave() {
    const authors = authorInput.split(";").map(a => a.trim()).filter(Boolean);
    const tags = tagInput.split(",").map(t => t.trim()).filter(Boolean);
    onSave({ ...form, authors: authors.length ? authors : null, tags: tags.length ? tags : null });
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

      </div>

      {/* Footer */}
      <div className="flex gap-2 px-3 py-2 border-t border-white/6 shrink-0">
        <button onClick={handleSave} disabled={saving || !form.title?.trim()}
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

export default function LiteraturePanel() {
  const [entries, setEntries] = useState<LitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntryTypeFilter>("all");
  const [paperOpen, setPaperOpen] = useState(true);
  const [bookOpen, setBookOpen] = useState(true);
  const [patentOpen, setPatentOpen] = useState(true);
  const [selected, setSelected] = useState<LitEntry | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<Partial<LitEntry>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState<string | null>(null);
  const [importingZip, setImportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ phase: "uploading" | "processing"; sent: number; total: number } | null>(null);
  const [zipResult, setZipResult] = useState<BulkPdfResult | null>(null);
  const [showZipDetails, setShowZipDetails] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/literature/mine`);
      if (res.ok) setEntries(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const papers = entries.filter(e => e.entry_type === "paper");
  const books = entries.filter(e => e.entry_type === "book");
  const patents = entries.filter(e => e.entry_type === "patent");
  const entriesWithoutPdf = entries.filter(e => !e.pdf_s3_key).length;

  const filtered = entries.filter(e => {
    if (typeFilter !== "all" && e.entry_type !== typeFilter) return false;
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

  async function handleSave(data: Partial<LitEntry>) {
    setSaving(true);
    try {
      const isEdit = !!data.id;
      const url = isEdit ? `${BACKEND_URL}/v1/literature/${data.id}` : `${BACKEND_URL}/v1/literature/`;
      const res = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const saved: LitEntry = await res.json();
        setEntries(prev => isEdit ? prev.map(e => e.id === saved.id ? saved : e) : [saved, ...prev]);
        setSelected(saved);
        setShowForm(false);
        setShowDetail(true);
      }
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

  async function handleImport(file: File) {
    setImporting(true); setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetchForm(`${BACKEND_URL}/v1/literature/import`, fd);
      const data = await res.json();
      if (res.ok) {
        setImportMsg({ type: "ok", text: `${data.imported} Einträge importiert${data.skipped ? `, ${data.skipped} übersprungen` : ""}.` });
        await loadAll();
      } else {
        setImportMsg({ type: "err", text: data.detail || "Import fehlgeschlagen" });
      }
    } catch (err) {
      setImportMsg({ type: "err", text: err instanceof Error ? err.message : "Verbindungsfehler" });
    } finally { setImporting(false); }
  }

  const CHUNK_SIZE = 90 * 1024 * 1024; // 90 MB — knapp unter Cloudflare-Limit (100 MB)

  async function handleZipImport(file: File) {
    setImportingZip(true); setZipResult(null); setImportMsg(null);

    try {
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const uploadId = crypto.randomUUID().replace(/-/g, "");

      setZipProgress({ phase: "uploading", sent: 0, total: totalChunks });

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));

        const fd = new FormData();
        fd.append("upload_id", uploadId);
        fd.append("chunk_index", String(i));
        fd.append("total_chunks", String(totalChunks));
        fd.append("chunk", chunk, "chunk.bin");

        const res = await apiFetchForm(`${BACKEND_URL}/v1/literature/import-pdfs/upload-chunk`, fd);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Upload fehlgeschlagen" })) as { detail?: string };
          throw new Error(err.detail || `Chunk ${i + 1}/${totalChunks} fehlgeschlagen`);
        }

        const chunkResult = await res.json() as { status: string };
        setZipProgress({ phase: "uploading", sent: i + 1, total: totalChunks });

        if (chunkResult.status === "processing") break;
      }

      // Verarbeitung läuft im Hintergrund — Status pollen
      setZipProgress({ phase: "processing", sent: totalChunks, total: totalChunks });

      const deadline = Date.now() + 45 * 60 * 1000; // 45 Min Timeout
      while (Date.now() < deadline) {
        await new Promise<void>(resolve => setTimeout(resolve, 5000));

        const statusRes = await apiFetch(`${BACKEND_URL}/v1/literature/import-pdfs/status/${uploadId}`);
        if (!statusRes.ok) continue; // noch nicht bereit

        const statusData = await statusRes.json() as { status: string; result?: BulkPdfResult; error?: string };

        if (statusData.status === "done" && statusData.result) {
          setZipResult(statusData.result);
          setShowZipDetails(true);
          await loadAll();
          return;
        }
        if (statusData.status === "error") {
          throw new Error(statusData.error || "Verarbeitung fehlgeschlagen");
        }
      }

      throw new Error("Timeout — Verarbeitung läuft noch. Einträge werden geladen, sobald fertig.");

    } catch (err) {
      setImportMsg({ type: "err", text: err instanceof Error ? err.message : "Verbindungsfehler" });
    } finally {
      setImportingZip(false);
      setZipProgress(null);
    }
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

  // Sidebar groups
  function SidebarGroup({ type, label, icon, count, open, onToggle }: {
    type: EntryTypeFilter; label: string; icon: string;
    count: number; open: boolean; onToggle: () => void;
  }) {
    return (
      <div>
        <button onClick={onToggle}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${typeFilter === type ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}
          onContextMenu={e => { e.preventDefault(); setTypeFilter(type); }}>
          <IconChevron open={open} />
          <span>{icon}</span>
          <span className="flex-1 text-left">{label}</span>
          <span className="text-[10px] text-gray-600">{count}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/6 shrink-0">
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
            <button onClick={() => setShowZipDetails(v => !v)}
              className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
              {showZipDetails ? "Ausblenden" : "Details"}
            </button>
            <button onClick={() => setZipResult(null)} className="text-gray-600 hover:text-gray-400">×</button>
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
          {/* All */}
          <button onClick={() => setTypeFilter("all")}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors mb-1 ${typeFilter === "all" ? "bg-[var(--accent-20)] text-[var(--accent-light)]" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
            <span>📚</span>
            <span className="flex-1 text-left">Alle</span>
            <span className="text-[10px] text-gray-600">{entries.length}</span>
          </button>

          <div className="border-t border-white/6 my-1" />

          <SidebarGroup type="paper" label="Paper" icon="📄" count={papers.length} open={paperOpen} onToggle={() => setPaperOpen(v => !v)} />
          <SidebarGroup type="book" label="Bücher" icon="📖" count={books.length} open={bookOpen} onToggle={() => setBookOpen(v => !v)} />
          <SidebarGroup type="patent" label="Patente" icon="🏛" count={patents.length} open={patentOpen} onToggle={() => setPatentOpen(v => !v)} />
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
                return (
                  <div key={entry.id} onClick={() => selectEntry(entry)}
                    className={`flex items-start gap-2 px-3 py-2.5 border-b border-white/4 cursor-pointer transition-colors ${isActive ? "bg-[var(--accent-10)]" : "hover:bg-white/3"}`}>
                    <span className="text-base shrink-0 mt-0.5">{entry.entry_type === "paper" ? "📄" : entry.entry_type === "patent" ? "🏛" : "📖"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-medium truncate">{entry.title}</p>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">
                        {fmtAuthors(entry.authors)}{entry.year ? ` · ${entry.year}` : ""}
                        {entry.entry_type === "patent"
                          ? (entry.isbn ? ` · ${entry.isbn}` : "") + (entry.journal ? ` · ${entry.journal}` : "")
                          : (entry.journal ? ` · ${entry.journal}` : "") + (entry.publisher ? ` · ${entry.publisher}` : "")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.pdf_s3_key && <span className="text-[9px] text-gray-600" title="PDF angehängt">PDF</span>}
                      {uploadingPdf === entry.id && <IconSpinner />}
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
                />
              ) : (
                <DetailPanel
                  entry={selected}
                  onClose={() => { setShowDetail(false); setSelected(null); }}
                  onDelete={handleDelete}
                  onEdit={openEdit}
                  onPdfUpload={handlePdfUpload}
                  deleting={deleting}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
