"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { UiPrefs } from "@/lib/chat-types";
import { ACCENT_COLORS as ACCENT_COLORS_MAP, BG_COLORS, FONT_COLORS } from "@/hooks/useUiPrefs";

interface Props {
  prefs: UiPrefs;
  onPrefsChange: (patch: Partial<UiPrefs>) => void;
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

function Chips({ options, value, onChange }: {
  options: { v: string; l: string; style?: React.CSSProperties }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={o.style}
          className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
            value === o.v
              ? "bg-white/10 border-white/30 text-white font-medium"
              : "border-white/8 text-gray-400 hover:text-gray-200 hover:border-white/15"
          }`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

// Abgeleitet aus zentralem useUiPrefs — kein Duplikat
const ACCENT_COLORS = Object.entries(ACCENT_COLORS_MAP).map(([v, hex]) => ({ v, hex }));

const FONT_COLOR_LABELS: Record<string, string> = {
  white: "Weiss", silver: "Silber", warm: "Warm", green: "Grün", blue: "Blau", rose: "Rosa", black: "Schwarz",
};
const FONT_COLOR_OPTIONS = Object.entries(FONT_COLORS).map(([v, hex]) => ({ v, hex, l: FONT_COLOR_LABELS[v] ?? v }));

const BG_LABELS: Record<string, string> = {
  dark: "Dunkel", darker: "Tiefschwarz", lighter: "Grau",
  slate: "Slate", navy: "Navy", forest: "Forest", wine: "Wine", warm: "Warm", white: "Weiss",
};
const BG_OPTIONS = Object.entries(BG_COLORS).map(([v, hex]) => ({ v, hex, l: BG_LABELS[v] ?? v }));

export default function DesignWindow({ prefs, onPrefsChange }: Props) {
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.onload = () => {
      const maxW = 1920, maxH = 1080;
      let { width, height } = img;
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      update({ backgroundImage: dataUrl, background: "dark" });
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  }

  const update = useCallback((patch: Partial<UiPrefs>) => {
    onPrefsChange(patch);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // backgroundImage nur senden wenn es sich geändert hat (spart Bandbreite)
      const { backgroundImage: _bg, ...rest } = { ...prefs, ...patch };
      const body: Record<string, unknown> = { ...rest };
      if ("backgroundImage" in patch) {
        // undefined/null → "" (Signal zum Löschen); sonst den neuen Wert
        body.backgroundImage = patch.backgroundImage ?? "";
      }
      await apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 400);
  }, [onPrefsChange, prefs]);

  return (
    <div className="h-full flex flex-col overflow-hidden text-white">
      <div className="px-4 py-2.5 border-b border-white/5 shrink-0 flex items-center justify-between">
        <p className="text-xs text-gray-500">Erscheinungsbild des Chats</p>
        <span className={`text-[10px] transition-opacity duration-300 ${saved ? "text-green-400 opacity-100" : "opacity-0"}`}>
          Gespeichert ✓
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        <OptionRow label="Sprache">
          <Chips value={prefs.language} onChange={v => update({ language: v })} options={[
            { v: "de", l: "Deutsch" }, { v: "en", l: "English" },
            { v: "fr", l: "Français" }, { v: "it", l: "Italiano" },
            { v: "gsw", l: "Schweizerdeutsch" },
          ]} />
        </OptionRow>

        <OptionRow label="Hintergrund">
          <div className="grid grid-cols-4 gap-1.5">
            {BG_OPTIONS.map(bg => (
              <button key={bg.v} onClick={() => update({ background: bg.v, backgroundImage: "" as UiPrefs["backgroundImage"] })}
                className={`relative h-10 rounded-lg border transition-all ${
                  prefs.background === bg.v && !prefs.backgroundImage ? "border-white/40 ring-1 ring-white/20" : "border-white/8 hover:border-white/20"
                }`}
                style={{ backgroundColor: bg.hex }} title={bg.l}>
                {prefs.background === bg.v && !prefs.backgroundImage && (
                  <span className="absolute inset-0 flex items-center justify-center text-white/80">✓</span>
                )}
                <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-white/50">{bg.l}</span>
              </button>
            ))}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <div className="flex gap-2 mt-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border text-xs transition-all ${
                prefs.backgroundImage ? "border-white/40 ring-1 ring-white/20 text-white" : "border-white/8 text-gray-400 hover:text-gray-200 hover:border-white/20"
              }`}
            >
              {prefs.backgroundImage ? (
                <>
                  <img src={prefs.backgroundImage} alt="" className="w-5 h-5 rounded object-cover" />
                  Bild aktiv
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Bild hochladen
                </>
              )}
            </button>
            {prefs.backgroundImage && (
              <button
                onClick={() => update({ backgroundImage: "" as UiPrefs["backgroundImage"] })}
                className="px-3 h-10 rounded-lg border border-white/8 text-xs text-gray-400 hover:text-red-400 hover:border-red-500/30 transition-all"
              >
                Entfernen
              </button>
            )}
          </div>
        </OptionRow>

        <OptionRow label="Akzentfarbe">
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map(c => (
              <button key={c.v} onClick={() => update({ accentColor: c.v })}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  prefs.accentColor === c.v ? "border-white scale-110" : "border-transparent opacity-50 hover:opacity-90"
                }`}
                style={{ backgroundColor: c.hex }} title={c.v} />
            ))}
          </div>
        </OptionRow>

        <OptionRow label="Schriftfarbe">
          <div className="flex flex-wrap gap-2">
            {FONT_COLOR_OPTIONS.map(c => (
              <button key={c.v} onClick={() => update({ fontColor: c.v })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                  prefs.fontColor === c.v
                    ? "bg-white/10 border-white/30 font-medium"
                    : "border-white/8 text-gray-400 hover:text-gray-200 hover:border-white/15"
                }`}
                style={{ color: c.hex }}>
                <span className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: c.hex }} />
                {c.l}
              </button>
            ))}
          </div>
        </OptionRow>

        <OptionRow label="Schriftgrösse">
          <Chips value={prefs.fontSize} onChange={v => update({ fontSize: v })} options={[
            { v: "small", l: "Klein" }, { v: "normal", l: "Normal" },
            { v: "large", l: "Gross" }, { v: "xlarge", l: "Sehr gross" },
          ]} />
        </OptionRow>

        <OptionRow label="Schriftart">
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { v: "system",  l: "Standard",  font: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif' },
              { v: "mono",    l: "Monospace", font: '"JetBrains Mono", "Fira Code", monospace' },
              { v: "rounded", l: "Rund",      font: '"Nunito", "Varela Round", sans-serif' },
              { v: "serif",   l: "Serif",     font: 'Georgia, "Times New Roman", serif' },
            ].map(f => (
              <button key={f.v} onClick={() => update({ fontFamily: f.v })}
                style={{ fontFamily: f.font }}
                className={`px-3 py-2 rounded-lg text-xs border transition-all ${
                  prefs.fontFamily === f.v
                    ? "bg-white/10 border-white/30 text-white"
                    : "border-white/8 text-gray-400 hover:text-gray-200 hover:border-white/15"
                }`}>
                Aa · {f.l}
              </button>
            ))}
          </div>
        </OptionRow>

        <OptionRow label="Nachrichtenbreite">
          <Chips value={prefs.chatWidth} onChange={v => update({ chatWidth: v })} options={[
            { v: "compact", l: "Kompakt" }, { v: "normal", l: "Normal" },
            { v: "wide", l: "Breit" }, { v: "full", l: "Voll" },
          ]} />
        </OptionRow>

        <OptionRow label="Nachrichten-Stil">
          <Chips value={prefs.bubbleStyle} onChange={v => update({ bubbleStyle: v })} options={[
            { v: "rounded", l: "Abgerundet" }, { v: "flat", l: "Flach" }, { v: "minimal", l: "Minimal" },
          ]} />
        </OptionRow>

        <OptionRow label="Zeilenabstand">
          <Chips value={prefs.lineSpacing} onChange={v => update({ lineSpacing: v })} options={[
            { v: "compact", l: "Kompakt" }, { v: "normal", l: "Normal" }, { v: "wide", l: "Weit" },
          ]} />
        </OptionRow>

        <OptionRow label="Zeitstempel">
          <Chips value={prefs.showTimestamps} onChange={v => update({ showTimestamps: v })} options={[
            { v: "always", l: "Immer" }, { v: "hover", l: "Beim Hover" }, { v: "never", l: "Nie" },
          ]} />
        </OptionRow>

      </div>
    </div>
  );
}
