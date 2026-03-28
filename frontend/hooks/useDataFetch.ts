"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/auth";

interface UseDataFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Generischer Fetch-Hook für Admin-Pages.
 * Ersetzt wiederkehrendes try/finally + setLoading Pattern.
 *
 * Verwendung:
 *   const { data, loading, error, reload } = useDataFetch<Customer[]>(
 *     `${BACKEND_URL}/v1/customers`,
 *   );
 *
 * Mit dynamischen Deps (z.B. Filter):
 *   const { data } = useDataFetch<Overview>(url, [days, filter]);
 *
 * Kein Fetch (z.B. bei fehlendem Auth):
 *   const { data } = useDataFetch<Tool>(condition ? url : null);
 */
export function useDataFetch<T>(
  url: string | null,
  deps: unknown[] = [],
): UseDataFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetch_ = useCallback(async () => {
    if (!url) return;

    // Laufende Anfrage abbrechen
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    fetch_();
    return () => abortRef.current?.abort();
  }, [fetch_]);

  return { data, loading, error, reload: fetch_ };
}
