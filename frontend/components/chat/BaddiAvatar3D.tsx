"use client";

import React from "react";
import dynamic from "next/dynamic";

// Lazy laden mit ssr:false damit R3F nie server-seitig evaluiert wird
const RobotAvatar        = dynamic(() => import("./avatars/RobotAvatar"),        { ssr: false });
const TeekanneAvatar     = dynamic(() => import("./avatars/TeekanneAvatar"),     { ssr: false });
const LichtgestaltAvatar = dynamic(() => import("./avatars/LichtgestaltAvatar"), { ssr: false });
const WeltkugelAvatar    = dynamic(() => import("./avatars/WeltkugelAvatar"),    { ssr: false });

interface Props {
  emotion?: string | null;
  speaking?: boolean;
  avatar?: string;
  onAvatarChange?: (avatar: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const AVATARS = [
  { id: "robot",        label: "🤖" },
  { id: "teekanne",     label: "🫖" },
  { id: "lichtgestalt", label: "✨" },
  { id: "weltkugel",    label: "🌍" },
];

class AvatarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-xs p-2 text-center">
          Avatar nicht verfügbar
        </div>
      );
    }
    return this.props.children;
  }
}

export default function BaddiAvatar3D({
  emotion, speaking, avatar = "robot", onAvatarChange, className, style,
}: Props) {
  return (
    <div className={`flex flex-col ${className ?? ""}`} style={style}>
      {/* Avatar */}
      <div className="flex-1 min-h-0 relative">
        <AvatarErrorBoundary>
          {avatar === "robot"        && <RobotAvatar        emotion={emotion} />}
          {avatar === "teekanne"     && <TeekanneAvatar     emotion={emotion} speaking={speaking} />}
          {avatar === "lichtgestalt" && <LichtgestaltAvatar emotion={emotion} speaking={speaking} />}
          {avatar === "weltkugel"    && <WeltkugelAvatar    emotion={emotion} speaking={speaking} />}
        </AvatarErrorBoundary>

        {/* Speaking-Indikator */}
        {speaking && (
          <div style={{
            position: "absolute", bottom: 8, right: 8,
            width: 9, height: 9, borderRadius: "50%",
            background: "#34d399",
            boxShadow: "0 0 6px 2px rgba(52,211,153,0.55)",
            animation: "avatarPulse 1s ease-in-out infinite",
          }} />
        )}
      </div>

      {/* Selector */}
      {onAvatarChange && (
        <div className="flex justify-center gap-1.5 py-1 shrink-0">
          {AVATARS.map(av => (
            <button
              key={av.id}
              onClick={() => onAvatarChange(av.id)}
              className="text-sm transition-all"
              style={{
                padding: "1px 8px",
                borderRadius: 99,
                border: `1px solid ${avatar === av.id ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.14)"}`,
                background: avatar === av.id ? "rgba(255,255,255,0.17)" : "rgba(255,255,255,0.04)",
                color: avatar === av.id ? "white" : "rgba(255,255,255,0.4)",
                cursor: "pointer",
              }}
            >
              {av.label}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes avatarPulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%     { opacity: 0.35; transform: scale(1.45); }
        }
      `}</style>
    </div>
  );
}
