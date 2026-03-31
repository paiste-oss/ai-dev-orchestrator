"use client";

import React from "react";
import dynamic from "next/dynamic";

// Three.js / Visage braucht den Browser — kein SSR
const AvatarCanvas = dynamic(() => import("./BaddiAvatarCanvas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gradient-to-br from-violet-900/30 to-indigo-900/30 rounded-xl flex items-center justify-center">
      <span className="text-white/30 text-xs">…</span>
    </div>
  ),
});

interface Props {
  emotion?: string | null;
  speaking?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function BaddiAvatar3D({ emotion, speaking, className, style }: Props) {
  return (
    <div className={className} style={style}>
      <AvatarCanvas emotion={emotion} speaking={speaking} />
    </div>
  );
}
