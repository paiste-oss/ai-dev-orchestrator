"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { apiFetch } from "@/lib/auth";
import { API_ROUTES } from "@/lib/config";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";
import { USE_CASES, UseCase } from "@/lib/usecases";

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

interface BuddyRecord {
  id: string;
  baddi_id: string | null;
  usecase_id: string | null;
  name: string;
  segment: string;
  is_active: boolean;
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

// ─── Löschen-Dialog ───────────────────────────────────────────────────────────

function DeleteDialog({ customer, onConfirm, onCancel, loading }: {
  customer: Customer;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
        <div className="text-center space-y-2">
          <div className="text-4xl">🗑️</div>
          <h3 className="text-lg font-bold text-white">Kunden löschen?</h3>
          <p className="text-sm text-gray-400">
            <span className="text-white font-medium">{customer.name}</span> ({customer.email}) wird
            permanent gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50">
            Abbrechen
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors text-sm font-bold disabled:opacity-50">
            {loading ? "Löschen…" : "Ja, löschen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Buddy-Zuweisung Modal ────────────────────────────────────────────────────

const SEGMENT_ORDER: { key: string; label: string }[] = [
  { key: "menschen", label: "Menschen" },
  { key: "firmen",   label: "Firmen"   },
  { key: "funktionen", label: "Funktionen" },
];

function BuddyModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [buddies, setBuddies] = useState<BuddyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] = useState("menschen");

  const loadBuddies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/buddies/customer/${customer.id}`);
      if (res.ok) setBuddies(await res.json());
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => { loadBuddies(); }, [loadBuddies]);

  const assignedIds = new Set(buddies.map(b => b.usecase_id).filter(Boolean));

  const assign = async (uc: UseCase) => {
    setAssigning(uc.id);
    try {
      await apiFetch(`${BACKEND_URL}/v1/buddies`, {
        method: "POST",
        body: JSON.stringify({
          customer_id: customer.id,
          usecase_id: uc.id,
          name: uc.buddyName,
          segment: uc.segment,
          persona_config: {
            system_prompt_template: uc.systemPrompt,
            preferred_model: "mistral",
          },
        }),
      });
      await loadBuddies();
    } catch {
      alert("Fehler beim Zuweisen");
    } finally {
      setAssigning(null);
    }
  };

  const remove = async (buddyId: string) => {
    setRemoving(buddyId);
    try {
      await apiFetch(`${BACKEND_URL}/v1/buddies/${buddyId}`, { method: "DELETE" });
      await loadBuddies();
    } catch {
      alert("Fehler beim Entfernen");
    } finally {
      setRemoving(null);
    }
  };

  const visibleUseCases = USE_CASES.filter(uc => uc.segment === activeSegment && uc.status === "active");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white">🤖 AI Baddis — {customer.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{customer.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Aktuelle Baddis */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Zugewiesene Baddis</p>
            {loading ? (
              <p className="text-sm text-gray-500">Wird geladen…</p>
            ) : buddies.length === 0 ? (
              <p className="text-sm text-gray-500">Noch keine Baddis zugewiesen.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {buddies.map(b => {
                  const uc = USE_CASES.find(u => u.id === b.usecase_id);
                  return (
                    <div key={b.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm ${
                      uc ? `${uc.bgColor} ${uc.borderColor}` : "bg-gray-800 border-gray-600"
                    }`}>
                      <span>{uc?.icon ?? "🤖"}</span>
                      <span className={`font-medium ${uc?.color ?? "text-white"}`}>{b.name}</span>
                      <span className="font-mono text-xs text-yellow-600">{b.baddi_id ?? b.usecase_id}</span>
                      <button
                        onClick={() => remove(b.id)}
                        disabled={removing === b.id}
                        className="ml-1 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50 text-xs"
                      >
                        {removing === b.id ? "…" : "✕"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Baddis hinzufügen */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Baddi hinzufügen</p>

            {/* Segment-Tabs */}
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1 w-fit">
              {SEGMENT_ORDER.map(s => (
                <button
                  key={s.key}
                  onClick={() => setActiveSegment(s.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeSegment === s.key ? "bg-yellow-400 text-gray-900" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {visibleUseCases.map(uc => {
                const isAssigned = assignedIds.has(uc.id);
                return (
                  <button
                    key={uc.id}
                    onClick={() => !isAssigned && assign(uc)}
                    disabled={isAssigned || assigning === uc.id}
                    className={`text-left p-3 rounded-xl border transition-colors flex items-center gap-3 ${
                      isAssigned
                        ? `${uc.bgColor} ${uc.borderColor} opacity-60 cursor-default`
                        : `bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-700`
                    }`}
                  >
                    <span className="text-xl shrink-0">{uc.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${isAssigned ? uc.color : "text-white"}`}>
                        {uc.buddyName} <span className="font-normal text-gray-400">({uc.name})</span>
                      </p>
                      <p className="text-xs text-gray-500 truncate">{uc.tagline}</p>
                    </div>
                    {isAssigned && <span className="ml-auto text-xs text-green-400 shrink-0">✓</span>}
                    {assigning === uc.id && <span className="ml-auto text-xs text-gray-400 shrink-0">…</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-700">
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function CustomersPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [search, setSearch]       = useState("");
  const [segment, setSegment]     = useState("");
  const [role, setRole]           = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");

  const [data, setData]           = useState<CustomerListResponse | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 20;

  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [buddyModal, setBuddyModal] = useState<Customer | null>(null);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const u = getSession();
    setMounted(true);
    if (!u || u.role !== "admin") router.replace("/login");
  }, []);

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

  useEffect(() => { setPage(1); }, [debouncedSearch, segment, role, activeFilter]);
  useEffect(() => { if (mounted) fetchCustomers(); }, [fetchCustomers, mounted]);

  const toggleActive = async (customer: Customer) => {
    try {
      await apiFetch(`${API_ROUTES.customers}/${customer.id}/toggle-active`, { method: "PATCH" });
      fetchCustomers();
    } catch {
      alert("Fehler beim Aktualisieren des Status");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`${API_ROUTES.customers}/${deleteConfirm.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDeleteConfirm(null);
      fetchCustomers();
    } catch {
      alert("Fehler beim Löschen");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {deleteConfirm && (
        <DeleteDialog customer={deleteConfirm} onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)} loading={deleting} />
      )}

      {buddyModal && (
        <BuddyModal customer={buddyModal} onClose={() => setBuddyModal(null)} />
      )}

      <main className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto min-w-0">

        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl md:hidden">☰</button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold">👥 Kunden</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {data ? `${data.total} Kunden gesamt` : "Daten werden geladen…"}
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filter</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input type="text" placeholder="Name oder E-Mail…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors" />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
              )}
            </div>
            <select value={segment} onChange={e => setSegment(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors">
              <option value="">Alle Segmente</option>
              <option value="personal">Privat</option>
              <option value="elderly">Senioren</option>
              <option value="corporate">Firma</option>
            </select>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors">
              <option value="">Alle Rollen</option>
              <option value="admin">Admin</option>
              <option value="customer">Kunde</option>
            </select>
            <select value={activeFilter} onChange={e => setActiveFilter(e.target.value as "" | "true" | "false")}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors">
              <option value="">Alle Status</option>
              <option value="true">Aktiv</option>
              <option value="false">Inaktiv</option>
            </select>
          </div>

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
              <button onClick={() => { setSearch(""); setSegment(""); setRole(""); setActiveFilter(""); }}
                className="text-xs text-gray-500 hover:text-red-400 underline ml-auto">
                Alle Filter zurücksetzen
              </button>
            </div>
          )}
        </div>

        {/* Tabelle */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
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
              <button onClick={fetchCustomers} className="text-xs bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors">
                Erneut versuchen
              </button>
            </div>
          )}
          {!loading && !error && data && data.items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-500">
              <span className="text-3xl">🔎</span>
              <p className="text-sm">Keine Kunden gefunden.</p>
            </div>
          )}
          {!loading && !error && data && data.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900/60 border-b border-gray-700">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap hidden lg:table-cell">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">E-Mail</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Segment</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Rolle</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Erstellt am</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {data.items.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="font-mono text-xs text-gray-500 select-all" title={customer.id}>
                          {customer.id.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-200 shrink-0">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-white whitespace-nowrap">{customer.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        <a href={`mailto:${customer.email}`} className="hover:text-yellow-400 transition-colors">{customer.email}</a>
                      </td>
                      <td className="px-4 py-3"><Badge value={customer.segment} map={SEGMENT_LABELS} /></td>
                      <td className="px-4 py-3"><Badge value={customer.role} map={ROLE_LABELS} /></td>
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
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">{formatDate(customer.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setBuddyModal(customer)}
                            title="AI Baddis verwalten"
                            className="text-xs px-2 py-1 rounded transition-colors border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                          >
                            🤖
                          </button>
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
                          <button
                            onClick={() => setDeleteConfirm(customer)}
                            title="Löschen"
                            className="text-xs px-2 py-1 rounded transition-colors border border-red-700/40 text-red-500 hover:bg-red-500/10"
                          >
                            🗑️
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
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs">‹ Zurück</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1.5 rounded border text-xs transition-colors ${
                      p === page ? "bg-yellow-400 text-gray-900 border-yellow-400 font-bold"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700"
                    }`}>{p}</button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs">Weiter ›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs">»</button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
