import React from "react";

interface AvatarCircleProps {
  speaking: boolean;
  initial?: string;
}

export default function AvatarCircle({ speaking, initial }: AvatarCircleProps) {
  return (
    <div
      style={{ width: 32, height: 32 }}
      className={`relative rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
        speaking
          ? "scale-105"
          : "shadow-[0_0_0_2px_rgba(255,255,255,0.08)]"
      }`}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, var(--accent) 60%, white), var(--accent))`,
        boxShadow: speaking ? "0 0 0 4px var(--accent-30)" : undefined,
      }}
    >
      <span className="text-white font-bold text-xs select-none">{initial ?? "B"}</span>
      {speaking && (
        <span className="absolute inset-0 rounded-full animate-ping bg-[var(--accent)] opacity-20" />
      )}
    </div>
  );
}
