"use client";

import React, { useState, useEffect, useRef } from "react";
import { ArtifactEntry, ARTIFACT_META } from "@/lib/chat-types";
import { WINDOW_MODULES } from "@/lib/window-registry";
import HomeWindow from "@/components/windows/HomeWindow";

interface ArtifactShellProps {
  artifacts: ArtifactEntry[];
  activeId: string | null;
  onSetActive: (id: string) => void;
  onClose: (id: string) => void;
  windowHeaders?: Record<string, React.ReactNode>;
  renderContent: (artifact: ArtifactEntry) => React.ReactNode;
  onAddArtifact?: (type: string) => void;
  bgStyle?: React.CSSProperties;
  userName?: string;
}

const HOME_ID = "__home__";


export default function ArtifactShell({
  artifacts,
  activeId,
  onSetActive,
  onClose,
  windowHeaders,
  renderContent,
  onAddArtifact,
  bgStyle,
  userName,
}: ArtifactShellProps) {
  // ── Home active state (local) ────────────────────────────────────────────────
  const [homeActive, setHomeActive] = useState(() => artifacts.length === 0);
  const prevLengthRef = useRef(artifacts.length);

  // When a new artifact is added externally (e.g. from chat), auto-focus it
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
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 border-b border-white/5 shrink-0">

        {/* Permanent Home tab */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer shrink-0 transition-all select-none ${
            homeActive
              ? "bg-white/10 text-white border border-white/15"
              : "text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent"
          }`}
          onClick={() => {
            setHomeActive(true);
          }}
        >
          <span className="opacity-70">⌂</span>
          <span className="font-medium">{userName ?? "Home"}</span>
        </div>

        {/* Artifact tabs (scrollable) */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
          {artifacts.map((a) => {
            const m = ARTIFACT_META[a.type] ?? { icon: "🪟", label: a.title };
            const isActive = !homeActive && a.id === effectiveActiveId;
            return (
              <div
                key={a.id}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer shrink-0 transition-all select-none ${
                  isActive
                    ? "bg-white/10 text-white border border-white/15"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent"
                }`}
                onClick={() => {
                  setHomeActive(false);
                  onSetActive(a.id);
                }}
              >
                <span className="max-w-[140px] truncate font-medium">{a.title}</span>
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

        {/* "+" button with dropdown — same style as TopBar */}
        {onAddArtifact && (
          <div className="relative shrink-0 ml-0.5" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              title="Fenster hinzufügen"
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
                  className="absolute right-0 top-8 min-w-[160px] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
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
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Active artifact header (only for non-home artifacts) ──────────────── */}
      {!homeActive && active && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 shrink-0 min-w-0">
          <span className="text-sm font-semibold text-gray-200 truncate shrink-0">
            {active.title}
          </span>
          {windowHeaders?.[active.id] && (
            <div className="flex-1 min-w-0 overflow-hidden">
              {windowHeaders[active.id]}
            </div>
          )}
        </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {homeActive ? (
          <HomeWindow
            artifacts={artifacts}
            bgStyle={bgStyle}
            onFocus={(id) => {
              setHomeActive(false);
              onSetActive(id);
            }}
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
