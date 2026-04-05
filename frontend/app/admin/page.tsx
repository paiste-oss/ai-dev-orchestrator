"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface RecentCustomer {
  id: string;
  name: string;
  email: string;
  created_at: string;
  last_seen: string | null;
  subscription_status?: string;
}

interface HealthData {
  services: Record<string, "ok" | "fail" | "unknown">;
  sentry: { configured: boolean; issues_url?: string };
}

interface DashboardData {
  total_customers: number;
  online_now: number;
  pending_entwicklung: number;
  recent: RecentCustomer[];
  health: HealthData | null;
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

function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />;
}

const EXTERNAL_LINKS = [
  { label: "Dolibarr ERP", sub: "Buchhaltung & Rechnungen", icon: "▤", url: "https://erp.baddi.ch" },
  { label: "n8n Workflows", sub: "Automationen & Services", icon: "⇆", url: "http://localhost:5678" },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<ReturnType<typeof getSession>>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>({ total_customers: 0, online_now: 0, pending_entwicklung: 0, recent: [], health: null });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, entwicklungRes, healthRes] = await Promise.allSettled([
        apiFetch(`${BACKEND_URL}/v1/customers/dashboard/stats`),
        apiFetch(`${BACKEND_URL}/v1/entwicklung?page=1&page_size=1`),
        apiFetch(`${BACKEND_URL}/v1/system/health`),
      ]);

      // Nur erfolgreiche Responses in den State mergen — fehlgeschlagene lassen alte Daten stehen
      const updates: Partial<DashboardData> = {};

      if (dashRes.status === "fulfilled" && dashRes.value.ok) {
        const d = await dashRes.value.json();
        updates.total_customers = d.total_customers ?? 0;
        updates.online_now = d.online_now ?? 0;
        updates.recent = d.recent ?? [];
      }
      if (entwicklungRes.status === "fulfilled" && entwicklungRes.value.ok) {
        const d = await entwicklungRes.value.json();
        const s = d.stats ?? {};
        updates.pending_entwicklung = (s["pending"] ?? 0) + (s["needs_input"] ?? 0);
      }
      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        updates.health = await healthRes.value.json();
      }

      if (Object.keys(updates).length > 0) {
        setData(prev => ({ ...prev, ...updates }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const u = getSession();
    setUser(u);
    setMounted(true);
    if (!u || u.role !== "admin") { router.replace("/login"); return; }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    load();
    intervalRef.current = setInterval(load, 60000); // auto-refresh every 60s
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [mounted, load]);

  if (!mounted || !user) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  const firstName = user.name.split(" ")[0];
  const allOk = data.health ? Object.values(data.health.services).every(s => s === "ok") : false;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">

        {/* Mobile Top-Bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-gray-950/80 backdrop-blur-md border-b border-white/5 md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">☰</button>
          <span className="font-bold text-sm text-yellow-400">Baddi Admin</span>
        </header>

        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-8 pb-12 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-600 font-medium tracking-widest uppercase">
                {new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <h1 className="text-2xl md:text-3xl font-bold mt-1">{greeting}, {firstName}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* System-Indikator kompakt */}
              <div className={`hidden md:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${allOk ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/5" : "border-red-500/20 text-red-400 bg-red-500/5"}`}>
                <Dot ok={allOk} />
                {allOk ? "Alle Systeme OK" : "System-Problem"}
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white bg-white/5 hover:bg-white/8 border border-white/8 px-3 py-1.5 rounded-xl transition-all disabled:opacity-40"
              >
                <span className={`text-sm ${loading ? "animate-spin" : ""}`}>↻</span>
                <span className="hidden sm:inline">Aktualisieren</span>
              </button>
            </div>
          </div>

          {/* Entwicklungs-Alert */}
          {!loading && data.pending_entwicklung > 0 && (
            <button
              onClick={() => router.push("/admin/entwicklung")}
              className="flex items-center gap-3 w-full bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 hover:border-amber-500/40 rounded-xl px-4 py-3.5 transition-all group"
            >
              <span className="text-xl animate-bounce">⚗</span>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-amber-300">
                  {data.pending_entwicklung} neue Entwicklungs-Anfrage{data.pending_entwicklung > 1 ? "n" : ""}
                </p>
                <p className="text-xs text-amber-500/70">Kunden warten auf neue Fähigkeiten → Jetzt ansehen</p>
              </div>
              <span className="text-amber-600 group-hover:text-amber-400 transition-colors">→</span>
            </button>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Letzte Kunden — 2/3 Breite */}
            <section className="lg:col-span-2 bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Letzte Kunden</h2>
                    <p className="text-xs text-gray-600 mt-0.5">{data.total_customers} total</p>
                  </div>
                  {data.online_now > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs text-emerald-400 font-medium">{data.online_now} online</span>
                    </div>
                  )}
                </div>
                <button onClick={() => router.push("/admin/customers")} className="text-xs text-gray-600 hover:text-yellow-400 transition-colors">Alle →</button>
              </div>

              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : data.recent.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-gray-500">Noch keine Kunden</p>
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {data.recent.map((c) => (
                    <li
                      key={c.id}
                      onClick={() => router.push(`/admin/customers/${c.id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] cursor-pointer transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border border-white/5 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">{c.name}</p>
                        <p className="text-xs text-gray-600 truncate">{c.email}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        {c.last_seen ? (
                          <p className={`text-xs ${Date.now() - new Date(c.last_seen).getTime() < 15 * 60000 ? "text-emerald-500" : "text-gray-600"}`}>
                            {Date.now() - new Date(c.last_seen).getTime() < 15 * 60000 ? "● " : ""}{formatRelTime(c.last_seen)}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-700">Neu: {formatRelTime(c.created_at)}</p>
                        )}
                        {c.subscription_status && c.subscription_status !== "inactive" && (
                          <p className="text-[10px] text-yellow-600 capitalize">{c.subscription_status}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Rechte Spalte */}
            <div className="space-y-4">

              {/* System-Status */}
              <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">System-Status</h2>
                  <button onClick={() => router.push("/admin/system")} className="text-xs text-gray-700 hover:text-yellow-400 transition-colors">Details →</button>
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  {([
                    { label: "Datenbank",     key: "db" },
                    { label: "Cache",         key: "redis" },
                    { label: "KI-Modelle",    key: "ai" },
                    { label: "Vektordatenbank", key: "qdrant" },
                  ]).map(({ label, key }) => {
                    const status = data.health?.services?.[key] ?? "unknown";
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{label}</span>
                        {loading || !data.health ? (
                          <span className="w-10 h-3 rounded bg-white/5 animate-pulse inline-block" />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${status === "ok" ? "bg-emerald-400" : status === "fail" ? "bg-red-400" : "bg-gray-600"}`} />
                            <span className={`text-xs ${status === "ok" ? "text-emerald-500" : status === "fail" ? "text-red-400" : "text-gray-600"}`}>
                              {status === "ok" ? "OK" : status === "fail" ? "Fehler" : "—"}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Sentry */}
                {!loading && data.health && (
                  <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
                    <span className="text-xs text-gray-600">Error Tracking</span>
                    {data.health.sentry.configured ? (
                      <a href={data.health.sentry.issues_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Sentry aktiv ↗
                      </a>
                    ) : (
                      <span className="text-xs text-gray-700">Sentry inaktiv</span>
                    )}
                  </div>
                )}
              </div>

              {/* Externe Links */}
              <div className="bg-gray-900 border border-white/5 rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Externe Tools</h2>
                <div className="space-y-2">
                  {EXTERNAL_LINKS.map(link => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-white/3 hover:bg-white/6 border border-white/5 hover:border-white/10 transition-all group"
                    >
                      <span className="text-base text-gray-500 group-hover:text-gray-300 w-5 text-center">{link.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 group-hover:text-white font-medium transition-colors">{link.label}</p>
                        <p className="text-xs text-gray-600 truncate">{link.sub}</p>
                      </div>
                      <span className="text-gray-700 group-hover:text-gray-400 text-xs transition-colors">↗</span>
                    </a>
                  ))}
                </div>
              </div>

            </div>
          </div>

          <div className="pt-2 text-xs text-gray-800">
            Baddi Admin · auto-refresh alle 60s
          </div>

        </div>
      </main>
    </div>
  );
}
