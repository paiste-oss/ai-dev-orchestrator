"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Section } from "@/components/user/settings/Section";

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors";

export function PasswordSection() {
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const changePassword = async () => {
    if (!pwNew || pwNew !== pwNew2) { setMsg({ text: "Passwörter stimmen nicht überein", ok: false }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/auth/change-password`, {
        method: "POST",
        body: JSON.stringify({ current_password: pwCurrent, new_password: pwNew }),
      });
      if (res.ok) {
        setMsg({ text: "Passwort geändert ✓", ok: true });
        setPwCurrent(""); setPwNew(""); setPwNew2("");
        setTimeout(() => setMsg(null), 3000);
      } else {
        const e = await res.json().catch(() => ({}));
        setMsg({ text: e.detail ?? "Fehler", ok: false });
      }
    } finally { setSaving(false); }
  };

  return (
    <Section title="Passwort ändern" icon="🔐">
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Aktuelles Passwort</label>
          <input type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Neues Passwort</label>
          <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Neues Passwort wiederholen</label>
          <input type="password" value={pwNew2} onChange={e => setPwNew2(e.target.value)} className={inputCls} />
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
        <button onClick={changePassword} disabled={saving || !pwCurrent || !pwNew || !pwNew2}
          className="w-full py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors disabled:opacity-40">
          {saving ? "Wird geändert…" : "Passwort ändern"}
        </button>
      </div>
    </Section>
  );
}
