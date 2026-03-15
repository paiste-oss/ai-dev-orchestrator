"use client";

import { useVoiceInput } from "@/lib/useVoiceInput";

interface Props {
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  lang?: string;
  className?: string;
}

export default function VoiceButton({ onResult, onInterim, lang = "de-DE", className = "" }: Props) {
  const { listening, supported, toggle } = useVoiceInput({ lang, onResult, onInterim });

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? "Aufnahme stoppen" : "Spracheingabe starten"}
      className={`flex items-center justify-center rounded-xl transition-all ${
        listening
          ? "bg-red-600 hover:bg-red-500 animate-pulse text-white"
          : "bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
      } ${className}`}
    >
      {listening ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.364 9.172a.75.75 0 0 1 .75.75A7.003 7.003 0 0 1 12.75 17.93V20h2.25a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5H11.25v-2.07A7.003 7.003 0 0 1 4.886 10.922a.75.75 0 0 1 1.5 0 5.503 5.503 0 0 0 11 0 .75.75 0 0 1 .978-.682z"/>
        </svg>
      )}
    </button>
  );
}
