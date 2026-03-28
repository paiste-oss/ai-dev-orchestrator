"use client";

import { useRef } from "react";

interface CardData {
  id: string;
  title: string;
  type: string;
}

interface MobilePinnedPanelProps {
  card: CardData;
  heightFraction: number;      // 0.20 – 0.55
  maxHeightFraction: number;   // keyboard-aware max
  availableHeight: number;     // px — Viewport minus TopBar
  children: React.ReactNode;
  onClose: () => void;
  onHeightChange: (fraction: number) => void;
}

const MIN_FRACTION = 0.20;

export default function MobilePinnedPanel({
  card, heightFraction, maxHeightFraction, availableHeight, children, onClose, onHeightChange,
}: MobilePinnedPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartFraction = useRef(heightFraction);

  const heightPx = Math.round(
    Math.max(MIN_FRACTION, Math.min(maxHeightFraction, heightFraction)) * availableHeight
  );

  function onHandleTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    isDragging.current = true;
    dragStartY.current = e.touches[0].clientY;
    dragStartFraction.current = heightFraction;

    const panel = panelRef.current;
    if (panel) panel.style.transition = "none";

    function onTouchMove(ev: TouchEvent) {
      if (!isDragging.current) return;
      ev.preventDefault();
      const delta = ev.touches[0].clientY - dragStartY.current;
      // Finger nach unten = Panel grösser
      const newFraction = Math.max(
        MIN_FRACTION,
        Math.min(maxHeightFraction, dragStartFraction.current + delta / availableHeight)
      );
      if (panel) panel.style.height = `${Math.round(newFraction * availableHeight)}px`;
    }

    function onTouchEnd() {
      isDragging.current = false;
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      if (panel) {
        panel.style.transition = "";
        const currentH = parseInt(panel.style.height || "0", 10) || heightPx;
        const raw = currentH / availableHeight;
        // Snap auf nächste 5%
        const snapped = Math.round(raw * 20) / 20;
        const final = Math.max(MIN_FRACTION, Math.min(maxHeightFraction, snapped));
        onHeightChange(final);
      }
    }

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
  }

  return (
    <div
      ref={panelRef}
      className="shrink-0 flex flex-col overflow-hidden border-b border-white/10"
      style={{
        height: heightPx,
        transition: "height 300ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 shrink-0 border-b border-white/8"
        style={{ minHeight: 36, background: "rgba(0,0,0,0.25)" }}
      >
        <span className="text-xs font-medium text-gray-300 flex-1 truncate">{card.title}</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {children}
      </div>

      {/* Drag Handle */}
      <div
        className="shrink-0 flex items-center justify-center cursor-ns-resize select-none touch-none"
        style={{ height: 20, background: "rgba(255,255,255,0.025)" }}
        onTouchStart={onHandleTouchStart}
      >
        <div className="w-8 h-1 rounded-full bg-white/25" />
      </div>
    </div>
  );
}
