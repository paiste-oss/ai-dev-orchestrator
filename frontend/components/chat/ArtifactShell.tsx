"use client";

import React from "react";
import { ArtifactEntry, ARTIFACT_META } from "@/lib/chat-types";
import { WINDOW_MODULES } from "@/lib/window-registry";

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

const QUICK_OPEN = ["netzwerk", "chart", "geo_map", "whiteboard"];

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
  const active = artifacts.find((a) => a.id === activeId) ?? artifacts[artifacts.length - 1] ?? null;
  const meta = active
    ? (ARTIFACT_META[active.type] ?? { icon: "🪟", label: active.title })
    : null;

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (artifacts.length === 0) {
    return (
      <div
        className="flex flex-col flex-1 min-w-0 items-center justify-center h-full"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          ...bgStyle,
        }}
      >
        <div className="text-center space-y-4 px-6 max-w-xs">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
            <span className="text-2xl opacity-40">✦</span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-400">Kein Artifact offen</p>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              Frag Baddi nach Aktien, Karten, Diagrammen oder Netzwerken — oder öffne direkt:
            </p>
          </div>
          {onAddArtifact && (
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_OPEN.map((type) => {
                const m =
                  ARTIFACT_META[type] ??
                  WINDOW_MODULES.find((w) => w.canvasType === type);
                return (
                  <button
                    key={type}
                    onClick={() => onAddArtifact(type)}
                    className="px-3 py-1.5 rounded-lg text-xs text-gray-400 bg-white/5 hover:bg-white/8 border border-white/8 hover:border-white/15 transition-colors"
                  >
                    {m?.icon} {m?.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const effectiveActiveId = activeId ?? active?.id ?? null;

  return (
    <div
      className="flex flex-col flex-1 min-w-0 h-full overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        ...bgStyle,
      }}
    >
      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 border-b border-white/5 overflow-x-auto scrollbar-hide shrink-0">
        {artifacts.map((a) => {
          const m = ARTIFACT_META[a.type] ?? { icon: "🪟", label: a.title };
          const isActive = a.id === effectiveActiveId;
          return (
            <div
              key={a.id}
              className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer shrink-0 transition-all select-none ${
                isActive
                  ? "bg-white/10 text-white border border-white/15"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent"
              }`}
              onClick={() => onSetActive(a.id)}
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

      {/* ── Active artifact header ───────────────────────────────────────────── */}
      {active && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 shrink-0">
          <span className="text-sm font-semibold text-gray-200 truncate flex-1">
            {active.title}
          </span>
          {windowHeaders?.[active.id] && (
            <div className="flex items-center gap-2 shrink-0">
              {windowHeaders[active.id]}
            </div>
          )}
        </div>
      )}

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div key={active?.id} className="flex-1 min-h-0 overflow-hidden">
        {active && renderContent(active)}
      </div>
    </div>
  );
}
