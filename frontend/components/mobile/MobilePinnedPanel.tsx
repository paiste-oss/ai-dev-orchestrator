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
  availableHeight: number;     // px — verfügbarer Raum für das Panel
  children: React.ReactNode;
  onClose: () => void;
  onHeightChange: (fraction: number) => void;
}

const MIN_FRACTION = 0.25;

export default function MobilePinnedPanel({
  card, heightFraction, maxHeightFraction, availableHeight, children, onClose, onHeightChange,
}: MobilePinnedPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartFraction = useRef(heightFraction);

  const clampedFraction = Math.max(MIN_FRACTION, Math.min(maxHeightFraction, heightFraction));
  const heightPx = Math.round(clampedFraction * availableHeight);

  function onHandleTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    isDragging.current = true;
    dragStartY.current = e.touches[0].clientY;
    dragStartFraction.current = clampedFraction;

    const panel = panelRef.current;
    if (panel) panel.style.transition = "none";

    function onTouchMove(ev: TouchEvent) {
      if (!isDragging.current) return;
      ev.preventDefault();
      const delta = ev.touches[0].clientY - dragStartY.current;
      // Handle ist oben: Finger hoch (delta < 0) = Panel grösser
      const newFraction = Math.max(
        MIN_FRACTION,
        Math.min(maxHeightFraction, dragStartFraction.current - delta / availableHeight)
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
      className="shrink-0 flex flex-col overflow-hidden border-t border-white/10"
      style={{
        height: heightPx,
        transition: "height 300ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      {/* Drag Handle — oben, Finger hoch = Panel grösser */}
      <div
        className="shrink-0 flex items-center justify-center cursor-ns-resize select-none touch-none"
        style={{ height: 22, background: "rgba(255,255,255,0.03)" }}
        onTouchStart={onHandleTouchStart}
      >
        <div className="w-9 h-1 rounded-full bg-white/25" />
      </div>

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 shrink-0 border-b border-white/8"
        style={{ minHeight: 38, background: "rgba(0,0,0,0.2)" }}
      >
        <span className="text-xs font-medium text-gray-300 flex-1 truncate">{card.title}</span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
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
    </div>
  );
}
