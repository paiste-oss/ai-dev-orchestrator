"use client";

import React, { useCallback } from "react";
import dynamic from "next/dynamic";
import FileDropZone, { AttachedFile } from "@/components/FileDropZone";
import { FONT_SIZES } from "@/hooks/useUiPrefs";
import { getWhisperPrompt } from "@/lib/whisperPrompts";

const VoiceButton = dynamic(() => import("@/components/VoiceButton"), { ssr: false });

interface ChatInputProps {
  input: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  loading: boolean;
  attachedFiles: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
  onAttachClick: () => void;
  onCameraClick: () => void;
  onVoiceResult: (text: string) => void;
  buddyName: string;
  fontSize: string;
  voiceLang?: string;
  language?: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  compact?: boolean;
}

export default function ChatInput({
  input, onChange, onSend, onKeyDown, loading,
  attachedFiles, onFilesChange, onAttachClick, onCameraClick,
  onVoiceResult, buddyName, fontSize, voiceLang, language, textareaRef, compact = false,
}: ChatInputProps) {
  const handleVoiceResult = useCallback(onVoiceResult, [onVoiceResult]);
  const whisperPrompt = getWhisperPrompt(language, "chat");

  return (
    <div className={compact ? "shrink-0 px-2 pb-1 pt-0.5" : "shrink-0 px-4 pb-6 pt-3"}>
      <div className="max-w-3xl mx-auto w-full">
        {/* File chips above */}
        <FileDropZone
          files={attachedFiles}
          onFilesChange={onFilesChange}
          compact
          className="mb-2"
        />

        {/* Glass input card */}
        <div className="bg-gray-900/80 backdrop-blur border border-white/8 rounded-2xl shadow-xl focus-within:border-indigo-500/40 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Nachricht an ${buddyName}…`}
            className="w-full bg-transparent resize-none outline-none text-sm text-white placeholder-gray-500 px-4 pt-3.5 pb-2 max-h-40"
            style={{ fontSize: FONT_SIZES[fontSize] ?? "15px" }}
          />

          {/* Bottom bar */}
          <div className={`flex items-center justify-between px-2 ${compact ? "pt-0.5 pb-1" : "pt-1 pb-3"}`}>
            {/* Left: attach + camera */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onAttachClick}
                title="Datei oder Bild anhängen"
                className={`${compact ? "w-7 h-7" : "w-8 h-8"} flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/8 transition-all`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={onCameraClick}
                title="Foto aufnehmen"
                className={`${compact ? "w-7 h-7" : "w-8 h-8"} flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/8 transition-all`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
            </div>

            {/* Right: voice + send */}
            <div className="flex items-center gap-2">
              <VoiceButton
                onResult={handleVoiceResult}
                lang={voiceLang}
                prompt={whisperPrompt}
                className={compact ? "w-7 h-7" : "w-8 h-8"}
              />
              <button
                onClick={onSend}
                disabled={loading || (!input.trim() && attachedFiles.length === 0)}
                className={`${compact ? "w-7 h-7" : "w-8 h-8"} flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 text-white`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {!compact && (
          <p className="text-xs text-gray-700 mt-2 text-center">
            Enter senden · Shift+Enter Zeilenumbruch
          </p>
        )}
      </div>
    </div>
  );
}
