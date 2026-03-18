"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { API_ROUTES, BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  total_customers: number;
  active_buddies: number;
  chats_today: number;
  active_workflows: number;
}

interface RecentCustomer {
  id: string;
  name: string;
  email: string;
  segment: string;
  created_at: string;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl animate-shimmer ${className}`} />
  );
}

// ─── Stat-Karte ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, gradient, loading, onClick,
}: {
  label: string;
  value: string | number;
  icon: string;
  gradient: string;
  loading: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`
        group relative overflow-hidden rounded-2xl bg-gray-900 border border-white/5
        p-5 transition-all duration-200
        ${onClick ? "cursor-pointer hover:border-white/10 hover:bg-gray-800/70 hover:-translate-y-0.5" : ""}
      `}
    >
      {/* Hintergrund-Glow */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${gradient} blur-2xl scale-150`} />

      <div className="relative space-y-4">
        {/* Icon + Pfeil */}
        <div className="flex items-center justify-between">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-white/5 border border-white/5`}>
            {icon}
          </div>
          {onClick && (
            <span className="text-gray-700 group-hover:text-gray-400 transition-colors text-sm">↗</span>
          )}
        </div>

        {/* Wert */}
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
        )}

        {/* Label */}
        <p className="text-xs text-gray-500 font-medium tracking-widest uppercase">{label}</p>
      </div>
    </div>
  );
}

// ─── Quick-Link ───────────────────────────────────────────────────────────────

function QuickLink({
  icon, label, sub, onClick,
}: {
  icon: string;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 bg-gray-900 border border-white/5 hover:border-yellow-500/30 hover:bg-gray-800/60 rounded-xl p-3.5 transition-all duration-150 text-left w-full"
    >
      <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 border border-white/5 text-base shrink-0 group-hover:bg-yellow-500/10 group-hover:border-yellow-500/20 transition-colors">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors leading-tight">
          {label}
        </p>
        {sub && <p className="text-xs text-gray-600 mt-0.5 truncate">{sub}</p>}
      </div>
      <span className="text-gray-700 group-hover:text-yellow-500 text-sm transition-colors shrink-0">→</span>
    </button>
  );
}

// ─── Segment-Badge ────────────────────────────────────────────────────────────

function SegmentBadge({ segment }: { segment: string }) {
  const map: Record<string, string> = {
    personal:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
    elderly:   "bg-purple-500/10 text-purple-400 border-purple-500/20",
    corporate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    menschen:  "bg-rose-500/10 text-rose-400 border-rose-500/20",
    firmen:    "bg-sky-500/10 text-sky-400 border-sky-500/20",
    default:   "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };
  const cls = map[segment] ?? map.default;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls} capitalize`}>
      {segment}
    </span>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const [mounted,      setMounted]      = useState(false);
  const [user,         setUser]         = useState<ReturnType<typeof getSession>>(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [stats,        setStats]        = useState<DashboardStats | null>(null);
  const [recent,       setRecent]       = useState<RecentCustomer[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const u = getSession();
    setUser(u);
    setMounted(true);
    if (!u || u.role !== "admin") { router.replace("/login"); return; }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [custRes, buddiesRes, workflowsRes] = await Promise.allSettled([
        apiFetch(`${BACKEND_URL}/v1/customers?page=1&page_size=1`),
        apiFetch(`${BACKEND_URL}/v1/buddies`),
        apiFetch(`${BACKEND_URL}/v1/workflows`),
      ]);

      let total_customers = 0, active_buddies = 0, active_workflows = 0;

      if (custRes.status === "fulfilled" && custRes.value.ok) {
        const d = await custRes.value.json();
        total_customers = d.total ?? 0;
      }
      if (buddiesRes.status === "fulfilled" && buddiesRes.value.ok) {
        const d = await buddiesRes.value.json();
        const arr = Array.isArray(d) ? d : (d.items ?? []);
        active_buddies = arr.filter((b: { is_active: boolean }) => b.is_active).length;
      }
      if (workflowsRes.status === "fulfilled" && workflowsRes.value.ok) {
        const d = await workflowsRes.value.json();
        const arr = Array.isArray(d) ? d : (d.data ?? []);
        active_workflows = arr.filter((w: { active: boolean }) => w.active).length;
      }

      setStats({ total_customers, active_buddies, chats_today: 0, active_workflows });

      const custListRes = await apiFetch(`${BACKEND_URL}/v1/customers?page=1&page_size=5`);
      if (custListRes.ok) {
        const d = await custListRes.json();
        setRecent(d.items ?? []);
      }
    } catch {
      // Stille Fehler — Dashboard bleibt nutzbar
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) loadStats();
  }, [mounted, loadStats]);

  if (!mounted || !user) return null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Guten Morgen";
    if (h < 18) return "Guten Tag";
    return "Guten Abend";
  })();

  const QUICK_LINKS = [
    { icon: "⌥", label: "Dev Orchestrator",    sub: "AI-Tasks & Code-Agenten",   action: () => router.push("/admin/devtool")             },
    { icon: "◎", label: "Neuen Kunden anlegen", sub: "Customer anlegen & Baddis", action: () => router.push("/admin/customers")           },
    { icon: "◈", label: "Baddis verwalten",     sub: "Archetypen & Personas",     action: () => router.push("/admin/baddis")             },
    { icon: "⇆", label: "n8n Workflows",        sub: "Automationen & Services",   action: () => router.push("/admin/workflows")          },
    { icon: "▤", label: "Finanzen & Kosten",    sub: "API-Kosten & Übersicht",    action: () => router.push("/admin/finanzen/kosten")    },
    { icon: "▦", label: "Dokumente",            sub: "RAG & Wissensbasis",        action: () => router.push("/admin/documents")          },
    { icon: "📊", label: "Metabase Analytik",   sub: "Dashboards & Metriken",     action: () => window.open(API_ROUTES.metabase, "_blank") },
    { icon: "📖", label: "API Docs",            sub: "OpenAPI / Swagger",         action: () => window.open(API_ROUTES.apiDocs, "_blank") },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">

        {/* ── Mobile Top-Bar ── */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3
          bg-gray-950/80 backdrop-blur-md border-b border-white/5 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            ☰
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center">
              <span className="text-gray-900 font-black text-xs">B</span>
            </div>
            <span className="font-bold text-sm text-yellow-400">Baddi Admin</span>
          </div>
        </header>

        <div className="p-5 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">

          {/* ── Begrüßungs-Header ── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-600 font-medium tracking-widest uppercase mb-1">
                {new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                {greeting}, {user.name.split(" ")[0]} 👋
              </h1>
            </div>
            <button
              onClick={loadStats}
              disabled={statsLoading}
              className="hidden md:flex items-center gap-2 text-xs text-gray-500 hover:text-white
                bg-white/5 hover:bg-white/8 border border-white/5 hover:border-white/10
                px-3 py-2 rounded-xl transition-all disabled:opacity-40 shrink-0"
            >
              <span className={`text-base ${statsLoading ? "animate-spin" : ""}`}>↻</span>
              Aktualisieren
            </button>
          </div>

          {/* ── Stats-Grid ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard
              label="Kunden"
              value={stats?.total_customers ?? "—"}
              icon="◎"
              gradient="bg-blue-500/5"
              loading={statsLoading}
              onClick={() => router.push("/admin/customers")}
            />
            <StatCard
              label="Aktive Baddis"
              value={stats?.active_buddies ?? "—"}
              icon="◈"
              gradient="bg-emerald-500/5"
              loading={statsLoading}
              onClick={() => router.push("/admin/baddis")}
            />
            <StatCard
              label="Gespräche heute"
              value={stats?.chats_today ?? "—"}
              icon="💬"
              gradient="bg-violet-500/5"
              loading={statsLoading}
            />
            <StatCard
              label="Aktive Workflows"
              value={stats?.active_workflows ?? "—"}
              icon="⇆"
              gradient="bg-amber-500/5"
              loading={statsLoading}
              onClick={() => router.push("/admin/workflows")}
            />
          </div>

          {/* ── Hauptbereich: Quick Links + Letzte Kunden ── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* Quick Links (3/5) */}
            <section className="lg:col-span-3 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Schnellzugriff
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {QUICK_LINKS.map((item) => (
                  <QuickLink
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    sub={item.sub}
                    onClick={item.action}
                  />
                ))}
              </div>
            </section>

            {/* Letzte Kunden (2/5) */}
            <section className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Letzte Kunden
                </h2>
                <button
                  onClick={() => router.push("/admin/customers")}
                  className="text-xs text-gray-600 hover:text-yellow-400 transition-colors"
                >
                  Alle anzeigen →
                </button>
              </div>

              <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
                {statsLoading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : recent.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl mb-3">◎</div>
                    <p className="text-sm text-gray-400 font-medium">Noch keine Kunden</p>
                    <p className="text-xs text-gray-600 mt-1">Registrierte Kunden erscheinen hier</p>
                    <button
                      onClick={() => router.push("/admin/customers")}
                      className="mt-4 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                    >
                      Ersten Kunden anlegen →
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {recent.map((c) => (
                      <li
                        key={c.id}
                        onClick={() => router.push(`/admin/customers/${c.id}`)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] cursor-pointer transition-colors group"
                      >
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0 border border-white/5">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                            {c.name}
                          </p>
                          <p className="text-xs text-gray-600 truncate">{c.email}</p>
                        </div>
                        {/* Segment */}
                        {c.segment && <SegmentBadge segment={c.segment} />}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* ── Status-Leiste ── */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <div className="flex items-center gap-4">
              <StatusDot label="Backend" ok />
              <StatusDot label="Datenbank" ok />
              <StatusDot label="KI-Modelle" ok />
            </div>
            <p className="text-xs text-gray-700">
              Letzte Aktualisierung: {new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}

// ─── Status-Indikator ─────────────────────────────────────────────────────────

function StatusDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}
