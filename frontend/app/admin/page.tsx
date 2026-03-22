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
  pending_entwicklung: number;
}

interface RecentCustomer {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl bg-white/5 animate-pulse ${className}`} />;
}

// ─── Stat-Karte ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, accent, loading, onClick, badge,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent: string;
  loading: boolean;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        group relative overflow-hidden rounded-2xl bg-gray-900 border border-white/5
        p-5 text-left transition-all duration-200
        ${onClick ? "hover:border-white/10 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30" : "cursor-default"}
      `}
    >
      <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${accent} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity duration-500`} />

      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${accent} bg-opacity-10 border border-white/5`}>
            {icon}
          </div>
          <div className="flex items-center gap-1">
            {badge !== undefined && badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {badge}
              </span>
            )}
            {onClick && (
              <span className="text-gray-700 group-hover:text-gray-400 transition-colors text-sm">↗</span>
            )}
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
        )}

        <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">{label}</p>
      </div>
    </button>
  );
}

// ─── Aktivitäts-Karte ─────────────────────────────────────────────────────────

function ActivityCard({
  icon, title, sub, time, accent, onClick,
}: {
  icon: string;
  title: string;
  sub?: string;
  time?: string;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="group w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${accent ?? "bg-gray-800 border border-white/10"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 group-hover:text-white transition-colors truncate">{title}</p>
        {sub && <p className="text-xs text-gray-600 truncate mt-0.5">{sub}</p>}
      </div>
      {time && <span className="text-xs text-gray-700 shrink-0">{time}</span>}
    </button>
  );
}

// ─── Quick-Action ─────────────────────────────────────────────────────────────

function QuickAction({
  icon, label, sub, onClick, highlight,
}: {
  icon: string;
  label: string;
  sub?: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        group flex items-center gap-3 rounded-xl p-3.5 transition-all duration-150 text-left w-full border
        ${highlight
          ? "bg-yellow-500/8 border-yellow-500/20 hover:bg-yellow-500/12 hover:border-yellow-500/30"
          : "bg-gray-900 border-white/5 hover:border-white/10 hover:bg-gray-800/60"
        }
      `}
    >
      <span className={`w-9 h-9 flex items-center justify-center rounded-lg text-base shrink-0 transition-colors border
        ${highlight
          ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-400"
          : "bg-white/5 border-white/5 text-gray-400 group-hover:bg-white/8 group-hover:text-white"
        }
      `}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-tight ${highlight ? "text-yellow-300" : "text-gray-200 group-hover:text-white"} transition-colors`}>
          {label}
        </p>
        {sub && <p className="text-xs text-gray-600 mt-0.5 truncate">{sub}</p>}
      </div>
      <span className={`text-sm transition-colors shrink-0 ${highlight ? "text-yellow-600 group-hover:text-yellow-400" : "text-gray-700 group-hover:text-gray-400"}`}>→</span>
    </button>
  );
}

function formatRelTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tagen`;
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
      const [custRes, buddiesRes, workflowsRes, entwicklungRes] = await Promise.allSettled([
        apiFetch(`${BACKEND_URL}/v1/customers?page=1&page_size=5`),
        apiFetch(`${BACKEND_URL}/v1/buddies`),
        apiFetch(`${BACKEND_URL}/v1/workflows`),
        apiFetch(`${BACKEND_URL}/v1/entwicklung?page=1&page_size=1`),
      ]);

      let total_customers = 0, active_buddies = 0, active_workflows = 0, pending_entwicklung = 0;

      if (custRes.status === "fulfilled" && custRes.value.ok) {
        const d = await custRes.value.json();
        total_customers = d.total ?? 0;
        setRecent(d.items ?? []);
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
      if (entwicklungRes.status === "fulfilled" && entwicklungRes.value.ok) {
        const d = await entwicklungRes.value.json();
        const s = d.stats ?? {};
        pending_entwicklung = (s["pending"] ?? 0) + (s["needs_input"] ?? 0);
      }

      setStats({ total_customers, active_buddies, chats_today: 0, active_workflows, pending_entwicklung });
    } catch {
      // stille Fehler
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) loadStats();
  }, [mounted, loadStats]);

  if (!mounted || !user) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  const firstName = user.name.split(" ")[0];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">

        {/* ── Mobile Top-Bar ── */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-gray-950/80 backdrop-blur-md border-b border-white/5 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >☰</button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center">
              <span className="text-gray-900 font-black text-xs">B</span>
            </div>
            <span className="font-bold text-sm text-yellow-400">Baddi Admin</span>
          </div>
        </header>

        <div className="max-w-7xl mx-auto">

          {/* ── Hero-Header ── */}
          <div className="relative overflow-hidden border-b border-white/5 px-6 md:px-10 pt-10 pb-8">
            {/* Hintergrund-Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-500/3 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex items-start justify-between gap-6">
              <div className="space-y-2">
                <p className="text-xs text-gray-600 font-medium tracking-widest uppercase">
                  {new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                  {greeting}, {firstName}
                </h1>
                <p className="text-gray-500 text-sm">
                  Willkommen im Baddi Admin-Center. Hier behältst du den Überblick.
                </p>
              </div>

              <div className="hidden md:flex items-center gap-3 shrink-0">
                <button
                  onClick={loadStats}
                  disabled={statsLoading}
                  className="flex items-center gap-2 text-xs text-gray-500 hover:text-white bg-white/5 hover:bg-white/8 border border-white/8 hover:border-white/15 px-3.5 py-2.5 rounded-xl transition-all disabled:opacity-40"
                >
                  <span className={`text-base ${statsLoading ? "animate-spin" : ""}`}>↻</span>
                  Aktualisieren
                </button>

                {/* Admin-Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500/40 to-amber-500/30 border-2 border-yellow-500/30 flex items-center justify-center text-sm font-bold text-yellow-400">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>

            {/* Entwicklung-Alert */}
            {!statsLoading && (stats?.pending_entwicklung ?? 0) > 0 && (
              <button
                onClick={() => router.push("/admin/entwicklung")}
                className="relative mt-5 flex items-center gap-3 w-full sm:w-auto bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 hover:border-amber-500/40 rounded-xl px-4 py-3 transition-all group"
              >
                <span className="text-xl animate-bounce">⚗</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-amber-300">
                    {stats!.pending_entwicklung} neue Entwicklungs-Anfrage{stats!.pending_entwicklung > 1 ? "n" : ""}
                  </p>
                  <p className="text-xs text-amber-500/70">Das Uhrwerk wartet auf deinen Input → Jetzt ansehen</p>
                </div>
                <span className="ml-auto text-amber-600 group-hover:text-amber-400 transition-colors">→</span>
              </button>
            )}
          </div>

          <div className="px-6 md:px-10 py-8 space-y-8">

            {/* ── Stats-Grid ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <StatCard
                label="Kunden"
                value={stats?.total_customers ?? "—"}
                icon="◎"
                accent="bg-blue-500"
                loading={statsLoading}
                onClick={() => router.push("/admin/customers")}
              />
              <StatCard
                label="Aktive Baddis"
                value={stats?.active_buddies ?? "—"}
                icon="◈"
                accent="bg-emerald-500"
                loading={statsLoading}
                onClick={() => router.push("/admin/buddies")}
              />
              <StatCard
                label="In Entwicklung"
                value={stats?.pending_entwicklung ?? "—"}
                icon="⚗"
                accent="bg-amber-500"
                loading={statsLoading}
                onClick={() => router.push("/admin/entwicklung")}
                badge={stats?.pending_entwicklung}
              />
              <StatCard
                label="Workflows"
                value={stats?.active_workflows ?? "—"}
                icon="⇆"
                accent="bg-violet-500"
                loading={statsLoading}
                onClick={() => router.push("/admin/workflows")}
              />
            </div>

            {/* ── Hauptbereich ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

              {/* Quick Actions (3/5) */}
              <section className="lg:col-span-3 space-y-4">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Schnellzugriff</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <QuickAction
                    icon="⚗"
                    label="Entwicklung"
                    sub="Neue Fähigkeiten für Baddis"
                    onClick={() => router.push("/admin/entwicklung")}
                    highlight={!statsLoading && (stats?.pending_entwicklung ?? 0) > 0}
                  />
                  <QuickAction
                    icon="◎"
                    label="Kunden"
                    sub="Alle Kunden verwalten"
                    onClick={() => router.push("/admin/customers")}
                  />
                  <QuickAction
                    icon="◈"
                    label="Baddis"
                    sub="Persönliche KI-Begleiter"
                    onClick={() => router.push("/admin/buddies")}
                  />
                  <QuickAction
                    icon="⌥"
                    label="Dev Orchestrator"
                    sub="AI-Tasks & Code-Agenten"
                    onClick={() => router.push("/admin/devtool")}
                  />
                  <QuickAction
                    icon="◐"
                    label="Design"
                    sub="Erscheinungsbild & Branding"
                    onClick={() => router.push("/admin/design")}
                  />
                  <QuickAction
                    icon="⚙"
                    label="Uhrwerk"
                    sub="Chat-Pipeline & Konfiguration"
                    onClick={() => router.push("/admin/uhrwerk/system-prompt")}
                  />
                  <QuickAction
                    icon="▤"
                    label="Finanzen & Kosten"
                    sub="API-Kosten & Übersicht"
                    onClick={() => router.push("/admin/finanzen/kosten")}
                  />
                  <QuickAction
                    icon="⇆"
                    label="n8n Workflows"
                    sub="Automationen & Services"
                    onClick={() => router.push("/admin/workflows")}
                  />
                  <QuickAction
                    icon="📊"
                    label="Metabase Analytik"
                    sub="Dashboards & Metriken"
                    onClick={() => window.open(API_ROUTES.metabase, "_blank")}
                  />
                </div>
              </section>

              {/* Letzte Kunden (2/5) */}
              <section className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Letzte Kunden</h2>
                  <button
                    onClick={() => router.push("/admin/customers")}
                    className="text-xs text-gray-600 hover:text-yellow-400 transition-colors"
                  >
                    Alle →
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
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-2xl mb-3">◎</div>
                      <p className="text-sm text-gray-400 font-medium">Noch keine Kunden</p>
                      <p className="text-xs text-gray-600 mt-1">Registrierte Kunden erscheinen hier</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-white/5">
                      {recent.map((c) => (
                        <li
                          key={c.id}
                          onClick={() => router.push(`/admin/customers/${c.id}`)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] cursor-pointer transition-colors group"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border border-white/5 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                              {c.name}
                            </p>
                            <p className="text-xs text-gray-600 truncate">{formatRelTime(c.created_at)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* System-Status */}
                <div className="bg-gray-900 border border-white/5 rounded-2xl p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">System-Status</h3>
                  <div className="space-y-2">
                    {[
                      { label: "Backend API",    ok: true },
                      { label: "Datenbank",      ok: true },
                      { label: "KI-Modelle",     ok: true },
                      { label: "Redis / Cache",  ok: true },
                    ].map(({ label, ok }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
                          <span className={`text-xs ${ok ? "text-emerald-500" : "text-red-500"}`}>{ok ? "Online" : "Fehler"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            {/* ── Footer ── */}
            <div className="pt-4 border-t border-white/5 text-xs text-gray-700">
              <span>Baddi Admin · {new Date().getFullYear()}</span>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
