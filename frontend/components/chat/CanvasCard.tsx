"use client";

import { useRef, memo } from "react";

interface Props {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  zIndex: number;
  closable?: boolean;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onHalf: (id: string) => void;
}

function CanvasCard({
  id, title, x, y, width, height, minimized, zIndex, closable = true, headerExtra, children,
  onMove, onResize, onFocus, onClose, onMinimize, onMaximize, onHalf,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mx: number; my: number; cx: number; cy: number; lx: number; ly: number } | null>(null);
  const resize = useRef<{ mx: number; my: number; cw: number; ch: number; lw: number; lh: number } | null>(null);

  function startDrag(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    onFocus(id);
    drag.current = { mx: e.clientX, my: e.clientY, cx: x, cy: y, lx: x, ly: y };

    function onMouseMove(ev: MouseEvent) {
      if (!drag.current || !cardRef.current) return;
      const nx = Math.max(0, drag.current.cx + ev.clientX - drag.current.mx);
      const ny = Math.max(0, drag.current.cy + ev.clientY - drag.current.my);
      drag.current.lx = nx;
      drag.current.ly = ny;
      // DOM direkt bewegen — kein React re-render während Drag
      cardRef.current.style.left = `${nx}px`;
      cardRef.current.style.top = `${ny}px`;
    }
    function onMouseUp() {
      if (drag.current) {
        onMove(id, drag.current.lx, drag.current.ly);
      }
      drag.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function startResize(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resize.current = { mx: e.clientX, my: e.clientY, cw: width, ch: height, lw: width, lh: height };

    function onMouseMove(ev: MouseEvent) {
      if (!resize.current || !cardRef.current) return;
      const nw = Math.max(280, resize.current.cw + ev.clientX - resize.current.mx);
      const nh = Math.max(140, resize.current.ch + ev.clientY - resize.current.my);
      resize.current.lw = nw;
      resize.current.lh = nh;
      // DOM direkt anpassen — kein React re-render während Resize
      cardRef.current.style.width = `${nw}px`;
      if (!minimized) cardRef.current.style.height = `${nh}px`;
    }
    function onMouseUp() {
      if (resize.current) {
        onResize(id, resize.current.lw, resize.current.lh);
      }
      resize.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      ref={cardRef}
      style={{
        position: "absolute", left: x, top: y,
        width, height: minimized ? "auto" : height,
        zIndex,
        background: "var(--window-bg, rgba(8, 12, 22, 0.92))",
        color: "var(--window-font-color, #ffffff)",
        backdropFilter: "blur(16px)",
      }}
      className="window-card flex flex-col rounded-2xl border border-white/8 shadow-[0_8px_40px_rgba(0,0,0,0.7)]"
      onMouseDown={() => onFocus(id)}
    >
      {/* ── Header (drag handle) ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-2xl border-b border-white/6 select-none"
        style={{ background: "rgba(255,255,255,0.03)", cursor: minimized ? "pointer" : "grab" }}
        onMouseDown={startDrag}
        onDoubleClick={() => onMinimize(id)}
      >
        <span className="flex-1 text-xs text-gray-400 font-medium truncate">{title}</span>

        {/* Optionale Extra-Buttons (z.B. TTS im Chat-Fenster) */}
        {headerExtra && (
          <div onMouseDown={e => e.stopPropagation()}>{headerExtra}</div>
        )}

        {/* Rechte Steuerknöpfe */}
        <div className="flex items-center gap-1 shrink-0" onMouseDown={e => e.stopPropagation()}>
          {/* Zuklappen */}
          <button
            onClick={() => onMinimize(id)}
            title={minimized ? "Aufklappen" : "Zuklappen"}
            className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-all"
          >
            <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
              <line x1="1" y1="1" x2="9" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          {/* ½-Seite */}
          <button
            onClick={() => onHalf(id)}
            title="Halbe Seite"
            className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-all"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="0.5" y="0.5" width="4.5" height="10" rx="1" stroke="currentColor" strokeWidth="1"/>
              <rect x="5.5" y="0.5" width="4.5" height="10" rx="1" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1"/>
            </svg>
          </button>
          {/* Vollbild */}
          <button
            onClick={() => onMaximize(id)}
            title="Vollbild"
            className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-all"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="0.5" y="0.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1"/>
            </svg>
          </button>
          {/* Schliessen — nur wenn closable */}
          {closable && (
            <button
              onClick={() => onClose(id)}
              title="Schliessen"
              className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <line x1="1" y1="1" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="8" y1="1" x2="1" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {!minimized && (
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>
      )}

      {/* Resize grip — ausserhalb des Content-Bereichs, damit Events nicht abgefangen werden */}
      {!minimized && (
        <div
          style={{ position: "absolute", bottom: 0, right: 0, width: 20, height: 20, zIndex: 9999, cursor: "nwse-resize" }}
          className="flex items-end justify-end pb-1 pr-1 opacity-25 hover:opacity-60 transition-opacity"
          onMouseDown={startResize}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-400" />
          </svg>
        </div>
      )}
    </div>
  );
}

export default memo(CanvasCard);
