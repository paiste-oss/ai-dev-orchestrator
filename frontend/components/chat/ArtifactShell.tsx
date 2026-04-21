"use client";

import React, { useState, useEffect, useRef } from "react";
import { ArtifactEntry, ARTIFACT_META, UiPrefs } from "@/lib/chat-types";
import { WINDOW_MODULES } from "@/lib/window-registry";
import HomeWindow from "@/components/windows/HomeWindow";
import { useT } from "@/lib/i18n";

interface ArtifactShellProps {
  artifacts: ArtifactEntry[];
  activeId: string | null;
  onSetActive: (id: string) => void;
  onClose: (id: string) => void;
  renderContent: (artifact: ArtifactEntry) => React.ReactNode;
  onAddArtifact?: (type: string) => void;
  bgStyle?: React.CSSProperties;
  userName?: string;
  userId?: string;
  uiPrefs?: UiPrefs;
  onPrefsChange?: (patch: Partial<UiPrefs>) => void;
}

const HOME_ID = "__home__";


export default function ArtifactShell({
  artifacts,
  activeId,
  onSetActive,
  onClose,
  renderContent,
  onAddArtifact,
  bgStyle,
  userName,
  userId,
  uiPrefs,
  onPrefsChange,
}: ArtifactShellProps) {
  const t = useT();

  // ── Home active state (per-user, sessionStorage) ─────────────────────────────
  const homeKey = userId ? `baddi:homeActive:${encodeURIComponent(userId)}` : null;
  const [homeActive, setHomeActiveRaw] = useState(() => {
    try {
      const stored = homeKey ? sessionStorage.getItem(homeKey) : null;
      if (stored !== null) return stored === "true";
    } catch { /* ignored */ }
    return artifacts.length === 0;
  });

  const setHomeActive = (value: boolean) => {
    setHomeActiveRaw(value);
    try {
      if (homeKey) sessionStorage.setItem(homeKey, String(value));
    } catch { /* ignored */ }
  };

  const prevLengthRef = useRef(artifacts.length);

  // Only auto-focus when a NEW artifact is added (not on reload)
  useEffect(() => {
    if (artifacts.length > prevLengthRef.current) {
      setHomeActive(false);
    }
    prevLengthRef.current = artifacts.length;
  }, [artifacts.length]);

  // When all artifacts are closed, return to Home
  useEffect(() => {
    if (artifacts.length === 0) setHomeActive(true);
  }, [artifacts.length]);

  // ── Drag-to-scroll on tab strip ─────────────────────────────────────────────
  const tabStripRef = useRef<HTMLDivElement>(null);
  const dragScrolling = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);

  function onTabStripMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Only drag on the strip itself, not on tab buttons
    if ((e.target as HTMLElement).closest("button, [data-tab]")) return;
    dragScrolling.current = true;
    dragStartX.current = e.clientX;
    dragStartScrollLeft.current = tabStripRef.current?.scrollLeft ?? 0;
    e.preventDefault();
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragScrolling.current || !tabStripRef.current) return;
      tabStripRef.current.scrollLeft = dragStartScrollLeft.current - (e.clientX - dragStartX.current);
    }
    function onMouseUp() { dragScrolling.current = false; }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── "+" picker dropdown ──────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  // Which artifact is shown
  const effectiveActiveId = activeId ?? artifacts[artifacts.length - 1]?.id ?? null;
  const active = homeActive
    ? null
    : (artifacts.find((a) => a.id === effectiveActiveId) ?? null);

  // Bild: ArtifactShell bleibt neutral — HomeWindow rendert das Bild selbst mit Overlay
  // Farbe: Farbe + Dot-Pattern auf den ganzen Container, damit alle Fenster die Farbe sehen
  const dotBg: React.CSSProperties = bgStyle?.backgroundImage
    ? {}
    : {
        backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        ...bgStyle,
      };

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden" style={dotBg}>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 border-b border-white/5 shrink-0" style={{ height: 64 }}>

        {/* "+" button with dropdown — same style as TopBar */}
        {onAddArtifact && (
          <div className="relative shrink-0 mr-0.5" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              title={t("chat.add_window")}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/>
                <rect x="3" y="13" width="8" height="8" rx="1"/>
                <line x1="16" y1="16" x2="21" y2="16"/><line x1="18.5" y1="13.5" x2="18.5" y2="18.5"/>
              </svg>
            </button>

            {pickerOpen && (
              <>
                <div className="fixed inset-0" style={{ zIndex: 99998 }} onClick={() => setPickerOpen(false)} />
                <div
                  className="absolute left-0 top-8 min-w-[160px] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
                  style={{ background: "rgba(8,12,22,0.97)", backdropFilter: "blur(16px)", zIndex: 99999 }}
                >
                  {WINDOW_MODULES.filter(m => m.status !== "coming_soon" && m.status !== "hidden").map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        onAddArtifact(m.canvasType);
                        setPickerOpen(false);
                        setHomeActive(false);
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:bg-white/8 hover:text-white flex items-center gap-2 transition-colors"
                    >
                      <span>{m.icon}</span>
                      <span>{t(`window.${m.canvasType}.label`) !== `window.${m.canvasType}.label` ? t(`window.${m.canvasType}.label`) : m.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Permanent Home tab */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer shrink-0 transition-all select-none ${
            homeActive
              ? "bg-white/10 text-white border border-white/15"
              : "text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent"
          }`}
          onClick={() => setHomeActive(true)}
        >
          <span className={homeActive ? "text-sm font-semibold" : "text-xs font-medium"}>
            {userName ?? "Home"}
          </span>
        </div>

        {/* Artifact tabs (scrollable, drag-to-scroll) */}
        <div
          ref={tabStripRef}
          className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0 cursor-grab active:cursor-grabbing"
          onMouseDown={onTabStripMouseDown}
        >
          {artifacts.map((a) => {
            const m = ARTIFACT_META[a.type] ?? { icon: "🪟", label: a.title };
            const isActive = !homeActive && a.id === effectiveActiveId;
            return (
              <div
                key={a.id}
                data-tab
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer shrink-0 transition-all select-none ${
                  isActive
                    ? "bg-white/10 text-white border border-white/15"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent"
                }`}
                onClick={() => {
                  setHomeActive(false);
                  onSetActive(a.id);
                }}
              >
                <span className={`max-w-[140px] truncate ${isActive ? "text-sm font-semibold" : "text-xs font-medium"}`}>
                  {(() => {
                    const key = `window.${a.type}.label`;
                    const translated = t(key);
                    return translated !== key
                      ? `${m.icon ?? ""} ${translated}`.trim()
                      : a.title;
                  })()}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(a.id);
                  }}
                  className="ml-0.5 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

      </div>


      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {homeActive ? (
          <HomeWindow
            artifacts={artifacts}
            bgStyle={bgStyle}
            uiPrefs={uiPrefs}
            onPrefsChange={onPrefsChange}
            onOpen={(type) => {
              onAddArtifact?.(type);
              setHomeActive(false);
            }}
          />
        ) : (
          active && <div key={active.id} className="h-full">{renderContent(active)}</div>
        )}
      </div>
    </div>
  );
}
