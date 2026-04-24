"use client";

import { useState, useRef, useCallback } from "react";
import { useT } from "@/lib/i18n";
import WindowFrame from "./WindowFrame";

interface Props {
  initialUrl?: string;
  onNaturalSize?: (w: number, h: number) => void;
}

export default function ImageViewerWindow({ initialUrl = "", onNaturalSize }: Props) {
  const t = useT();
  const [url, setUrl]           = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [zoom, setZoom]         = useState(1);
  const [offset, setOffset]     = useState({ x: 0, y: 0 });
  const [loaded, setLoaded]     = useState(!!initialUrl);
  const [error, setError]       = useState(false);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load(target?: string) {
    const src = (target ?? inputUrl).trim();
    if (!src) return;
    setUrl(src);
    setInputUrl(src);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setLoaded(false);
    setError(false);
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(8, Math.max(0.2, z - e.deltaY * 0.001)));
  }, []);

  function startPan(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
    function onMove(ev: MouseEvent) {
      if (!drag.current) return;
      setOffset({ x: drag.current.ox + ev.clientX - drag.current.sx, y: drag.current.oy + ev.clientY - drag.current.sy });
    }
    function onUp() {
      drag.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUrl(URL.createObjectURL(file));
    setInputUrl(file.name);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setLoaded(false);
    setError(false);
  }

  return (
    <WindowFrame>
      {/* Toolbar */}
      <div className="shrink-0 border-b window-border-soft px-2 py-1.5 flex gap-1.5 items-center">
        <input
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && load()}
          placeholder={t("imgview.url_placeholder")}
          className="flex-1 bg-white/5 border border-white/8 rounded-lg px-2 py-1 text-xs text-white outline-none placeholder-gray-600 focus:border-[var(--accent-40)]"
        />
        <button onClick={() => load()}
          className="px-2 py-1 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs transition-colors shrink-0">
          →
        </button>
        <button onClick={() => fileRef.current?.click()} title={t("imgview.upload_title")}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-colors shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
        </button>
        <div className="h-4 w-px bg-white/10 shrink-0" />
        <button onClick={() => setZoom(z => Math.min(8, +(z + 0.25).toFixed(2)))}
          className="px-1.5 py-1 rounded text-gray-400 hover:text-white hover:bg-white/8 text-xs transition-colors">+</button>
        <span className="text-xs text-gray-600 w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(0.2, +(z - 0.25).toFixed(2)))}
          className="px-1.5 py-1 rounded text-gray-400 hover:text-white hover:bg-white/8 text-xs transition-colors">−</button>
        <button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
          className="px-1.5 py-1 rounded text-gray-500 hover:text-white hover:bg-white/8 text-xs transition-colors" title={t("imgview.fit_title")}>⌂</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* Viewer */}
      <div
        className="flex-1 overflow-hidden relative bg-[#0a0a0a]"
        onWheel={handleWheel}
        style={{ cursor: url && loaded ? (drag.current ? "grabbing" : zoom > 1 ? "grab" : "default") : "default" }}
      >
        {!url && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-4">
            <span className="text-4xl">🖼</span>
            <p className="text-gray-500 text-sm">{t("imgview.empty")}</p>
          </div>
        )}
        {url && error && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-4">
            <span className="text-3xl">⚠️</span>
            <p className="text-red-400 text-sm">{t("imgview.error")}</p>
          </div>
        )}
        {url && !error && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Bild"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: zoom === 1 && offset.x === 0 && offset.y === 0
                ? "none"
                : `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transformOrigin: "center",
              transition: drag.current ? "none" : "opacity 0.15s",
              opacity: loaded ? 1 : 0,
              userSelect: "none",
            }}
            onLoad={(e) => { setLoaded(true); const img = e.currentTarget; onNaturalSize?.(img.naturalWidth, img.naturalHeight); }}
            onError={() => { setError(true); setLoaded(true); }}
            onMouseDown={startPan}
            draggable={false}
          />
        )}
        {url && !loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {loaded && !error && (
          <div className="absolute bottom-2 right-2 text-[10px] text-gray-700 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none">
            {t("imgview.hint")}
          </div>
        )}
      </div>
    </WindowFrame>
  );
}
