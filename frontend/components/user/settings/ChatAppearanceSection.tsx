"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Section } from "@/components/user/settings/Section";

interface UiPrefs {
  buddyName: string;
  avatarType: string;
  ttsDefault: boolean;
  ttsVoice: string;
}

const inputCls =
  "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--accent)] transition-colors";

export function ChatAppearanceSection() {
  const router = useRouter();
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>({
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
                    ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-text)]"
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
                    ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-text)]"
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
                    ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-text)]"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                <span className="text-xl">{icon}</span>
                <span>{l}</span>
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
          className="w-full py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] text-sm font-medium disabled:opacity-50 transition-colors"
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
