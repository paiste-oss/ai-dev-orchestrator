"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import { BACKEND_URL, API_ROUTES } from "@/lib/config";
import FileDropZone, { AttachedFile } from "@/components/FileDropZone";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  email: string;
  segment: string;
}

interface Document {
  id: string;
  customer_id: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  page_count: number;
  char_count: number;
  stored_in_postgres: boolean;
  stored_in_qdrant: boolean;
  qdrant_collection: string | null;
  created_at: string;
  doc_metadata: Record<string, unknown> | null;
}

const NAV = [
  { label: "Dashboard",        href: "/admin",            icon: "🏠" },
  { label: "Dev Orchestrator", href: "/admin/devtool",    icon: "🛠️" },
  { label: "Kunden",           href: "/admin/customers",  icon: "👥" },
  { label: "AI Buddies",       href: "/admin/buddies",    icon: "🤖" },
  { label: "Dokumente",        href: "/admin/documents",  icon: "📁" },
  { label: "Workflows",        href: "/admin/workflows",  icon: "⚙️" },
  { label: "Analytik",         href: "/admin/analytics",  icon: "📊" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ICONS: Record<string, string> = {
  pdf: "📄", docx: "📝", doc: "📝", xlsx: "📊", xls: "📊",
  pptx: "📑", ppt: "📑", csv: "📋", txt: "📃", md: "📃",
  json: "🔧", xml: "🔧", html: "🌐",
};

// ─── Seite ────────────────────────────────────────────────────────────────────

export default function AdminDocuments() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<ReturnType<typeof getSession>>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // Upload-Optionen
  const [storePostgres, setStorePostgres] = useState(true);
  const [storeQdrant, setStoreQdrant] = useState(true);
  const [qdrantCollection, setQdrantCollection] = useState("customer_documents");

  // UI-State
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ name: string; ok: boolean; msg: string }[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ score: number; text: string; filename: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const u = getSession();
    setUser(u);
    setMounted(true);
    if (!u || u.role !== "admin") router.replace("/login");
  }, []);

  // Kunden laden
  useEffect(() => {
    if (!mounted) return;
    fetch(`${BACKEND_URL}/v1/customers`)
      .then((r) => r.json())
      .then((data: Customer[]) => {
        setCustomers(data);
        if (data.length > 0) setSelectedCustomer(data[0].id);
      })
      .catch(() => {});
  }, [mounted]);

  // Dokumente laden wenn Kunde wechselt
  useEffect(() => {
    if (!selectedCustomer) return;
    loadDocuments(selectedCustomer);
  }, [selectedCustomer]);

  const loadDocuments = async (cid: string) => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/documents/customer/${cid}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch {
    } finally {
      setLoadingDocs(false);
    }
  };

  // ─── Upload ───────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedCustomer || attachedFiles.length === 0) return;
    setUploading(true);
    setUploadResults([]);

    const results = await Promise.all(
      attachedFiles.map(async (af) => {
        const fd = new FormData();
        fd.append("file", af.file);
        fd.append("customer_id", selectedCustomer);
        fd.append("store_postgres", String(storePostgres));
        fd.append("store_qdrant", String(storeQdrant));
        fd.append("qdrant_collection", qdrantCollection);

        try {
          const res = await fetch(`${BACKEND_URL}/v1/documents/upload`, {
            method: "POST",
            body: fd,
          });
          const data = await res.json();
          if (res.ok) {
            return {
              name: af.file.name,
              ok: true,
              msg: `✅ Gespeichert (${data.char_count?.toLocaleString()} Zeichen${data.stored_in_qdrant ? " · Qdrant ✓" : ""})`,
            };
          } else {
            return { name: af.file.name, ok: false, msg: `❌ ${data.detail}` };
          }
        } catch (e) {
          return { name: af.file.name, ok: false, msg: `❌ Netzwerkfehler` };
        }
      })
    );

    setUploadResults(results);
    setAttachedFiles([]);
    setUploading(false);
    loadDocuments(selectedCustomer);
  };

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async (docId: string) => {
    if (!confirm("Dokument wirklich löschen? Qdrant-Vektoren werden ebenfalls entfernt.")) return;
    setDeletingId(docId);
    try {
      await fetch(`${BACKEND_URL}/v1/documents/file/${docId}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Semantic Search ──────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!selectedCustomer || !searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/documents/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: selectedCustomer,
          query: searchQuery,
          top_k: 5,
        }),
      });
      if (res.ok) {
        setSearchResults(await res.json());
      }
    } catch {
    } finally {
      setSearching(false);
    }
  };

  if (!mounted || !user) return null;

  const selectedCustomerName = customers.find((c) => c.id === selectedCustomer)?.name ?? "";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-4 space-y-1">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-yellow-400">AI Buddy</h1>
          <p className="text-xs text-gray-500">Admin</p>
        </div>
        {NAV.map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className={`flex items-center gap-3 text-sm px-3 py-2 rounded transition-colors text-left ${
              item.href === "/admin/documents"
                ? "bg-yellow-400/10 text-yellow-400"
                : "text-gray-300 hover:text-white hover:bg-gray-800"
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => { clearSession(); router.push("/"); }}
          className="flex items-center gap-3 text-sm text-gray-500 hover:text-red-400 px-3 py-2 rounded transition-colors"
        >
          <span>🚪</span><span>Abmelden</span>
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <h2 className="text-2xl font-bold">📁 Dokument-Verwaltung</h2>
            <p className="text-gray-400 text-sm mt-1">
              Dateien hochladen, Kunden zuweisen, semantisch suchen
            </p>
          </div>

          {/* Kunden-Auswahl */}
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-200">Kunde auswählen</h3>
            {customers.length === 0 ? (
              <p className="text-gray-500 text-sm">Keine Kunden gefunden.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCustomer(c.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                      selectedCustomer === c.id
                        ? "bg-yellow-400/20 border-yellow-400 text-yellow-300"
                        : "bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    {c.name}
                    <span className="ml-2 text-xs text-gray-500">{c.segment}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <>
              {/* Upload-Bereich */}
              <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-5">
                <h3 className="font-semibold text-gray-200">
                  📤 Dateien hochladen für <span className="text-yellow-400">{selectedCustomerName}</span>
                </h3>

                <FileDropZone
                  files={attachedFiles}
                  onFilesChange={setAttachedFiles}
                />

                {/* Speicher-Optionen */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div
                      onClick={() => setStorePostgres((v) => !v)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        storePostgres ? "bg-blue-500" : "bg-gray-600"
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        storePostgres ? "translate-x-7" : "translate-x-1"
                      }`} />
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">PostgreSQL</p>
                      <p className="text-xs text-gray-400">Text + Metadaten</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div
                      onClick={() => setStoreQdrant((v) => !v)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        storeQdrant ? "bg-purple-500" : "bg-gray-600"
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        storeQdrant ? "translate-x-7" : "translate-x-1"
                      }`} />
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">Qdrant</p>
                      <p className="text-xs text-gray-400">Vektorsuche</p>
                    </div>
                  </label>

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Qdrant Collection</label>
                    <input
                      value={qdrantCollection}
                      onChange={(e) => setQdrantCollection(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-purple-400"
                    />
                  </div>
                </div>

                {/* Info-Box Speicher-Strategie */}
                <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4 text-xs text-gray-400 space-y-1">
                  <p>
                    <span className="text-blue-400 font-medium">📦 PostgreSQL:</span>{" "}
                    Volltext durchsuchbar, direkt im Agent abrufbar, strukturierte Metadaten
                  </p>
                  <p>
                    <span className="text-purple-400 font-medium">🔮 Qdrant:</span>{" "}
                    Semantische Ähnlichkeitssuche, kontextbasiertes Retrieval für den AI-Agenten
                  </p>
                  <p className="text-gray-500">
                    💡 Empfehlung: Beide aktivieren für maximale KI-Performance
                  </p>
                </div>

                <button
                  onClick={handleUpload}
                  disabled={uploading || attachedFiles.length === 0}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-colors bg-yellow-500 hover:bg-yellow-400 text-black disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Wird hochgeladen...
                    </span>
                  ) : (
                    `${attachedFiles.length} Datei${attachedFiles.length !== 1 ? "en" : ""} hochladen`
                  )}
                </button>

                {/* Upload-Ergebnisse */}
                {uploadResults.length > 0 && (
                  <div className="space-y-2">
                    {uploadResults.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${
                          r.ok
                            ? "bg-green-950/40 border-green-800 text-green-300"
                            : "bg-red-950/40 border-red-800 text-red-300"
                        }`}
                      >
                        <span className="font-medium shrink-0">{r.name}</span>
                        <span className="text-xs">{r.msg}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Semantische Suche */}
              <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
                <h3 className="font-semibold text-gray-200">🔍 Semantische Suche</h3>
                <div className="flex gap-3">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="In Kundendokumenten suchen..."
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-purple-400"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-xl font-medium transition-colors disabled:opacity-40"
                  >
                    {searching ? "..." : "Suchen"}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-3">
                    {searchResults.map((r, i) => (
                      <div key={i} className="bg-gray-900 border border-purple-900/50 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-purple-400 font-medium">{r.filename}</span>
                          <span className="text-xs text-gray-500">
                            Score: {(r.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed line-clamp-4">{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && searchQuery && !searching && (
                  <p className="text-gray-500 text-sm text-center py-4">
                    Keine Ergebnisse — Qdrant muss laufen und Dokumente müssen vektorisiert sein.
                  </p>
                )}
              </div>

              {/* Dokument-Liste */}
              <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-200">
                    Dokumente von{" "}
                    <span className="text-yellow-400">{selectedCustomerName}</span>
                    {!loadingDocs && (
                      <span className="ml-2 text-sm text-gray-500">({documents.length})</span>
                    )}
                  </h3>
                  <button
                    onClick={() => loadDocuments(selectedCustomer)}
                    className="text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    🔄 Aktualisieren
                  </button>
                </div>

                {loadingDocs ? (
                  <div className="text-center py-8 text-gray-500">Lade...</div>
                ) : documents.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">
                    <div className="text-4xl mb-3">📂</div>
                    <p>Noch keine Dokumente für diesen Kunden</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 hover:border-gray-600 transition-colors group"
                      >
                        <span className="text-2xl shrink-0">
                          {FILE_ICONS[doc.file_type] ?? "📎"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {doc.original_filename}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-500">
                              {doc.file_type.toUpperCase()} · {formatBytes(doc.file_size_bytes)} ·{" "}
                              {doc.page_count} Seite(n) · {doc.char_count?.toLocaleString()} Zeichen
                            </span>
                            <span className="text-xs text-gray-600">
                              {new Date(doc.created_at).toLocaleDateString("de-DE")}
                            </span>
                          </div>
                        </div>
                        {/* Storage-Badges */}
                        <div className="flex gap-1.5 shrink-0">
                          {doc.stored_in_postgres && (
                            <span className="text-xs bg-blue-900/60 text-blue-300 border border-blue-800 rounded-md px-2 py-0.5">
                              PG
                            </span>
                          )}
                          {doc.stored_in_qdrant && (
                            <span className="text-xs bg-purple-900/60 text-purple-300 border border-purple-800 rounded-md px-2 py-0.5">
                              QD
                            </span>
                          )}
                        </div>
                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deletingId === doc.id}
                          className="text-gray-600 hover:text-red-400 transition-colors text-lg opacity-0 group-hover:opacity-100 shrink-0"
                          title="Löschen"
                        >
                          {deletingId === doc.id ? "..." : "×"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
