"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { UiPrefs } from "@/lib/chat-types";

export const FONT_SIZES: Record<string, string> = {
  small: "13px", normal: "15px", large: "18px", xlarge: "21px",
};

export const FONT_FAMILIES: Record<string, string> = {
  system:  '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
  mono:    '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  rounded: '"Nunito", "Varela Round", "Quicksand", sans-serif',
  serif:   'Georgia, "Times New Roman", serif',
};

export const LINE_SPACINGS: Record<string, string> = {
  compact: "1.4", normal: "1.625", wide: "2",
};

export const ACCENT_COLORS: Record<string, string> = {
  indigo: "#6366f1", purple: "#a855f7", sky: "#0ea5e9", green: "#22c55e",
  teal: "#14b8a6", orange: "#f97316", pink: "#ec4899", red: "#ef4444",
  yellow: "#eab308", white: "#e5e7eb",
};

export const CHAT_WIDTHS: Record<string, string> = {
  compact: "55%", normal: "75%", wide: "90%", full: "100%",
};

export const FONT_COLORS: Record<string, string> = {
  white: "#ffffff", silver: "#e2e8f0", warm: "#fef3c7",
  green: "#bbf7d0", blue: "#bfdbfe", rose: "#fecdd3", black: "#111111",
};

export const WINDOW_BG_COLORS: Record<string, string> = {
  glass:   "rgba(8, 12, 22, 0.92)",
  dark:    "rgba(0, 0, 0, 0.95)",
  slate:   "rgba(15, 23, 42, 0.92)",
  gray:    "rgba(17, 24, 39, 0.92)",
  indigo:  "rgba(30, 27, 75, 0.92)",
  navy:    "rgba(12, 20, 69, 0.92)",
  wine:    "rgba(40, 10, 25, 0.92)",
  forest:  "rgba(10, 26, 15, 0.92)",
  white:   "rgba(255, 255, 255, 0.95)",
};

// Solid-Farben für die Kugel-Darstellung im DesignWindow
export const WINDOW_BG_SOLID: Record<string, string> = {
  glass:   "#080c16",
  dark:    "#000000",
  slate:   "#0f172a",
  gray:    "#111827",
  indigo:  "#1e1b4b",
  navy:    "#0c1445",
  wine:    "#28091a",
  forest:  "#0a1a0f",
  white:   "#ffffff",
};

export const BG_COLORS: Record<string, string> = {
  dark: "#030712", darker: "#000000", lighter: "#111827",
  slate: "#0f172a", navy: "#0c1445", forest: "#0a1a0f", wine: "#1a0a12", warm: "#1a1208",
  white: "#ffffff",
};

const DEFAULT_PREFS: UiPrefs = {
  fontSize: "normal",
  fontFamily: "system",
  accentColor: "indigo",
  background: "dark",
  lineSpacing: "normal",
  language: "de",
  buddyName: "Baddi",
  chatWidth: "normal",
  showTimestamps: "hover",
  fontColor: "white",
  chatMode: "fokus",
  avatarType: "robot",
  ttsDefault: false,
  ttsVoice: "female",
  windowBg: "glass",
};

export function useUiPrefs() {
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    localStorage.setItem("ui_fontSize", uiPrefs.fontSize);
  }, [uiPrefs.fontSize]);

  async function loadPreferences() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/user/preferences`);
      if (res.ok) {
        const prefs = await res.json();
        setUiPrefs(p => ({ ...p, ...prefs }));
      }
    } catch { /* ignore */ }
  }

  async function savePreferences(partial: Partial<UiPrefs>) {
    setUiPrefs(p => ({ ...p, ...partial }));
    try {
      await apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
    } catch { /* ignore */ }
  }

  return { uiPrefs, setUiPrefs, loadPreferences, savePreferences, FONT_SIZES, FONT_FAMILIES, LINE_SPACINGS, ACCENT_COLORS, BG_COLORS, FONT_COLORS };
}
