/**
 * Frontend-Konfiguration
 * Alle URLs werden aus NEXT_PUBLIC_* Umgebungsvariablen gelesen.
 * Diese werden in der Root-.env Datei definiert.
 */

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
export const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ?? "http://localhost:5678";
export const METABASE_URL = process.env.NEXT_PUBLIC_METABASE_URL ?? "http://localhost:3001";

export const API_ROUTES = {
  agentRun:     `${BACKEND_URL}/agent/run`,
  agentHistory: `${BACKEND_URL}/agent/history`,
  webhook:      `${N8N_WEBHOOK_URL}/webhook/agent/run`,
  apiDocs:      `${BACKEND_URL}/docs`,
  metabase:     METABASE_URL,
} as const;
