"use client";

import dynamic from "next/dynamic";

const BaddiAvatar3D = dynamic(() => import("@/components/chat/BaddiAvatar3D"), { ssr: false });

interface TopBarProps {
  buddyName: string;
  buddyInitial: string;
  speaking: boolean;
  lastProvider: string | null;
  isAdmin: boolean;
  avatar?: string;
  emotion?: string | null;
  onSettings: () => void;
  onAdminBack: () => void;
  onArrangeCards?: () => void;
}

function providerBadge(p: string) {
  if (p === "claude")  return { label: "Claude",  icon: "🟠" };
  if (p === "gemini")  return { label: "Gemini",  icon: "🔵" };
  if (p === "openai")  return { label: "ChatGPT", icon: "🟢" };
  return { label: p, icon: "🤖" };
}

export default function TopBar({
  buddyName, buddyInitial, speaking, lastProvider,
  isAdmin, avatar, emotion,
  onSettings, onAdminBack, onArrangeCards,
}: TopBarProps) {

  return (
    <header className="shrink-0 flex items-center gap-3 px-4 border-b border-white/5"
      style={{ background: "rgba(5,10,20,0.97)", backdropFilter: "blur(12px)", position: "relative", zIndex: 99990, height: 64 }}>

      {/* Left — Avatar + Buddy status */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* 3D Avatar */}
        <div
          className="shrink-0 rounded-xl overflow-hidden"
          style={{
            width: 44, height: 56,
            background: "rgba(15,12,30,0.7)",
            boxShadow: speaking ? "0 0 0 2px rgba(99,102,241,0.5)" : "0 0 0 1px rgba(255,255,255,0.08)",
            transition: "box-shadow 0.3s",
          }}
        >
          <BaddiAvatar3D
            emotion={emotion}
            speaking={speaking}
            avatar={avatar ?? "robot"}
            className="w-full h-full"
          />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-semibold text-white text-sm truncate max-w-[100px]">{buddyName}</span>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${speaking ? "bg-green-400 animate-pulse" : "bg-green-500"}`} />
            <span className="text-[11px] text-gray-500">{speaking ? "antwortet…" : "online"}</span>
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


        {/* Auto-Layout */}
        {onArrangeCards && (
          <button
            onClick={onArrangeCards}
            title="Fenster automatisch anordnen"
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
              <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
            </svg>
          </button>
        )}

        {/* Settings */}
        <button onClick={onSettings} title="Einstellungen"
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        {isAdmin && (
          <>
            <div className="h-5 w-px bg-white/8 mx-1 shrink-0" />
            <button onClick={onAdminBack}
              className="text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 px-2.5 py-1 rounded-lg transition-all shrink-0">
              Admin
            </button>
          </>
        )}
      </div>
    </header>
  );
}
