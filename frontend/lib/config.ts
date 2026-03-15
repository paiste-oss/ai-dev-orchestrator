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
  agentRun:          `${BACKEND_URL}/agent/run`,
  agentRunWithFile:  `${BACKEND_URL}/agent/run-with-file`,
  agentHistory:      `${BACKEND_URL}/agent/history`,
  agentEvent:        `${BACKEND_URL}/v1/agent/event`,
  agentEventsStream: (customerId: string) => `${BACKEND_URL}/v1/agent/events/stream?customer_id=${customerId}`,
  agentEvents:       (customerId: string) => `${BACKEND_URL}/v1/agent/events?customer_id=${customerId}`,
  customerLookup:    (email: string) => `${BACKEND_URL}/v1/customers/lookup?email=${encodeURIComponent(email)}`,
  documents:         `${BACKEND_URL}/v1/documents`,
  apiDocs:           `${BACKEND_URL}/docs`,
  metabase:          METABASE_URL,
} as const;
