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
  indigo: "#6366f1", purple: "#a855f7", green: "#22c55e", orange: "#f97316", pink: "#ec4899",
};

export const BG_COLORS: Record<string, string> = {
  dark: "#030712", darker: "#000000", lighter: "#111827",
};

const DEFAULT_PREFS: UiPrefs = {
  fontSize: "normal",
  fontFamily: "system",
  accentColor: "indigo",
  background: "dark",
  lineSpacing: "normal",
  language: "de",
  buddyName: "Baddi",
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

  return { uiPrefs, setUiPrefs, loadPreferences, FONT_SIZES, FONT_FAMILIES, LINE_SPACINGS, ACCENT_COLORS, BG_COLORS };
}
