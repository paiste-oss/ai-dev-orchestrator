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
}

const HOME_ID = "__home__";

const ACTIVE_MODULES_FOR_PICKER = WINDOW_MODULES.filter(
  (m) => m.status === "active" || m.status === "beta"
);

export default function ArtifactShell({
  artifacts,
  activeId,
  onSetActive,
  onClose,
  windowHeaders,
  renderContent,
  onAddArtifact,
  bgStyle,
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

  const dotBg = {
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
          <span className="font-medium">Home</span>
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

        {/* "+" button with dropdown */}
        {onAddArtifact && (
          <div className="relative shrink-0 ml-0.5" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors ${
                pickerOpen
                  ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                  : "text-gray-500 hover:text-gray-200 hover:bg-white/8 border border-transparent"
              }`}
              title="Fenster hinzufügen"
            >
              +
            </button>

            {pickerOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-white/8">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Fenster öffnen</p>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {ACTIVE_MODULES_FOR_PICKER.map((m) => {
                    const alreadyOpen = artifacts.some((a) => a.type === m.canvasType);
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          onAddArtifact(m.canvasType);
                          setPickerOpen(false);
                          setHomeActive(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                      >
                        <span className="text-base shrink-0">{m.icon}</span>
                        <span className="text-sm text-gray-300 flex-1 truncate">{m.label}</span>
                        {alreadyOpen && (
                          <span className="text-[10px] text-indigo-400 shrink-0">offen</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
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
