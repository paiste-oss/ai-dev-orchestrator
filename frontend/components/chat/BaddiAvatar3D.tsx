"use client";

import React, { useEffect, useRef, useState } from "react";

const AVATAR_URL =
  process.env.NEXT_PUBLIC_AVATAR_URL ?? "https://avatar.baddi.ch";

interface Props {
  emotion?: string | null;
  speaking?: boolean;
  avatar?: string;
  onAvatarChange?: (avatar: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function BaddiAvatar3D({ emotion, speaking, avatar, onAvatarChange, className, style }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  const src = `${AVATAR_URL}?avatar=${avatar ?? "robot"}`;

  // Emotion + Speaking per postMessage
  useEffect(() => {
    if (!loaded) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "baddi_emotion", emotion: emotion ?? null, speaking: speaking ?? false },
      AVATAR_URL
    );
  }, [emotion, speaking, loaded]);

  // Avatar-Wahl vom iframe empfangen und an Parent weitergeben
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "baddi_avatar_selected" && onAvatarChange) {
        onAvatarChange(e.data.avatar);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onAvatarChange]);

  return (
    <div className={`relative ${className ?? ""}`} style={style}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-violet-900/30 to-indigo-900/30">
          <span className="text-white/30 text-xs">Lade Avatar…</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={src}
        onLoad={() => setLoaded(true)}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          background: "transparent",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
        allow="cross-origin-isolated"
      />
    </div>
  );
}
