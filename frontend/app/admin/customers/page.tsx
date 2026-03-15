"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { apiFetch } from "@/lib/auth";
import { API_ROUTES } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  email: string;
  segment: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface CustomerListResponse {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

const SEGMENT_LABELS: Record<string, { label: string; color: string }> = {
  personal:  { label: "Privat",     color: "bg-blue-500/20 text-blue-300 border-blue-500/30"   },
  elderly:   { label: "Senioren",   color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  corporate: { label: "Firma",      color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
};

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin:    { label: "Admin",   color: "bg-red-500/20 text-red-300 border-red-500/30"     },
  customer: { label: "Kunde",   color: "bg-gray-500/20 text-gray-300 border-gray-500/30"  },
};

function Badge({ value, map }: { value: string; map: Record<string, { label: string; color: string }> }) {
  const entry = map[value] ?? { label: value, color: "bg-gray-700 text-gray-300 border-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${entry.color}`}>
      {entry.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function CustomersPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter-State
  const [search, setSearch]       = useState("");
  const [segment, setSegment]     = useState("");
  const [role, setRole]           = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");

  // Daten-State
  const [data, setData]           = useState<CustomerListResponse | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 20;

  // Debounce-Timer für Suchfeld
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Auth-Check
  useEffect(() => {
    const u = getSession();
    setMounted(true);
    if (!u || u.role !== "admin") router.replace("/login");
  }, []);

  // Daten laden
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (segment)         params.set("segment", segment);
      if (role)            params.set("role", role);
      if (activeFilter)    params.set("is_active", activeFilter);
      params.set("page", String(page));
      params.set("page_size", String(PAGE_SIZE));

      const res = await apiFetch(`${API_ROUTES.customers}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: CustomerListResponse = await res.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, segment, role, activeFilter, page]);

  // Filter-Änderung → Seite 1 zurücksetzen
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, segment, role, activeFilter]);

  useEffect(() => {
    if (mounted) fetchCustomers();
  }, [fetchCustomers, mounted]);

  // Aktiv-Toggle
  const toggleActive = async (customer: Customer) => {
    try {
      await apiFetch(`${API_ROUTES.customers}/${customer.id}/toggle-active`, { method: "PATCH" });
      fetchCustomers();
    } catch {
      alert("Fehler beim Aktualisieren des Status");
    }
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto min-w-0">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl md:hidden">
            ☰
          </button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold">👥 Kunden</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {data ? `${data.total} Kunden gesamt` : "Daten werden geladen…"}
            </p>
          </div>
        </div>

        {/* Filter-Leiste */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filter</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

            {/* Suchfeld */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Name oder E-Mail…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Segment */}
            <select
              value={segment}
              onChange={e => setSegment(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="">Alle Segmente</option>
              <option value="personal">Privat</option>
              <option value="elderly">Senioren</option>
              <option value="corporate">Firma</option>
            </select>

            {/* Rolle */}
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="">Alle Rollen</option>
              <option value="admin">Admin</option>
              <option value="customer">Kunde</option>
            </select>

            {/* Aktiv-Status */}
            <select
              value={activeFilter}
              onChange={e => setActiveFilter(e.target.value as "" | "true" | "false")}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="">Alle Status</option>
              <option value="true">Aktiv</option>
              <option value="false">Inaktiv</option>
            </select>
          </div>

          {/* Aktive Filter anzeigen + Reset */}
          {(search || segment || role || activeFilter) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-gray-500">Aktiv:</span>
              {search && (
                <span className="flex items-center gap-1 bg-yellow-400/10 text-yellow-300 border border-yellow-400/20 text-xs px-2 py-0.5 rounded-full">
                  Suche: &ldquo;{search}&rdquo;
                  <button onClick={() => setSearch("")} className="hover:text-white ml-0.5">✕</button>
                </span>
              )}
              {segment && (
                <span className="flex items-center gap-1 bg-yellow-400/10 text-yellow-300 border border-yellow-400/20 text-xs px-2 py-0.5 rounded-full">
                  {SEGMENT_LABELS[segment]?.label ?? segment}
                  <button onClick={() => setSegment("")} className="hover:text-white ml-0.5">✕</button>
                </span>
              )}
              {role && (
                <span className="flex items-center gap-1 bg-yellow-400/10 text-yellow-300 border border-yellow-400/20 text-xs px-2 py-0.5 rounded-full">
                  {ROLE_LABELS[role]?.label ?? role}
                  <button onClick={() => setRole("")} className="hover:text-white ml-0.5">✕</button>
                </span>
              )}
              {activeFilter && (
                <span className="flex items-center gap-1 bg-yellow-400/10 text-yellow-300 border border-yellow-400/20 text-xs px-2 py-0.5 rounded-full">
                  {activeFilter === "true" ? "Aktiv" : "Inaktiv"}
                  <button onClick={() => setActiveFilter("")} className="hover:text-white ml-0.5">✕</button>
                </span>
              )}
              <button
                onClick={() => { setSearch(""); setSegment(""); setRole(""); setActiveFilter(""); }}
                className="text-xs text-gray-500 hover:text-red-400 underline ml-auto"
              >
                Alle Filter zurücksetzen
              </button>
            </div>
          )}
        </div>

        {/* Tabelle */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">

          {/* Lade- & Fehlerzustände */}
          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <span className="animate-spin text-2xl mr-3">⏳</span>
              <span className="text-sm">Kunden werden geladen…</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="text-3xl">⚠️</span>
              <p className="text-red-400 text-sm">Fehler beim Laden: {error}</p>
              <button
                onClick={fetchCustomers}
                className="text-xs bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {!loading && !error && data && data.items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-500">
              <span className="text-3xl">🔎</span>
              <p className="text-sm">Keine Kunden gefunden.</p>
              {(search || segment || role || activeFilter) && (
                <p className="text-xs">Versuche die Filter anzupassen.</p>
              )}
            </div>
          )}

          {!loading && !error && data && data.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900/60 border-b border-gray-700">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      E-Mail
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Segment
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Rolle
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Erstellt am
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {data.items.map((customer) => (
                    <tr
                      key={customer.id}
                      className="hover:bg-gray-700/30 transition-colors"
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* Avatar-Placeholder */}
                          <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-200 shrink-0">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-white whitespace-nowrap">{customer.name}</span>
                        </div>
                      </td>

                      {/* E-Mail */}
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        <a
                          href={`mailto:${customer.email}`}
                          className="hover:text-yellow-400 transition-colors"
                        >
                          {customer.email}
                        </a>
                      </td>

                      {/* Segment */}
                      <td className="px-4 py-3">
                        <Badge value={customer.segment} map={SEGMENT_LABELS} />
                      </td>

                      {/* Rolle */}
                      <td className="px-4 py-3">
                        <Badge value={customer.role} map={ROLE_LABELS} />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
                          customer.is_active
                            ? "bg-green-500/20 text-green-300 border-green-500/30"
                            : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${customer.is_active ? "bg-green-400" : "bg-gray-500"}`} />
                          {customer.is_active ? "Aktiv" : "Inaktiv"}
                        </span>
                      </td>

                      {/* Erstellt am */}
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                        {formatDate(customer.created_at)}
                      </td>

                      {/* Aktionen */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleActive(customer)}
                            title={customer.is_active ? "Deaktivieren" : "Aktivieren"}
                            className={`text-xs px-2 py-1 rounded transition-colors border ${
                              customer.is_active
                                ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                                : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                            }`}
                          >
                            {customer.is_active ? "Deaktivieren" : "Aktivieren"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginierung */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-gray-500 text-xs">
              Zeige {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} von {data.total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
              >
                «
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
              >
                ‹ Zurück
              </button>

              {/* Seitenzahlen */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1.5 rounded border text-xs transition-colors ${
                      p === page
                        ? "bg-yellow-400 text-gray-900 border-yellow-400 font-bold"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
              >
                Weiter ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
              >
                »
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
