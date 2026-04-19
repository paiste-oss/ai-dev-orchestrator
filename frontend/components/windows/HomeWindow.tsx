"use client";

import React from "react";
import { ArtifactEntry, ARTIFACT_META } from "@/lib/chat-types";
import { WINDOW_MODULES } from "@/lib/window-registry";

interface Props {
  artifacts: ArtifactEntry[];
  bgStyle?: React.CSSProperties;
  onFocus: (id: string) => void;
  onOpen: (type: string) => void;
}

const ACTIVE_MODULES = WINDOW_MODULES.filter(
  (m) => m.status === "active" || m.status === "beta"
);

export default function HomeWindow({ artifacts, bgStyle, onFocus, onOpen }: Props) {
  const hasBg = !!(bgStyle?.backgroundImage && bgStyle.backgroundImage !== "none");

  return (
    <div
      className="relative h-full overflow-hidden"
      style={hasBg ? { ...bgStyle, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {/* Dark overlay for readability when background image is set */}
      {hasBg && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
      )}

      {/* Scrollable content on top */}
      <div className="relative h-full overflow-y-auto p-5 space-y-6">

        {/* ── Open windows ─────────────────────────────────────────────────── */}
        {artifacts.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
              Offene Fenster
            </p>
            <div className="flex flex-wrap gap-2">
              {artifacts.map((a) => {
                const meta = ARTIFACT_META[a.type] ?? { icon: "🪟", label: a.title };
                return (
                  <button
                    key={a.id}
                    onClick={() => onFocus(a.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/25 transition-colors text-sm text-gray-200 hover:text-white backdrop-blur-sm"
                  >
                    <span>{meta.icon}</span>
                    <span className="max-w-[140px] truncate">{a.title}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── All windows ──────────────────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
            Alle Fenster
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ACTIVE_MODULES.map((m) => {
              const alreadyOpen = artifacts.some((a) => a.type === m.canvasType);
              return (
                <button
                  key={m.id}
                  onClick={() => onOpen(m.canvasType)}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors backdrop-blur-sm ${
                    alreadyOpen
                      ? "bg-indigo-950/50 border-indigo-500/40 hover:bg-indigo-950/70"
                      : "bg-black/20 border-white/10 hover:bg-black/30 hover:border-white/20"
                  }`}
                >
                  <span className="text-lg shrink-0 mt-0.5">{m.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">{m.label}</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5 line-clamp-2">
                      {m.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
