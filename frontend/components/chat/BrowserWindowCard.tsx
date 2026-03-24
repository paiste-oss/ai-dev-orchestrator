"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface BrowserState {
  screenshot_b64: string;
  url: string;
  error?: string | null;
}

interface Props {
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
  onNaturalSize?: (w: number, h: number) => void;
}

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

export default function BrowserWindowCard({ initialUrl = "", onUrlChange, onNaturalSize }: Props) {
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [state, setState] = useState<BrowserState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeInput, setTypeInput] = useState("");
  const [showTypeBar, setShowTypeBar] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const didAutoNav = useRef(false);
  const didResize = useRef(false);

  // Auto-navigate on mount if initialUrl provided (e.g. after page reload)
  useEffect(() => {
    if (initialUrl && !didAutoNav.current) {
      didAutoNav.current = true;
      doAction({ type: "navigate", url: initialUrl });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doAction = useCallback(async (action: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/browser`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.detail ?? "Fehler");
        return;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        const newUrl = data.url ?? inputUrl;
        setState({ screenshot_b64: data.screenshot_b64, url: newUrl, error: null });
        setInputUrl(newUrl);
        onUrlChange?.(newUrl);
        if (!didResize.current && onNaturalSize) {
          didResize.current = true;
          onNaturalSize(VIEWPORT_W, VIEWPORT_H);
        }
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }, [inputUrl]);

  function navigate(target?: string) {
    const dest = (target ?? inputUrl).trim();
    if (!dest) return;
    const url = dest.startsWith("http") ? dest : `https://${dest}`;
    setInputUrl(url);
    doAction({ type: "navigate", url });
  }

  function handleImgClick(e: React.MouseEvent<HTMLImageElement>) {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const scaleX = VIEWPORT_W / rect.width;
    const scaleY = VIEWPORT_H / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    doAction({ type: "click", x, y });
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!state) return;
    e.preventDefault();
    doAction({ type: "scroll", direction: e.deltaY > 0 ? "down" : "up" });
  }

  function handleType() {
    if (!typeInput.trim()) return;
    doAction({ type: "type", text: typeInput, submit: false });
    setTypeInput("");
    setShowTypeBar(false);
  }

  const QUICK = [
    { label: "Google", url: "https://google.com" },
    { label: "20min", url: "https://20min.ch" },
    { label: "SRF", url: "https://srf.ch" },
    { label: "Wetter", url: "https://wetter.com" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="shrink-0 border-b border-white/5 px-2 py-1.5 flex gap-1.5 items-center">
        {/* Reload */}
        <button
          onClick={() => doAction({ type: "screenshot" })}
          disabled={loading || !state}
          title="Neu laden"
          className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/8 disabled:opacity-30 transition-colors shrink-0"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>

        {/* URL input */}
        <div className="flex-1 flex items-center bg-white/5 border border-white/8 rounded-lg overflow-hidden">
          <span className="px-1.5 text-gray-600 text-xs shrink-0">🌐</span>
          <input
            ref={urlInputRef}
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && navigate()}
            className="flex-1 bg-transparent px-1 py-1 text-xs text-white outline-none placeholder-gray-600"
            placeholder="URL eingeben…"
          />
          {loading && <span className="px-2 text-[10px] text-gray-500 animate-pulse shrink-0">Lädt…</span>}
        </div>

        <button
          onClick={() => navigate()}
          disabled={loading || !inputUrl.trim()}
          className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs disabled:opacity-40 transition-colors shrink-0"
        >
          →
        </button>

        {/* Type button */}
        {state && (
          <button
            onClick={() => setShowTypeBar(v => !v)}
            title="Text tippen"
            className={`p-1 rounded transition-colors shrink-0 ${showTypeBar ? "text-indigo-400 bg-indigo-500/15" : "text-gray-500 hover:text-white hover:bg-white/8"}`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M17 6H7a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V7a1 1 0 00-1-1zM8 12h8M12 8v8"/>
            </svg>
          </button>
        )}
      </div>

      {/* Type bar */}
      {showTypeBar && (
        <div className="shrink-0 border-b border-white/5 px-2 py-1.5 flex gap-1.5">
          <input
            autoFocus
            value={typeInput}
            onChange={e => setTypeInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { doAction({ type: "type", text: typeInput, submit: true }); setTypeInput(""); setShowTypeBar(false); } }}
            placeholder="Text eingeben + Enter = absenden, Klick → nur tippen"
            className="flex-1 bg-white/5 border border-white/8 rounded-lg px-2 py-1 text-xs text-white outline-none placeholder-gray-600 focus:border-indigo-500/40"
          />
          <button onClick={handleType}
            className="px-2 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-gray-300 text-xs transition-colors shrink-0">
            Tippen
          </button>
          <button
            onClick={() => { doAction({ type: "type", text: typeInput, submit: true }); setTypeInput(""); setShowTypeBar(false); }}
            className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors shrink-0">
            ↵ Senden
          </button>
        </div>
      )}

      {/* Content */}
      <div
        className="flex-1 overflow-hidden relative"
        onWheel={handleWheel}
      >
        {/* Empty state */}
        {!state && !loading && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
            <span className="text-3xl">🌐</span>
            <p className="text-gray-500 text-sm text-center">URL eingeben oder wählen</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {QUICK.map(q => (
                <button key={q.url} onClick={() => navigate(q.url)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-gray-300 text-xs transition-colors">
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && !state && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-xs">Lädt…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
            <span className="text-2xl">⚠️</span>
            <p className="text-red-400 text-xs text-center">{error}</p>
          </div>
        )}

        {/* Screenshot — interactive */}
        {state && state.screenshot_b64 && (
          <div className="relative w-full h-full bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={`data:image/jpeg;base64,${state.screenshot_b64}`}
              alt="Browser"
              style={{ width: "100%", height: "100%", objectFit: "contain", userSelect: "none" }}
              className={loading ? "opacity-60 cursor-wait" : "cursor-crosshair"}
              onClick={handleImgClick}
              draggable={false}
            />
            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {/* Scroll hint */}
            <div className="absolute bottom-2 right-2 text-[10px] text-gray-600 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none select-none">
              Klick = Klicken · Scroll = Scrollen
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
