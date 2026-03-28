"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { UiPrefs } from "@/lib/chat-types";

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

const ACCENT_COLORS = [
  { v: "indigo", hex: "#6366f1" }, { v: "purple", hex: "#a855f7" },
  { v: "sky",    hex: "#0ea5e9" }, { v: "green",  hex: "#22c55e" },
  { v: "teal",   hex: "#14b8a6" }, { v: "orange", hex: "#f97316" },
  { v: "pink",   hex: "#ec4899" }, { v: "red",    hex: "#ef4444" },
  { v: "yellow", hex: "#eab308" }, { v: "white",  hex: "#e5e7eb" },
];

const BG_OPTIONS = [
  { v: "dark",    l: "Dunkel",      hex: "#030712" },
  { v: "darker",  l: "Tiefschwarz", hex: "#000000" },
  { v: "lighter", l: "Grau",        hex: "#111827" },
  { v: "slate",   l: "Slate",       hex: "#0f172a" },
  { v: "navy",    l: "Navy",        hex: "#0c1445" },
  { v: "forest",  l: "Forest",      hex: "#0a1a0f" },
  { v: "wine",    l: "Wine",        hex: "#1a0a12" },
  { v: "warm",    l: "Warm",        hex: "#1a1208" },
];

export default function DesignWindow({ prefs, onPrefsChange }: Props) {
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((patch: Partial<UiPrefs>) => {
    onPrefsChange(patch);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
        method: "POST",
        body: JSON.stringify({ ...prefs, ...patch }),
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

        <OptionRow label="Name des Baddies">
          <input
            value={prefs.buddyName}
            onChange={e => update({ buddyName: e.target.value.slice(0, 30) })}
            placeholder="Baddi"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25 transition-colors"
          />
        </OptionRow>

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
              <button key={bg.v} onClick={() => update({ background: bg.v })}
                className={`relative h-10 rounded-lg border transition-all ${
                  prefs.background === bg.v ? "border-white/40 ring-1 ring-white/20" : "border-white/8 hover:border-white/20"
                }`}
                style={{ backgroundColor: bg.hex }} title={bg.l}>
                {prefs.background === bg.v && (
                  <span className="absolute inset-0 flex items-center justify-center text-white/80">✓</span>
                )}
                <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-white/50">{bg.l}</span>
              </button>
            ))}
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
