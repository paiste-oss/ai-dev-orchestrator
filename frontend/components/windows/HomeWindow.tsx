"use client";

import { ArtifactEntry, ARTIFACT_META } from "@/lib/chat-types";
import { WINDOW_MODULES, WindowModuleDefinition } from "@/lib/window-registry";

interface Props {
  artifacts: ArtifactEntry[];
  onFocus: (id: string) => void;
  onOpen: (type: string) => void;
}

const ACTIVE_MODULES = WINDOW_MODULES.filter(
  (m) => m.status === "active" || m.status === "beta"
);

export default function HomeWindow({ artifacts, onFocus, onOpen }: Props) {
  return (
    <div className="h-full overflow-y-auto p-5 space-y-6">

      {/* ── Open windows ───────────────────────────────────────────────────── */}
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
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-colors text-sm text-gray-300 hover:text-white"
                >
                  <span>{meta.icon}</span>
                  <span className="max-w-[140px] truncate">{a.title}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── All windows ────────────────────────────────────────────────────── */}
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
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors ${
                  alreadyOpen
                    ? "bg-indigo-950/30 border-indigo-500/30 hover:bg-indigo-950/50"
                    : "bg-white/3 border-white/8 hover:bg-white/7 hover:border-white/15"
                }`}
              >
                <span className="text-lg shrink-0 mt-0.5">{m.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-300 truncate">{m.label}</p>
                  <p className="text-[10px] text-gray-600 leading-snug mt-0.5 line-clamp-2">
                    {m.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
