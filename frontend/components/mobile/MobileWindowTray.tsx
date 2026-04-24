"use client";

import { useRef } from "react";
import { useT } from "@/lib/i18n";

interface TrayCard {
  id: string;
  title: string;
  type?: string;
}

interface MobileWindowTrayProps {
  cards: TrayCard[];
  activeWindowId: string | null;
  panelOpen: boolean;
  homeOpen: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onShowChat: () => void;
  onShowHome: () => void;
  userName?: string;
}

export default function MobileWindowTray({
  cards, activeWindowId, panelOpen, homeOpen, onActivate, onClose, onAdd, onShowChat, onShowHome, userName,
}: MobileWindowTrayProps) {
  const t = useT();
  const chatActive = !panelOpen && !homeOpen;
  return (
    <div
      className="flex items-center gap-2 px-3 py-1 border-t border-white/5 shrink-0"
      style={{ overflowX: "auto", scrollbarWidth: "none" }}
    >
      {/* Chat-Tab — immer sichtbar */}
      <button
        onClick={onShowChat}
        className={`shrink-0 flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-medium transition-all select-none ${
          chatActive
            ? "bg-[var(--accent-30)] border-[var(--accent-50)] text-[var(--accent-light)]"
            : "auto-tab-inactive"
        }`}
        title={t("mobile.back_to_chat")}
      >
        <span className="text-sm leading-none">💬</span>
        <span className="text-[11px]">{t("mobile.chat_tab")}</span>
      </button>

      {/* Home-Tab */}
      <button
        onClick={onShowHome}
        className={`shrink-0 flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-medium transition-all select-none ${
          homeOpen
            ? "bg-[var(--accent-30)] border-[var(--accent-50)] text-[var(--accent-light)]"
            : "auto-tab-inactive"
        }`}
        title="Home"
      >
        <span className="text-[11px] truncate max-w-[64px]">{userName ?? "Home"}</span>
      </button>

      {/* Fenster-Tabs */}
      {cards.map(card => (
        <TrayItem
          key={card.id}
          card={card}
          isActive={activeWindowId === card.id && panelOpen}
          onActivate={onActivate}
          onClose={onClose}
        />
      ))}

      {/* Fenster hinzufügen */}
      <button
        onClick={onAdd}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border auto-tab-inactive"
        title={t("mobile.add_window")}
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
  const t = useT();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerMoved = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  // Erstes Unicode-Graphem als Icon extrahieren
  const icon = Array.from(card.title)[0] ?? "📦";
  const i18nKey = card.type ? `window.${card.type}.label` : "";
  const i18nLabel = i18nKey ? t(i18nKey) : "";
  const label = (i18nLabel && i18nLabel !== i18nKey)
    ? i18nLabel.slice(0, 10)
    : (card.title.replace(/^\S+\s*/, "").slice(0, 10) || Array.from(card.title).slice(1).join("").slice(0, 10));

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
          ? "bg-[var(--accent-30)] border-[var(--accent-50)] text-[var(--accent-light)]"
          : "auto-tab-inactive"
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
