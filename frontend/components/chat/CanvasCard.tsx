"use client";

import { useRef } from "react";

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
  children: React.ReactNode;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
}

export default function CanvasCard({
  id, title, x, y, width, height, minimized, zIndex, closable = true, children,
  onMove, onResize, onFocus, onClose, onMinimize,
}: Props) {
  const drag = useRef<{ mx: number; my: number; cx: number; cy: number } | null>(null);
  const resize = useRef<{ mx: number; my: number; cw: number; ch: number } | null>(null);

  function startDrag(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    onFocus(id);
    drag.current = { mx: e.clientX, my: e.clientY, cx: x, cy: y };

    function onMouseMove(ev: MouseEvent) {
      if (!drag.current) return;
      onMove(id,
        Math.max(0, drag.current.cx + ev.clientX - drag.current.mx),
        Math.max(0, drag.current.cy + ev.clientY - drag.current.my),
      );
    }
    function onMouseUp() {
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
    resize.current = { mx: e.clientX, my: e.clientY, cw: width, ch: height };

    function onMouseMove(ev: MouseEvent) {
      if (!resize.current) return;
      onResize(id,
        Math.max(280, resize.current.cw + ev.clientX - resize.current.mx),
        Math.max(140, resize.current.ch + ev.clientY - resize.current.my),
      );
    }
    function onMouseUp() {
      resize.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      style={{
        position: "absolute", left: x, top: y,
        width, height: minimized ? "auto" : height,
        zIndex,
        background: "rgba(8, 12, 22, 0.92)",
        backdropFilter: "blur(16px)",
      }}
      className="flex flex-col rounded-2xl border border-white/8 shadow-[0_8px_40px_rgba(0,0,0,0.7)]"
      onMouseDown={() => onFocus(id)}
    >
      {/* ── Header (drag handle) ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-2xl border-b border-white/6 select-none"
        style={{ background: "rgba(255,255,255,0.03)", cursor: minimized ? "pointer" : "grab" }}
        onMouseDown={startDrag}
        onDoubleClick={() => onMinimize(id)}
      >
        {/* Traffic-light buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {closable && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => onClose(id)}
              className="w-3 h-3 rounded-full bg-red-500/70 hover:bg-red-400 transition-colors"
              title="Schliessen"
            />
          )}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => onMinimize(id)}
            className="w-3 h-3 rounded-full bg-yellow-500/70 hover:bg-yellow-400 transition-colors"
            title={minimized ? "Aufklappen" : "Minimieren"}
          />
          <div className="w-3 h-3 rounded-full bg-white/10" />
        </div>
        <span className="flex-1 text-xs text-gray-400 font-medium truncate pl-1">{title}</span>
      </div>

      {/* ── Content ── */}
      {!minimized && (
        <div className="flex-1 overflow-hidden relative">
          {children}
          {/* Resize grip */}
          <div
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end pb-1 pr-1 opacity-25 hover:opacity-60 transition-opacity"
            onMouseDown={startResize}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-400" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
