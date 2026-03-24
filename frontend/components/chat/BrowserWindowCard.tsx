"use client";

import { useState, useRef } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface BrowserViewData {
  screenshot_b64: string;
  url: string;
  error?: string;
}

interface Props {
  initialUrl?: string;
  onNewCard?: (type: string, data: unknown, msgId: string) => void;
}

export default function BrowserWindowCard({ initialUrl = "", onNewCard }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BrowserViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function navigate(target?: string) {
    const dest = (target ?? inputUrl).trim();
    if (!dest) return;

    // Normalize URL
    const normalized = dest.startsWith("http") ? dest : `https://${dest}`;
    setUrl(normalized);
    setInputUrl(normalized);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/message`, {
        method: "POST",
        body: JSON.stringify({ message: `Öffne diese Webseite und zeige mir einen Screenshot: ${normalized}` }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.detail ?? "Fehler beim Laden");
        return;
      }

      const data = await res.json();
      if (data.response_type === "browser_view" && data.structured_data) {
        setResult(data.structured_data as BrowserViewData);
        if (onNewCard) {
          onNewCard(data.response_type, data.structured_data, data.message_id ?? `br-${Date.now()}`);
        }
      } else {
        setError("Seite konnte nicht geladen werden — Browser-Tool nicht konfiguriert.");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") navigate();
  }

  // Quick links
  const QUICK = [
    { label: "Google", url: "https://google.com" },
    { label: "News", url: "https://news.google.com" },
    { label: "Wetter", url: "https://wetter.com" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="shrink-0 border-b border-white/5 px-3 py-2 flex gap-2">
        {/* Back/reload not available without session — just navigation */}
        <div className="flex-1 flex items-center bg-white/5 border border-white/8 rounded-lg overflow-hidden">
          <span className="px-2 text-gray-600 text-xs shrink-0">🌐</span>
          <input
            ref={inputRef}
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder-gray-600"
            placeholder="URL eingeben… z.B. google.com"
          />
          {loading && <span className="px-2 text-xs text-gray-500 shrink-0 animate-pulse">Lädt…</span>}
        </div>
        <button
          onClick={() => navigate()}
          disabled={loading || !inputUrl.trim()}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-40 transition-colors shrink-0"
        >
          {loading ? "…" : "→"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!result && !error && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
            <span className="text-4xl">🌐</span>
            <p className="text-gray-500 text-sm text-center">URL eingeben oder Schnellzugriff wählen</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK.map(q => (
                <button
                  key={q.url}
                  onClick={() => { setInputUrl(q.url); navigate(q.url); }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-gray-300 text-xs transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <p className="text-gray-700 text-xs text-center max-w-xs">
              Tipp: Im Chat einfach „Öffne [URL]" sagen — Baddi zeigt die Seite als Karte
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Lade {url}…</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
            <span className="text-3xl">⚠️</span>
            <p className="text-red-400 text-sm text-center">{error}</p>
            <button onClick={() => { setError(null); inputRef.current?.focus(); }}
              className="text-xs text-gray-500 hover:text-white transition-colors">
              Erneut versuchen
            </button>
          </div>
        )}

        {result && (
          <div className="p-2">
            {result.error ? (
              <div className="text-red-400 text-sm p-4 text-center">{result.error}</div>
            ) : (
              <>
                {result.url && (
                  <p className="text-[10px] text-gray-600 font-mono mb-2 truncate px-1">{result.url}</p>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${result.screenshot_b64}`}
                  alt="Screenshot"
                  className="w-full rounded-lg border border-white/5"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
