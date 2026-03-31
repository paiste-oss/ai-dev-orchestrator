"use client";

import React from "react";

// Emotion → Emoji + Farbe
const EMOTION_STYLE: Record<string, { emoji: string; glow: string; label: string }> = {
  freudig:      { emoji: "😊", glow: "rgba(250,204,21,0.35)",  label: "freudig" },
  nachdenklich: { emoji: "🤔", glow: "rgba(99,102,241,0.35)",  label: "nachdenklich" },
  traurig:      { emoji: "🥺", glow: "rgba(59,130,246,0.35)",  label: "traurig" },
  überrascht:   { emoji: "😮", glow: "rgba(251,146,60,0.35)",  label: "überrascht" },
  ruhig:        { emoji: "😌", glow: "rgba(52,211,153,0.25)",  label: "ruhig" },
  aufmunternd:  { emoji: "😄", glow: "rgba(250,204,21,0.45)",  label: "aufmunternd" },
  neugierig:    { emoji: "🧐", glow: "rgba(168,85,247,0.35)",  label: "neugierig" },
  empathisch:   { emoji: "🤗", glow: "rgba(236,72,153,0.35)",  label: "empathisch" },
};

interface Props {
  emotion?: string | null;
  speaking?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function BaddiAvatar3D({ emotion, speaking, className, style }: Props) {
  const es = emotion ? EMOTION_STYLE[emotion] : undefined;
  const glow = speaking
    ? "0 0 0 4px rgba(99,102,241,0.4), 0 0 24px 6px rgba(99,102,241,0.25)"
    : es
    ? `0 0 18px 4px ${es.glow}`
    : "0 0 0 2px rgba(255,255,255,0.06)";

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-2 ${className ?? ""}`}
      style={style}
    >
      {/* Avatar-Kreis */}
      <div
        className="relative rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center transition-all duration-500"
        style={{ width: 80, height: 80, boxShadow: glow }}
      >
        {es ? (
          <span className="text-3xl select-none leading-none" role="img" aria-label={es.label}>
            {es.emoji}
          </span>
        ) : (
          <span className="text-white font-bold text-2xl select-none">B</span>
        )}
        {speaking && (
          <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500 opacity-20 pointer-events-none" />
        )}
      </div>

      {/* Emotion-Label */}
      {es && (
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all duration-500"
          style={{
            color: "rgba(255,255,255,0.7)",
            borderColor: "rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
          }}
        >
          {es.label}
        </span>
      )}
    </div>
  );
}
