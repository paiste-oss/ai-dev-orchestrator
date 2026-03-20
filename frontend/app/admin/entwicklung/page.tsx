"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface CapabilityRequest {
  id: string;
  customer_id: string;
  buddy_id: string | null;
  original_message: string;
  detected_intent: string | null;
  status: string;
  status_label: string;
  tool_proposal: Record<string, unknown> | null;
  dialog: DialogMessage[];
  admin_notes: string | null;
  deployed_tool_key: string | null;
  created_at: string;
  updated_at: string;
}

interface DialogMessage {
  role: "uhrwerk" | "admin";
  content: string;
  created_at: string;
}

interface ListResponse {
  items: CapabilityRequest[];
  total: number;
  page: number;
  page_size: number;
  stats: Record<string, number>;
}

// ─── Status-Konfiguration ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:     { label: "Ausstehend",         color: "bg-gray-500/20 text-gray-300 border-gray-500/30",     dot: "bg-gray-400" },
  analyzing:   { label: "Wird analysiert",    color: "bg-blue-500/20 text-blue-300 border-blue-500/30",     dot: "bg-blue-400 animate-pulse" },
  needs_input: { label: "Admin-Input nötig",  color: "bg-amber-500/20 text-amber-300 border-amber-500/30",  dot: "bg-amber-400 animate-pulse" },
  building:    { label: "In Entwicklung",     color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30", dot: "bg-indigo-400 animate-pulse" },
  testing:     { label: "Wird getestet",      color: "bg-purple-500/20 text-purple-300 border-purple-500/30", dot: "bg-purple-400" },
  ready:       { label: "Bereit zum Deploy",  color: "bg-teal-500/20 text-teal-300 border-teal-500/30",     dot: "bg-teal-400" },
  deployed:    { label: "Aktiv im Uhrwerk",   color: "bg-green-500/20 text-green-300 border-green-500/30",  dot: "bg-green-400" },
  rejected:    { label: "Abgelehnt",          color: "bg-red-500/20 text-red-300 border-red-500/30",        dot: "bg-red-400" },
};

const INTENT_LABELS: Record<string, string> = {
  transport:   "ÖV / SBB",
  document:    "Dokument",
  web_search:  "Web-Suche",
  email:       "E-Mail",
  calendar:    "Kalender",
  conversation: "Gespräch",
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-700 text-gray-300 border-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Haupt-Komponente ──────────────────────────────────────────────────────────

export default function EntwicklungPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<CapabilityRequest[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (filterStatus) params.set("status", filterStatus);
      const res = await apiFetch(`${BACKEND_URL}/v1/entwicklung?${params}`);
      if (res.ok) {
        const data: ListResponse = await res.json();
        setItems(data.items);
        setTotal(data.total);
        setStats(data.stats);
      }
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const pendingCount = (stats["pending"] ?? 0) + (stats["needs_input"] ?? 0);

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/5 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
          >☰</button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              ⚗ Entwicklung
              {pendingCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {pendingCount} offen
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Selbstentwickelndes Uhrwerk — Neue Fähigkeiten für Baddis</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 transition"
          >
            ↺ Aktualisieren
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">

          {/* Stats-Karten */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => { setFilterStatus(filterStatus === key ? "" : key); setPage(1); }}
                className={`rounded-xl p-3 border text-left transition-all ${
                  filterStatus === key
                    ? "border-yellow-500/40 bg-yellow-500/10"
                    : "border-white/5 bg-gray-900/50 hover:bg-gray-900"
                }`}
              >
                <div className={`text-xl font-bold ${(stats[key] ?? 0) > 0 ? "text-white" : "text-gray-600"}`}>
                  {stats[key] ?? 0}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{cfg.label}</div>
              </button>
            ))}
          </div>

          {/* Filter-Info */}
          {filterStatus && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>Filter:</span>
              <StatusBadge status={filterStatus} />
              <button onClick={() => { setFilterStatus(""); setPage(1); }} className="text-xs text-gray-600 hover:text-white ml-1">
                ✕ Entfernen
              </button>
            </div>
          )}

          {/* Tabelle */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <span className="animate-spin mr-2">⟳</span> Laden...
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <div className="text-4xl mb-3">⚗</div>
              <p className="font-medium">Noch keine Entwicklungs-Anfragen</p>
              <p className="text-sm mt-1">Sobald ein Kunde etwas fragt, das Baddi noch nicht kann, erscheint es hier.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900/80 border-b border-white/5">
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Anfrage</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium hidden sm:table-cell">Intent</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium hidden md:table-cell">Datum</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/admin/entwicklung/${item.id}`)}
                      className="hover:bg-gray-900/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="text-gray-200 line-clamp-2 max-w-xs">
                          {item.original_message}
                        </p>
                        {item.tool_proposal && (
                          <p className="text-xs text-indigo-400 mt-0.5">
                            → {(item.tool_proposal as Record<string, string>).display_name ?? (item.tool_proposal as Record<string, string>).tool_name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-gray-500">
                          {item.detected_intent ? (INTENT_LABELS[item.detected_intent] ?? item.detected_intent) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 hidden md:table-cell whitespace-nowrap">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-gray-600 text-xs">▶</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{total} Anfragen total</span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  ← Zurück
                </button>
                <button
                  disabled={page * 20 >= total}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  Weiter →
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
