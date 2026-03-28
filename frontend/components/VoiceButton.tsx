"use client";

import { useVoiceInput } from "@/lib/useVoiceInput";

interface Props {
  onResult: (text: string) => void;
  lang?: string;
  className?: string;
}

const ERROR_LABELS: Record<string, string> = {
  "not-allowed":   "Mikrofon verweigert",
  "no-speech":     "Nichts gehört",
  "network":       "Netzwerkfehler",
  "not-supported": "Nicht unterstützt",
};

export default function VoiceButton({ onResult, lang = "de-CH", className = "" }: Props) {
  const { listening, supported, error, toggle } = useVoiceInput({ lang, onResult });

  if (!supported) return null;

  return (
    <div className="relative flex items-center justify-center">
      <button
        type="button"
        onClick={toggle}
        title={listening ? "Aufnahme stoppen" : "Spracheingabe starten"}
        className={`flex items-center justify-center rounded-xl transition-all ${
          error
            ? "bg-orange-600/80 text-white"
            : listening
            ? "bg-red-600 hover:bg-red-500 animate-pulse text-white"
            : "bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
        } ${className}`}
      >
        {listening ? (
          /* Stop-Quadrat */
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="5" width="14" height="14" rx="2" />
          </svg>
        ) : (
          /* Mikrofon */
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.364 9.172a.75.75 0 0 1 .75.75A7.003 7.003 0 0 1 12.75 17.93V20h2.25a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5H11.25v-2.07A7.003 7.003 0 0 1 4.886 10.922a.75.75 0 0 1 1.5 0 5.503 5.503 0 0 0 11 0 .75.75 0 0 1 .978-.682z"/>
          </svg>
        )}
      </button>

      {/* Fehler-Tooltip */}
      {error && (
        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 border border-orange-500/40 text-orange-300 text-[10px] px-2 py-1 rounded-lg shadow-lg pointer-events-none z-50">
          {ERROR_LABELS[error] ?? error}
        </div>
      )}
    </div>
  );
}
