import React from "react";

interface AvatarCircleProps {
  speaking: boolean;
  initial?: string;
}

export default function AvatarCircle({ speaking, initial }: AvatarCircleProps) {
  return (
    <div
      style={{ width: 32, height: 32 }}
      className={`relative rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
        speaking
          ? "shadow-[0_0_0_4px_rgba(99,102,241,0.35)] scale-105"
          : "shadow-[0_0_0_2px_rgba(255,255,255,0.08)]"
      }`}
    >
      <span className="text-white font-bold text-xs select-none">{initial ?? "B"}</span>
      {speaking && (
        <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500 opacity-20" />
      )}
    </div>
  );
}
