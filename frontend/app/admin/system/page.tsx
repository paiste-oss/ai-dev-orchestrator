"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

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
  ai: "KI-Modelle (Anthropic / Bedrock)",
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
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const allOk = health ? Object.values(health.services).every(s => s === "ok") : null;

  return (
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
              {allOk ? "Baddi läuft normal." : "Mindestens ein Dienst ist ausgefallen."}
            </p>
          </div>
        </div>
      )}

      {/* Interne Dienste */}
      <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Interne Dienste</h2>
          <p className="text-xs text-gray-600 mt-0.5">Live-Check beim Laden dieser Seite</p>
        </div>
        <div className="divide-y divide-white/5">
          {loading && !health ? (
            Array.from({ length: 4 }).map((_, i) => (
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

      {/* Uptime Monitoring */}
      <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Uptime Monitoring</h2>
          <p className="text-xs text-gray-600 mt-0.5">Externe Verfügbarkeitsprüfung alle 60 Sekunden</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-emerald-400">Uptime Kuma aktiv</span>
          </div>
          <div className="space-y-1.5 text-sm text-gray-400">
            <p>Überwacht: <span className="text-white">api.baddi.ch</span> + <span className="text-white">www.baddi.ch</span></p>
            <p>Alert via E-Mail an: <span className="text-white font-mono text-xs">info@baddi.ch</span></p>
            <p>Auto-Recovery: <span className="text-white">n8n Workflow → deploy.sh auf VPS</span></p>
          </div>
          <div className="mt-1 px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-xs text-gray-600">
            Zusätzlich prüft ein <span className="text-gray-400">Celery Beat Task</span> alle 5 Minuten intern DB, Redis und KI-Modelle — als zweite Sicherheitslinie unabhängig vom Tunnel.
          </div>
          <a
            href="https://status.baddi.ch"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            Status-Dashboard öffnen ↗
          </a>
        </div>
      </div>

      {/* Error Tracking */}
      <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Error Tracking (Sentry)</h2>
          <p className="text-xs text-gray-600 mt-0.5">Laufzeitfehler, Exceptions, API-Ausfälle</p>
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
              <p className="text-sm text-gray-400">
                Alerts an: <span className="text-white font-mono text-xs">info@baddi.ch</span>
              </p>
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
            <p className="text-sm text-gray-500">Sentry nicht konfiguriert</p>
          )}
        </div>
      </div>

      {/* Rate Limiting */}
      <div className="bg-gray-900 border border-white/5 rounded-2xl px-5 py-4 space-y-2">
        <h2 className="text-sm font-semibold text-white">Rate Limiting</h2>
        <p className="text-sm text-gray-400">
          Chat-Endpoint: <span className="text-white font-medium">30 Anfragen / Minute</span> pro IP
        </p>
        <p className="text-xs text-gray-600">
          Bei Überschreitung: HTTP 429 Too Many Requests. Admin-Requests sind nicht limitiert.
        </p>
      </div>

    </div>
  );
}
