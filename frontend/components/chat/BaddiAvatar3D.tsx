"use client";

import React, { useEffect, useRef, useState } from "react";

interface Props {
  emotion?: string | null;
  speaking?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function BaddiAvatar3D({ emotion, speaking, className, style }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Emotion per postMessage an iframe schicken
  useEffect(() => {
    if (!loaded) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "baddi_emotion", emotion: emotion ?? null },
      window.location.origin
    );
  }, [emotion, loaded]);

  return (
    <div className={`relative ${className ?? ""}`} style={style}>
      {/* Lade-Placeholder bis iframe bereit */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-violet-900/30 to-indigo-900/30">
          <span className="text-white/30 text-xs">Lade Avatar…</span>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src="/avatar"
        onLoad={() => setLoaded(true)}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          background: "transparent",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
        // Transparenter Hintergrund
        allowTransparency
      />

      {/* Speaking-Indikator (ausserhalb des iframe) */}
      {speaking && loaded && (
        <span className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_2px_rgba(52,211,153,0.5)] pointer-events-none" />
      )}
    </div>
  );
}
