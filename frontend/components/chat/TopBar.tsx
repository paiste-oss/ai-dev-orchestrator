"use client";

import { useState } from "react";
import { WINDOW_MODULES } from "@/lib/window-registry";

interface TopBarProps {
  buddyName: string;
  buddyInitial: string;
  speaking: boolean;
  ttsEnabled: boolean;
  lastProvider: string | null;
  firstName: string;
  isAdmin: boolean;
  onToggleTts: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onAdminBack: () => void;
  onAddCard?: (canvasType: string) => void;
}

function providerBadge(p: string) {
  if (p === "claude")  return { label: "Claude",  icon: "🟠" };
  if (p === "gemini")  return { label: "Gemini",  icon: "🔵" };
  if (p === "openai")  return { label: "ChatGPT", icon: "🟢" };
  return { label: p, icon: "🤖" };
}

export default function TopBar({
  buddyName, buddyInitial, speaking, ttsEnabled, lastProvider,
  firstName, isAdmin,
  onToggleTts, onSettings, onLogout, onAdminBack, onAddCard,
}: TopBarProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <header className="shrink-0 h-12 flex items-center gap-3 px-4 border-b border-white/5"
      style={{ background: "rgba(5,10,20,0.97)", backdropFilter: "blur(12px)", position: "relative", zIndex: 99990 }}>

      {/* Left — Buddy status */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 transition-all ${speaking ? "shadow-[0_0_0_4px_rgba(99,102,241,0.3)]" : ""}`}>
          {buddyInitial}
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-white text-sm truncate max-w-[100px]">{buddyName}</span>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${speaking ? "bg-green-400 animate-pulse" : "bg-green-500"}`} />
            <span className="text-[11px] text-gray-500 hidden sm:block">{speaking ? "antwortet…" : "online"}</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-white/8 shrink-0" />

      {/* Center — spacer */}
      <div className="flex-1" />

      {/* Provider badge */}
      {lastProvider && (() => {
        const b = providerBadge(lastProvider);
        return (
          <span className="hidden md:flex items-center gap-1 text-xs text-gray-500 bg-white/5 border border-white/6 px-2 py-1 rounded-full shrink-0">
            {b.icon} {b.label}
          </span>
        );
      })()}

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 shrink-0">

        {/* Add card */}
        {onAddCard && (
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(v => !v)}
              title="Fenster hinzufügen"
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors font-medium"
            >
              <span className="text-base leading-none">+</span>
            </button>
            {showAddMenu && (
              <>
                <div className="fixed inset-0" style={{ zIndex: 99998 }} onClick={() => setShowAddMenu(false)} />
                <div className="absolute right-0 top-8 min-w-[160px] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
                  style={{ background: "rgba(8,12,22,0.97)", backdropFilter: "blur(16px)", zIndex: 99999 }}>
                  {WINDOW_MODULES.filter(m => m.status !== "coming_soon").map(mod => (
                    <button
                      key={mod.id}
                      onClick={() => { onAddCard(mod.canvasType); setShowAddMenu(false); }}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:bg-white/8 hover:text-white flex items-center gap-2 transition-colors"
                    >
                      <span>{mod.icon}</span>
                      <span>{mod.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}


        {/* TTS */}
        <button onClick={onToggleTts} title={ttsEnabled ? "Stimme aus" : "Stimme ein"}
          className={`p-1.5 rounded-lg transition-colors text-sm ${ttsEnabled ? "text-emerald-400 bg-emerald-500/10" : "text-gray-500 hover:text-white hover:bg-white/5"}`}>
          {ttsEnabled ? "🔊" : "🔇"}
        </button>

        {/* Settings */}
        <button onClick={onSettings} title="Einstellungen"
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors text-sm">
          ⚙
        </button>

        <div className="h-5 w-px bg-white/8 mx-1 shrink-0" />

        {/* Customer name */}
        {firstName && (
          <span className="text-xs text-gray-400 px-2 hidden sm:block">{firstName}</span>
        )}

        {/* Admin back */}
        {isAdmin && (
          <button onClick={onAdminBack}
            className="text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 px-2.5 py-1 rounded-lg transition-all shrink-0">
            Admin
          </button>
        )}

        {/* Logout */}
        <button onClick={onLogout}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 bg-white/5 hover:bg-red-500/8 border border-white/5 hover:border-red-500/20 px-2.5 py-1.5 rounded-lg transition-all ml-1">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          <span className="hidden sm:block">Abmelden</span>
        </button>
      </div>
    </header>
  );
}
