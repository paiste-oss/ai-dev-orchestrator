/**
 * Server-only Konfiguration — nur für Server Actions und Route Handlers.
 * Rewrites (next.config.ts) gelten nur für Browser-Requests, nicht für
 * serverseitige fetch-Aufrufe. Deshalb direkt die interne Docker-URL verwenden.
 */

// Build-Zeit: BACKEND_INTERNAL_URL ist nicht gesetzt → Fallback auf NEXT_PUBLIC_BACKEND_URL
export const BACKEND_URL_SERVER =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://api.baddi.ch";
