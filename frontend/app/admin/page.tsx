"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";
import StatsGrid from "@/components/admin/dashboard/StatsGrid";
import RecentActivity from "@/components/admin/dashboard/RecentActivity";
import QuickActions from "@/components/admin/dashboard/QuickActions";

interface DashboardStats {
  total_customers: number;
  active_buddies: number;
  chats_today: number;
  active_workflows: number;
  pending_entwicklung: number;
}

interface ServiceStatus { ok: boolean; error?: string; }

interface SystemStatus {
  ok: boolean;
  services: {
    backend?: ServiceStatus;
    db?: ServiceStatus;
    redis?: ServiceStatus;
    ai?: ServiceStatus;
  };
}

interface RecentCustomer {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [mounted,      setMounted]      = useState(false);
  const [user,         setUser]         = useState<ReturnType<typeof getSession>>(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [stats,        setStats]        = useState<DashboardStats | null>(null);
  const [recent,       setRecent]       = useState<RecentCustomer[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [sysStatus,    setSysStatus]    = useState<SystemStatus | null>(null);

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

      try {
        const statusRes = await apiFetch(`${BACKEND_URL}/v1/system/status`);
        if (statusRes.ok) setSysStatus(await statusRes.json());
      } catch {
        setSysStatus({ ok: false, services: { backend: { ok: false }, db: { ok: false }, redis: { ok: false }, ai: { ok: false } } });
      }
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

        {/* Mobile Top-Bar */}
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

          {/* Hero-Header */}
          <div className="relative overflow-hidden border-b border-white/5 px-6 md:px-10 pt-10 pb-8">
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
            <StatsGrid stats={stats} loading={statsLoading} />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <QuickActions stats={stats} statsLoading={statsLoading} />
              <RecentActivity recent={recent} sysStatus={sysStatus} loading={statsLoading} />
            </div>

            <div className="pt-4 border-t border-white/5 text-xs text-gray-700">
              <span>Baddi Admin · {new Date().getFullYear()}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
