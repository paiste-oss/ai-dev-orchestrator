"use client";

import React, { useEffect, useRef, useState } from "react";

// Prod: avatar.baddi.ch — Dev: localhost:5173
const AVATAR_URL =
  process.env.NEXT_PUBLIC_AVATAR_URL ?? "https://avatar.baddi.ch";

interface Props {
  emotion?: string | null;
  speaking?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function BaddiAvatar3D({ emotion, speaking, className, style }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Emotion + Speaking-State per postMessage an iframe
  useEffect(() => {
    if (!loaded) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "baddi_emotion", emotion: emotion ?? null, speaking: speaking ?? false },
      AVATAR_URL
    );
  }, [emotion, speaking, loaded]);

  return (
    <div className={`relative ${className ?? ""}`} style={style}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-violet-900/30 to-indigo-900/30">
          <span className="text-white/30 text-xs">Lade Avatar…</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={AVATAR_URL}
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
