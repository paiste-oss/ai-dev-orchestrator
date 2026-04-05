
"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminSidebar from "@/components/AdminSidebar";

// ─── Alle Seiten des Projekts ──────────────────────────────────────────────────

interface PageEntry {
  path: string;
  label: string;
  icon: string;
  role: "public" | "admin" | "kunde" | "dev";
  description: string;
  group: string;
}

const ALL_PAGES: PageEntry[] = [
  // ── Public ──────────────────────────────────────────────────────────────────
  {
    path: "/",
    label: "Landing Page",
    icon: "🌐",
    role: "public",
    description: "Öffentliche Startseite mit Login & Registrieren-Button",
    group: "Public",
  },
  {
    path: "/login",
    label: "Login",
    icon: "🔐",
    role: "public",
    description: "Anmeldeformular für alle Nutzer (E-Mail + Passwort)",
    group: "Public",
  },
  {
    path: "/admin/testpages/register",
    label: "Registriere mich",
    icon: "📝",
    role: "public",
    description: "Registrierungsformular mit Name, Geburtsdatum, E-Mail, Passwort, Sprache & Einwilligungen (Vorschau ohne Submit)",
    group: "Public",
  },
  {
    path: "/register/plan",
    label: "Plan-Auswahl",
    icon: "💳",
    role: "public",
    description: "Abo-Auswahl nach Registrierung: Free, Basis, Komfort, Premium — Free direkt zu /chat, sonst Stripe",
    group: "Public",
  },

  // ── Kunde ────────────────────────────────────────────────────────────────────
  {
    path: "/chat",
    label: "Chat (Weiterleitung)",
    icon: "💬",
    role: "kunde",
    description: "Leitet automatisch zum persönlichen Baddi des Kunden weiter",
    group: "Kunde",
  },

];

// ─── Viewport-Presets für die iFrame-Vorschau ──────────────────────────────────
const VIEWPORTS = [
  { label: "Desktop",  icon: "🖥️",  width: "100%",   height: "100%" },
  { label: "Tablet",   icon: "📱",  width: "768px",  height: "100%" },
  { label: "Mobile",   icon: "📲",  width: "390px",  height: "100%" },
] as const;
type ViewportKey = (typeof VIEWPORTS)[number]["label"];

// ─── Rollen-Styles ─────────────────────────────────────────────────────────────
const ROLE_STYLE: Record<PageEntry["role"], { badge: string; dot: string; border: string }> = {
  public: { badge: "bg-gray-700 text-gray-300 border-gray-600",            dot: "bg-gray-400",   border: "border-gray-600"    },
  admin:  { badge: "bg-red-500/20 text-red-300 border-red-500/30",         dot: "bg-red-400",    border: "border-red-500/40"  },
  kunde:  { badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",      dot: "bg-blue-400",   border: "border-blue-500/40" },
  dev:    { badge: "bg-purple-500/20 text-purple-300 border-purple-500/30",dot: "bg-purple-400", border: "border-purple-500/40"},
};

const ROLE_LABEL: Record<PageEntry["role"], string> = {
  public: "Public", admin: "Admin", kunde: "Kunde", dev: "Dev",
};

const GROUP_ORDER = ["Public", "Kunde", "Admin", "Dev"];

// ─── Hauptkomponente ───────────────────────────────────────────────────────────
export default function TestPagesPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter
  const [filter, setFilter] = useState<PageEntry["role"] | "all">("all");
  const [search, setSearch] = useState("");

  // Vorschau
  const [preview, setPreview]             = useState<PageEntry | null>(null);
  const [viewport, setViewport]           = useState<ViewportKey>("Desktop");
  const [iframeKey, setIframeKey]         = useState(0);
  const [iframeLoading, setIframeLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const u = getSession();
    if (!u || u.role !== "admin") router.replace("/login");
  }, []);

  // ── Filterlogik ──────────────────────────────────────────────────────────────
  const filtered = ALL_PAGES.filter((p) => {
    const matchRole = filter === "all" || p.role === filter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.label.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.group.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const grouped: Record<string, PageEntry[]> = {};
  GROUP_ORDER.forEach((g) => { grouped[g] = []; });
  filtered.forEach((p) => {
    if (!grouped[p.group]) grouped[p.group] = [];
    grouped[p.group].push(p);
  });

  const totalCount    = ALL_PAGES.length;
  const filteredCount = filtered.length;

  // ── Vorschau öffnen ──────────────────────────────────────────────────────────
  const openPreview = (page: PageEntry) => {
    setPreview(page);
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
  };

  const closePreview = () => setPreview(null);

  const reloadIframe = () => {
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
  };

  const currentVP = VIEWPORTS.find((v) => v.label === viewport) ?? VIEWPORTS[0];

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex overflow-hidden" style={{ height: "100dvh" }}>
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 overflow-hidden min-w-0">

        {/* ════ LINKE SPALTE — Seitenliste ════ */}
        <div className={`
          flex flex-col overflow-hidden transition-all duration-300
          ${preview ? "w-0 md:w-80 lg:w-96 shrink-0" : "flex-1"}
        `}>
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

            <div className="flex items-center gap-3 md:hidden">
              <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl">☰</button>
              <h1 className="text-lg font-bold text-yellow-400">Testseiten</h1>
            </div>

            <div>
              <h2 className="text-2xl font-bold hidden md:block">🧪 Testseiten</h2>
              <p className="text-gray-400 text-sm mt-1">
                {totalCount} Seiten — klicke eine Karte für die Vorschau, oder öffne sie im Tab.
              </p>
            </div>

            {/* ── Filter-Leiste ── */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Seite suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-9 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {(["all", "public", "kunde", "admin", "dev"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setFilter(r)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filter === r
                        ? "bg-yellow-400 text-black border-yellow-400"
                        : "bg-gray-700 text-gray-400 border-gray-600 hover:text-white hover:border-gray-400"
                    }`}
                  >
                    {r === "all"
                      ? `Alle (${totalCount})`
                      : `${ROLE_LABEL[r as PageEntry["role"]]} (${ALL_PAGES.filter((p) => p.role === r).length})`}
                  </button>
                ))}
              </div>

              {(search || filter !== "all") && (
                <p className="text-xs text-gray-500">{filteredCount} von {totalCount} Seiten</p>
              )}
            </div>

            {/* ── Gruppen ── */}
            {GROUP_ORDER.map((groupName) => {
              const pages = grouped[groupName];
              if (!pages || pages.length === 0) return null;

              return (
                <div key={groupName} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{groupName}</h3>
                    <div className="flex-1 h-px bg-gray-800" />
                    <span className="text-xs text-gray-600">{pages.length} Seite{pages.length !== 1 ? "n" : ""}</span>
                  </div>

                  <div className={`grid gap-2 ${preview ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`}>
                    {pages.map((page) => {
                      const style  = ROLE_STYLE[page.role];
                      const active = preview?.path === page.path;

                      return (
                        <div
                          key={page.path}
                          onClick={() => openPreview(page)}
                          className={`
                            group cursor-pointer rounded-xl p-3 text-left transition-all duration-150 border
                            ${active
                              ? "bg-yellow-400/10 border-yellow-400/60"
                              : "bg-gray-800 border-gray-700 hover:border-yellow-400/40 hover:bg-gray-800/80"
                            }
                          `}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base shrink-0">{page.icon}</span>
                              <span className={`text-xs font-mono truncate transition-colors ${active ? "text-yellow-400" : "text-gray-500 group-hover:text-yellow-400"}`}>
                                {page.path}
                              </span>
                            </div>
                            <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border ${style.badge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                              {ROLE_LABEL[page.role]}
                            </span>
                          </div>

                          <p className="text-sm font-semibold text-white leading-tight">{page.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{page.description}</p>

                          <div className="flex gap-2 mt-2.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => openPreview(page)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                active
                                  ? "bg-yellow-400 text-black"
                                  : "bg-gray-700 hover:bg-yellow-400/20 hover:text-yellow-300 text-gray-300"
                              }`}
                            >
                              👁 Vorschau
                            </button>
                            <button
                              onClick={() => window.open(page.path, "_blank")}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                            >
                              ↗ Tab
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="h-4" />
          </div>
        </div>

        {/* ════ RECHTE SPALTE — iFrame-Vorschau ════ */}
        {preview && (
          <div className="flex-1 flex flex-col overflow-hidden border-l border-gray-800 bg-gray-900 min-w-0">

            <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm flex-wrap">
              <div className="flex items-center gap-2 mr-auto min-w-0">
                <span className="text-lg shrink-0">{preview.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight truncate">{preview.label}</p>
                  <p className="text-xs font-mono text-gray-500 truncate">{preview.path}</p>
                </div>
                <span className={`shrink-0 hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ml-1 ${ROLE_STYLE[preview.role].badge}`}>
                  {ROLE_LABEL[preview.role]}
                </span>
              </div>

              <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 shrink-0">
                {VIEWPORTS.map((vp) => (
                  <button
                    key={vp.label}
                    onClick={() => setViewport(vp.label)}
                    title={vp.label}
                    className={`px-2 py-1 rounded-md text-sm transition-colors ${viewport === vp.label ? "bg-yellow-400 text-black" : "text-gray-400 hover:text-white"}`}
                  >
                    {vp.icon}
                  </button>
                ))}
              </div>

              <button onClick={reloadIframe} title="Seite neu laden" className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-sm shrink-0">🔄</button>
              <button onClick={() => window.open(preview.path, "_blank")} title="In neuem Tab öffnen" className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-sm shrink-0">↗</button>
              <button onClick={closePreview} title="Vorschau schließen" className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors text-sm shrink-0">✕</button>
            </div>

            <div className="flex-1 flex items-start justify-center overflow-auto bg-gray-950 relative">
              {iframeLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10 pointer-events-none">
                  <div className="flex flex-col items-center gap-3 text-gray-500">
                    <span className="text-3xl animate-spin">⏳</span>
                    <p className="text-sm">Seite wird geladen…</p>
                    <p className="text-xs font-mono text-gray-600">{preview.path}</p>
                  </div>
                </div>
              )}

              <div className="h-full transition-all duration-300 relative" style={{ width: currentVP.width, maxWidth: "100%" }}>
                {viewport !== "Desktop" && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-gray-600 whitespace-nowrap">
                    {currentVP.icon} {currentVP.label} — {currentVP.width}
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  key={iframeKey}
                  src={preview.path}
                  className="w-full h-full border-0"
                  style={{ opacity: iframeLoading ? 0 : 1, transition: "opacity 0.2s ease", background: "#030712" }}
                  onLoad={() => setIframeLoading(false)}
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                  title={`Vorschau: ${preview.label}`}
                />
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-t border-gray-800 bg-gray-900 text-xs text-gray-600">
              <span>📋 {preview.description}</span>
              <span className="ml-auto shrink-0">{filtered.findIndex((p) => p.path === preview.path) + 1} / {filtered.length}</span>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => { const idx = filtered.findIndex((p) => p.path === preview.path); if (idx > 0) openPreview(filtered[idx - 1]); }}
                  disabled={filtered.findIndex((p) => p.path === preview.path) === 0}
                  className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-400 hover:text-white transition-colors"
                >←</button>
                <button
                  onClick={() => { const idx = filtered.findIndex((p) => p.path === preview.path); if (idx < filtered.length - 1) openPreview(filtered[idx + 1]); }}
                  disabled={filtered.findIndex((p) => p.path === preview.path) === filtered.length - 1}
                  className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-400 hover:text-white transition-colors"
                >→</button>
              </div>
            </div>
          </div>
        )}

        {!preview && filtered.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-gray-600 flex-col gap-2">
            <span className="text-4xl">🔍</span>
            <p className="text-sm">Keine Seiten gefunden.</p>
            <button onClick={() => { setSearch(""); setFilter("all"); }} className="text-xs text-yellow-400 hover:underline mt-1">Filter zurücksetzen</button>
          </div>
        )}
      </div>
    </div>
  );
}
