"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Section } from "@/components/user/settings/Section";

interface UiPrefs {
  fontSize: string;
  fontFamily: string;
  accentColor: string;
  background: string;
  lineSpacing: string;
  language: string;
  buddyName: string;
  avatarType: string;
  ttsDefault: boolean;
  ttsVoice: string;
}

const inputCls =
  "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors";

export function ChatAppearanceSection() {
  const router = useRouter();
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>({
    fontSize: "normal",
    fontFamily: "system",
    accentColor: "indigo",
    background: "dark",
    lineSpacing: "normal",
    language: "de",
    buddyName: "Baddi",
    avatarType: "robot",
    ttsDefault: false,
    ttsVoice: "female",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    apiFetch(`${BACKEND_URL}/v1/user/preferences`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setUiPrefs((p) => ({ ...p, ...d }));
      });
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
        method: "POST",
        body: JSON.stringify(uiPrefs),
      });
      if (res.ok) {
        router.refresh();
        setMsg({ text: "Gespeichert ✓", ok: true });
        setTimeout(() => setMsg(null), 3000);
      } else {
        setMsg({ text: "Fehler beim Speichern", ok: false });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Chat anpassen" icon="🎨">
      <div className="space-y-5">

        {/* Buddy-Name */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Name des Baddies</label>
          <input
            value={uiPrefs.buddyName}
            onChange={(e) =>
              setUiPrefs((p) => ({ ...p, buddyName: e.target.value.slice(0, 30) }))
            }
            placeholder="Baddi"
            className={inputCls}
          />
          <p className="text-[11px] text-gray-600">So nennt sich dein KI-Assistent im Chat.</p>
        </div>

        {/* Avatar */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Avatar</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "robot",        l: "Roboter",     icon: "🤖" },
              { v: "teekanne",     l: "Teekanne",    icon: "🫖" },
              { v: "lichtgestalt", l: "Lichtgestalt", icon: "✨" },
            ].map(({ v, l, icon }) => (
              <button
                key={v}
                onClick={() => setUiPrefs((p) => ({ ...p, avatarType: v }))}
                className={`py-2.5 rounded-xl text-xs font-medium border transition-all flex flex-col items-center gap-1 ${
                  uiPrefs.avatarType === v
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                <span className="text-xl">{icon}</span>
                <span>{l}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sprachausgabe */}
        <div className="space-y-3">
          <label className="text-xs text-gray-400 font-medium">Sprachausgabe</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: false, l: "Aus", icon: "🔇" },
              { v: true,  l: "An",  icon: "🔊" },
            ].map(({ v, l, icon }) => (
              <button
                key={String(v)}
                onClick={() => setUiPrefs((p) => ({ ...p, ttsDefault: v }))}
                className={`py-2.5 rounded-xl text-xs font-medium border transition-all flex flex-col items-center gap-1 ${
                  uiPrefs.ttsDefault === v
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                <span className="text-xl">{icon}</span>
                <span>{l}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-600">Standard beim Öffnen des Chats. Der 🔊-Button in der Eingabe schaltet jederzeit um.</p>

          <label className="text-xs text-gray-400 font-medium block pt-1">Stimme</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "female", l: "Weiblich", icon: "👩" },
              { v: "male",   l: "Männlich", icon: "👨" },
            ].map(({ v, l, icon }) => (
              <button
                key={v}
                onClick={() => setUiPrefs((p) => ({ ...p, ttsVoice: v }))}
                className={`py-2.5 rounded-xl text-xs font-medium border transition-all flex flex-col items-center gap-1 ${
                  uiPrefs.ttsVoice === v
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                <span className="text-xl">{icon}</span>
                <span>{l}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sprache */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Chat-Sprache</label>
          <div className="grid grid-cols-5 gap-2">
            {[
              { v: "de",  l: "Deutsch" },
              { v: "gsw", l: "Schweizerdeutsch" },
              { v: "en",  l: "English" },
              { v: "fr",  l: "Français" },
              { v: "it",  l: "Italiano" },
              { v: "es",  l: "Español" },
              { v: "pt",  l: "Português" },
              { v: "nl",  l: "Nederlands" },
              { v: "pl",  l: "Polski" },
              { v: "tr",  l: "Türkçe" },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setUiPrefs((p) => ({ ...p, language: v }))}
                className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                  uiPrefs.language === v
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Schriftgrösse */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Schriftgrösse</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { v: "small", l: "Klein" },
              { v: "normal", l: "Normal" },
              { v: "large", l: "Gross" },
              { v: "xlarge", l: "Sehr gross" },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setUiPrefs((p) => ({ ...p, fontSize: v }))}
                className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                  uiPrefs.fontSize === v
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Schriftart */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Schriftart</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "system",  l: "Standard",  sample: "Aa" },
              { v: "mono",    l: "Monospace",  sample: "Aa" },
              { v: "rounded", l: "Rund",       sample: "Aa" },
              { v: "serif",   l: "Serif",      sample: "Aa" },
            ].map(({ v, l, sample }) => (
              <button
                key={v}
                onClick={() => setUiPrefs((p) => ({ ...p, fontFamily: v }))}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all flex items-center gap-2 ${
                  uiPrefs.fontFamily === v
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
                style={{
                  fontFamily:
                    v === "system"  ? '-apple-system, BlinkMacSystemFont, "Inter", sans-serif' :
                    v === "mono"    ? '"JetBrains Mono", "Fira Code", monospace' :
                    v === "rounded" ? '"Nunito", "Varela Round", sans-serif' :
                    'Georgia, "Times New Roman", serif',
                }}
              >
                <span className="text-base">{sample}</span>
                <span>{l}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Akzentfarbe */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Akzentfarbe</label>
          <div className="flex gap-3">
            {[
              { v: "indigo", color: "#6366f1" },
              { v: "purple", color: "#a855f7" },
              { v: "green", color: "#22c55e" },
              { v: "orange", color: "#f97316" },
              { v: "pink", color: "#ec4899" },
            ].map(({ v, color }) => (
              <button
                key={v}
                onClick={() => setUiPrefs((p) => ({ ...p, accentColor: v }))}
                className={`w-9 h-9 rounded-full border-2 transition-all ${
                  uiPrefs.accentColor === v
                    ? "border-white scale-110"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
                style={{ backgroundColor: color }}
                title={v}
              />
            ))}
          </div>
        </div>

        {/* Hintergrund */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Hintergrund</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "dark", l: "Dunkel", bg: "#030712" },
              { v: "darker", l: "Sehr dunkel", bg: "#000000" },
              { v: "lighter", l: "Leicht hell", bg: "#111827" },
            ].map(({ v, l, bg }) => (
              <button
                key={v}
                onClick={() => setUiPrefs((p) => ({ ...p, background: v }))}
                className={`py-3 rounded-xl text-xs font-medium border transition-all ${
                  uiPrefs.background === v
                    ? "border-indigo-500 text-white"
                    : "border-gray-700 text-gray-400 hover:text-white"
                }`}
                style={{ backgroundColor: bg }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Zeilenabstand */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Zeilenabstand</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "compact", l: "Kompakt" },
              { v: "normal", l: "Normal" },
              { v: "wide", l: "Weit" },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setUiPrefs((p) => ({ ...p, lineSpacing: v }))}
                className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                  uiPrefs.lineSpacing === v
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {msg && (
          <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? "Wird gespeichert…" : "Einstellungen speichern"}
        </button>
        <p className="text-[11px] text-gray-600 text-center">
          Du kannst diese Einstellungen auch direkt im Chat per Spracheingabe ändern.
        </p>
      </div>
    </Section>
  );
}
