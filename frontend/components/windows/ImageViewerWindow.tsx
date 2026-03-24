"use client";

import { useState, useRef, useCallback } from "react";

interface Props {
  initialUrl?: string;
}

export default function ImageViewerWindow({ initialUrl = "" }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(!!initialUrl);
  const [error, setError] = useState(false);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const fitScaleRef = useRef(1);

  function calcFitScale(naturalW: number, naturalH: number): number {
    const el = viewerRef.current;
    if (!el || !naturalW || !naturalH) return 1;
    return Math.min(1, el.clientWidth / naturalW, el.clientHeight / naturalH);
  }

  function resetView() {
    setScale(fitScaleRef.current);
    setOffset({ x: 0, y: 0 });
  }

  function load(target?: string) {
    const src = (target ?? inputUrl).trim();
    if (!src) return;
    setUrl(src);
    setInputUrl(src);
    fitScaleRef.current = 1;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setLoaded(false);
    setError(false);
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.min(8, Math.max(0.1, s - e.deltaY * 0.001)));
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
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setInputUrl(file.name);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setLoaded(false);
    setError(false);
  }

  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-white/5 px-2 py-1.5 flex gap-1.5 items-center">
        <input
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && load()}
          placeholder="Bild-URL eingeben…"
          className="flex-1 bg-white/5 border border-white/8 rounded-lg px-2 py-1 text-xs text-white outline-none placeholder-gray-600 focus:border-indigo-500/40"
        />
        <button onClick={() => load()}
          className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors shrink-0">
          →
        </button>
        <button onClick={() => fileRef.current?.click()}
          title="Datei hochladen"
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-colors shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
        </button>
        <div className="h-4 w-px bg-white/10 shrink-0" />
        <button onClick={() => setScale(s => Math.min(8, s + 0.25))} className="px-1.5 py-1 rounded text-gray-400 hover:text-white hover:bg-white/8 text-xs transition-colors">+</button>
        <span className="text-xs text-gray-600 w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.max(0.1, s - 0.25))} className="px-1.5 py-1 rounded text-gray-400 hover:text-white hover:bg-white/8 text-xs transition-colors">−</button>
        <button onClick={resetView} className="px-1.5 py-1 rounded text-gray-500 hover:text-white hover:bg-white/8 text-xs transition-colors" title="Einpassen">⌂</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* Viewer */}
      <div
        ref={viewerRef}
        className="flex-1 overflow-hidden relative bg-[#0a0a0a] flex items-center justify-center"
        onWheel={handleWheel}
        style={{ cursor: url && loaded ? (drag.current ? "grabbing" : "grab") : "default" }}
      >
        {!url && (
          <div className="flex flex-col items-center gap-3 text-center p-4">
            <span className="text-4xl">🖼</span>
            <p className="text-gray-500 text-sm">URL eingeben oder Bild hochladen</p>
          </div>
        )}
        {url && error && (
          <div className="flex flex-col items-center gap-2 text-center p-4">
            <span className="text-3xl">⚠️</span>
            <p className="text-red-400 text-sm">Bild konnte nicht geladen werden</p>
          </div>
        )}
        {url && !error && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Bild"
            className="max-w-none select-none"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center",
              transition: drag.current ? "none" : "transform 0.05s",
              opacity: loaded ? 1 : 0,
            }}
            onLoad={(e) => {
              const img = e.currentTarget;
              const fit = calcFitScale(img.naturalWidth, img.naturalHeight);
              fitScaleRef.current = fit;
              setScale(fit);
              setOffset({ x: 0, y: 0 });
              setLoaded(true);
            }}
            onError={() => { setError(true); setLoaded(true); }}
            onMouseDown={startPan}
            draggable={false}
          />
        )}
        {url && !loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* Hint */}
        {loaded && !error && (
          <div className="absolute bottom-2 right-2 text-[10px] text-gray-700 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none">
            Scroll = Zoom · Ziehen = Pan
          </div>
        )}
      </div>
    </div>
  );
}
