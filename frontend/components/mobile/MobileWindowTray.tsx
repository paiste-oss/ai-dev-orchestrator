"use client";

import { useRef } from "react";

interface TrayCard {
  id: string;
  title: string;
}

interface MobileWindowTrayProps {
  cards: TrayCard[];
  activeWindowId: string | null;
  panelOpen: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

export default function MobileWindowTray({
  cards, activeWindowId, panelOpen, onActivate, onClose, onAdd,
}: MobileWindowTrayProps) {
  if (cards.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-t border-white/5 shrink-0"
      style={{ overflowX: "auto", scrollbarWidth: "none" }}
    >
      {cards.map(card => (
        <TrayItem
          key={card.id}
          card={card}
          isActive={activeWindowId === card.id && panelOpen}
          onActivate={onActivate}
          onClose={onClose}
        />
      ))}
      <button
        onClick={onAdd}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 border border-white/8 transition-colors ml-1"
        title="Fenster hinzufügen"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  );
}

function TrayItem({
  card, isActive, onActivate, onClose,
}: {
  card: TrayCard;
  isActive: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerMoved = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  // Erstes Unicode-Graphem als Icon extrahieren
  const icon = Array.from(card.title)[0] ?? "📦";
  const label = card.title.replace(/^\S+\s*/, "").slice(0, 10) || Array.from(card.title).slice(1).join("").slice(0, 10);

  function startLongPress() {
    longPressTimer.current = setTimeout(() => {
      if (!pointerMoved.current) {
        navigator.vibrate?.(50);
        onClose(card.id);
      }
    }, 500);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <button
      className={`shrink-0 flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-medium transition-all select-none ${
        isActive
          ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-200"
          : "bg-white/5 border-white/8 text-gray-400 active:bg-white/10"
      }`}
      onPointerDown={(e) => {
        pointerMoved.current = false;
        startPos.current = { x: e.clientX, y: e.clientY };
        startLongPress();
      }}
      onPointerMove={(e) => {
        const dx = Math.abs(e.clientX - startPos.current.x);
        const dy = Math.abs(e.clientY - startPos.current.y);
        if (dx > 6 || dy > 6) {
          pointerMoved.current = true;
          cancelLongPress();
        }
      }}
      onPointerUp={() => {
        cancelLongPress();
        if (!pointerMoved.current) onActivate(card.id);
      }}
      onPointerLeave={cancelLongPress}
    >
      <span className="text-sm leading-none">{icon}</span>
      {label && <span className="max-w-[56px] truncate text-[11px]">{label}</span>}
    </button>
  );
}
