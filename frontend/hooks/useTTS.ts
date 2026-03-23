"use client";

import { useState, useRef } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function stripMarkdown(text: string): string {
    return text
      // Tabellen-Zeilen entfernen (| ... | ... |)
      .replace(/^\|.*\|$/gm, "")
      // Tabellen-Trennzeilen (|---|---|)
      .replace(/^\|[-| :]+\|$/gm, "")
      // Bold/Italic (**text** / *text* / __text__ / _text_)
      .replace(/(\*{1,2}|_{1,2})(.+?)\1/g, "$2")
      // Emojis entfernen
      .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/gu, "")
      // Markdown-Links [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Inline-Code `code`
      .replace(/`([^`]+)`/g, "$1")
      // Überschriften # ## ###
      .replace(/^#{1,6}\s+/gm, "")
      // Mehrere Leerzeilen → eine
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function unlockAudio() {
    const unlock = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
    unlock.play().catch(() => {});
  }

  async function speak(text: string) {
    if (!ttsEnabled) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/tts`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch { /* TTS Fehler still */ }
  }

  return { speaking, setSpeaking, ttsEnabled, setTtsEnabled, audioRef, speak, stripMarkdown, unlockAudio };
}
