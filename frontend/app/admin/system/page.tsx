"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface ServiceStatus {
  [key: string]: "ok" | "fail" | "unknown";
}

interface SentryInfo {
  configured: boolean;
  issues_url?: string;
  project_id?: string;
}

interface HealthData {
  services: ServiceStatus;
  sentry: SentryInfo;
}

const SERVICE_LABELS: Record<string, string> = {
  db: "Datenbank (PostgreSQL)",
  redis: "Cache (Redis)",
  ai: "KI-Modelle (Anthropic)",
  qdrant: "Vektor-Datenbank (Qdrant)",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") return (
    <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Online
    </span>
  );
  if (status === "fail") return (
    <span className="flex items-center gap-1.5 text-red-400 text-sm font-medium">
      <span className="w-2 h-2 rounded-full bg-red-400" /> Ausgefallen
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-gray-500 text-sm">
      <span className="w-2 h-2 rounded-full bg-gray-600" /> Unbekannt
    </span>
  );
}

export default function SystemPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/system/health`);
      if (res.ok) {
        setHealth(await res.json());
        setLastRefresh(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const u = getSession();
    setMounted(true);
    if (!u || u.role !== "admin") { router.replace("/login"); return; }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) return null;

  const allOk = health ? Object.values(health.services).every(s => s === "ok") : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-gray-950/80 backdrop-blur-md border-b border-white/5 md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-gray-400">☰</button>
          <span className="font-bold text-sm text-yellow-400">System</span>
        </header>

        <div className="max-w-3xl mx-auto px-4 md:px-8 pt-8 pb-12 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">System & Health</h1>
              <p className="text-gray-500 text-sm mt-1">
                {lastRefresh ? `Zuletzt aktualisiert: ${lastRefresh.toLocaleTimeString("de-CH")}` : "Lädt..."}
              </p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white bg-white/5 border border-white/8 px-3 py-1.5 rounded-xl transition-all disabled:opacity-40"
            >
              <span className={`text-sm ${loading ? "animate-spin" : ""}`}>↻</span>
              Aktualisieren
            </button>
          </div>

          {/* Gesamt-Status Banner */}
          {allOk !== null && (
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${
              allOk
                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                : "bg-red-500/5 border-red-500/20 text-red-400"
            }`}>
              <span className="text-2xl">{allOk ? "✓" : "✗"}</span>
              <div>
                <p className="font-semibold">{allOk ? "Alle Systeme operationell" : "System-Problem erkannt"}</p>
                <p className="text-xs opacity-70 mt-0.5">
                  {allOk ? "Baddi läuft normal." : "Mindestens ein Dienst ist ausgefallen. E-Mail-Alert wurde gesendet."}
                </p>
              </div>
            </div>
          )}

          {/* Services */}
          <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white">Dienste</h2>
              <p className="text-xs text-gray-600 mt-0.5">Geprüft alle 5 Minuten via Celery Beat</p>
            </div>
            <div className="divide-y divide-white/5">
              {loading && !health ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-4">
                    <div className="h-4 w-40 rounded bg-white/5 animate-pulse" />
                    <div className="h-4 w-16 rounded bg-white/5 animate-pulse" />
                  </div>
                ))
              ) : health ? (
                Object.entries(SERVICE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm text-gray-200">{label}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{key}</p>
                    </div>
                    <StatusBadge status={health.services[key] ?? "unknown"} />
                  </div>
                ))
              ) : null}
            </div>
          </div>

          {/* Error Tracking */}
          <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white">Error Tracking (Sentry)</h2>
            </div>
            <div className="px-5 py-4">
              {loading && !health ? (
                <div className="h-4 w-48 rounded bg-white/5 animate-pulse" />
              ) : health?.sentry.configured ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-sm text-emerald-400">Sentry aktiv</span>
                    <span className="text-xs text-gray-600">— Fehler werden automatisch erfasst</span>
                  </div>
                  {health.sentry.issues_url && (
                    <a
                      href={health.sentry.issues_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
                    >
                      Sentry Issues öffnen ↗
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Sentry nicht konfiguriert</p>
                  <p className="text-xs text-gray-700">
                    Füge <code className="text-gray-500">SENTRY_DSN=...</code> zur <code className="text-gray-500">.env</code> hinzu um Fehler automatisch zu erfassen.
                  </p>
                  <a
                    href="https://sentry.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-yellow-600 hover:text-yellow-400 transition-colors mt-1"
                  >
                    Kostenloses Sentry-Konto erstellen ↗
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Rate Limiting Info */}
          <div className="bg-gray-900 border border-white/5 rounded-2xl px-5 py-4 space-y-2">
            <h2 className="text-sm font-semibold text-white">Rate Limiting</h2>
            <p className="text-sm text-gray-400">
              Chat-Endpoint: <span className="text-white font-medium">30 Anfragen / Minute</span> pro IP
            </p>
            <p className="text-xs text-gray-600">
              Bei Überschreitung: HTTP 429 Too Many Requests. Admin-Requests sind nicht limitiert.
            </p>
          </div>

          {/* Alert-Konfiguration */}
          <div className="bg-gray-900 border border-white/5 rounded-2xl px-5 py-4 space-y-2">
            <h2 className="text-sm font-semibold text-white">Alert-E-Mail</h2>
            <p className="text-sm text-gray-400">
              Bei Ausfall sendet Celery eine E-Mail an:{" "}
              <span className="text-white font-medium font-mono text-xs">
                HEALTH_ALERT_EMAIL
              </span>{" "}
              in <code className="text-gray-500 text-xs">.env</code>
            </p>
            <p className="text-xs text-gray-600">
              Leer = SYSTEM_SMTP_USER wird als Fallback verwendet. Kein Alert wenn SMTP nicht konfiguriert.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
