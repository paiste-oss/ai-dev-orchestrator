/**
 * Frontend-Konfiguration
 * Alle URLs werden aus NEXT_PUBLIC_* Umgebungsvariablen gelesen.
 * Diese werden in der Root-.env Datei definiert.
 *
 * n8n ist kein Frontend-Ziel mehr — alle Anfragen gehen an das Backend.
 * Das Backend entscheidet, ob n8n-Services (Email, SMS, etc.) ausgelöst werden.
 */

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
export const METABASE_URL = process.env.NEXT_PUBLIC_METABASE_URL ?? "http://localhost:3001";

export const API_ROUTES = {
  agentRun:     `${BACKEND_URL}/agent/run`,
  agentHistory: `${BACKEND_URL}/agent/history`,
  apiDocs:      `${BACKEND_URL}/docs`,
  metabase:     METABASE_URL,
} as const;
