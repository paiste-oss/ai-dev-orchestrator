"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  memory_consent: boolean;
  language: string;
  phone: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  address_country: string | null;
}

const LANGUAGES = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
];

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors";

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-white/5 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function UserSettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  // Profil-Felder
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("de");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Schweiz");

  // Passwort
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");

  // Status
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [msgPw, setMsgPw] = useState<{ text: string; ok: boolean } | null>(null);

  // UI-Präferenzen
  const [uiPrefs, setUiPrefs] = useState({
    fontSize: "normal", accentColor: "indigo", background: "dark",
    lineSpacing: "normal", language: "de", buddyName: "Baddi",
  });
  const [savingUi, setSavingUi] = useState(false);
  const [msgUi, setMsgUi] = useState<{ text: string; ok: boolean } | null>(null);

  // Gedächtnis
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeInput, setRevokeInput] = useState("");
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    apiFetch(`${BACKEND_URL}/v1/auth/me`)
      .then(r => r.json())
      .then((d: Me) => {
        setMe(d);
        setName(d.name ?? "");
        setLanguage(d.language ?? "de");
        setPhone(d.phone ?? "");
        setStreet(d.address_street ?? "");
        setZip(d.address_zip ?? "");
        setCity(d.address_city ?? "");
        setCountry(d.address_country ?? "Schweiz");
      });
    apiFetch(`${BACKEND_URL}/v1/user/preferences`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUiPrefs(p => ({ ...p, ...d })); });
  }, [router]);

  const saveUiPrefs = async () => {
    setSavingUi(true); setMsgUi(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
        method: "POST", body: JSON.stringify(uiPrefs),
      });
      if (res.ok) { setMsgUi({ text: "Gespeichert ✓", ok: true }); setTimeout(() => setMsgUi(null), 3000); }
      else setMsgUi({ text: "Fehler beim Speichern", ok: false });
    } finally { setSavingUi(false); }
  };

  const saveProfile = async () => {
    if (!me) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/me`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          language,
          phone: phone || null,
          address_street: street || null,
          address_zip: zip || null,
          address_city: city || null,
          address_country: country || null,
        }),
      });
      if (res.ok) {
        setMsg({ text: "Gespeichert ✓", ok: true });
        setTimeout(() => setMsg(null), 3000);
      } else {
        setMsg({ text: "Fehler beim Speichern", ok: false });
      }
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!pwNew || pwNew !== pwNew2) {
      setMsgPw({ text: "Passwörter stimmen nicht überein", ok: false });
      return;
    }
    setSavingPw(true);
    setMsgPw(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/auth/change-password`, {
        method: "POST",
        body: JSON.stringify({ current_password: pwCurrent, new_password: pwNew }),
      });
      if (res.ok) {
        setMsgPw({ text: "Passwort geändert ✓", ok: true });
        setPwCurrent(""); setPwNew(""); setPwNew2("");
        setTimeout(() => setMsgPw(null), 3000);
      } else {
        const e = await res.json().catch(() => ({}));
        setMsgPw({ text: e.detail ?? "Fehler", ok: false });
      }
    } finally {
      setSavingPw(false);
    }
  };

  const revokeMemory = async () => {
    if (!me || revokeInput !== "Lösche Langzeitdaten") return;
    setRevoking(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/me/memory-consent`, { method: "DELETE" });
      if (res.ok) setMe(m => m ? { ...m, memory_consent: false } : m);
    } finally {
      setRevoking(false);
      setRevokeOpen(false);
      setRevokeInput("");
    }
  };

  const enableMemory = async () => {
    if (!me) return;
    const res = await apiFetch(`${BACKEND_URL}/v1/customers/me`, {
      method: "PATCH",
      body: JSON.stringify({ memory_consent: true }),
    });
    if (res.ok) setMe(m => m ? { ...m, memory_consent: true } : m);
  };

  if (!me) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-500 text-sm">Lädt…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-5 py-8 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-xl transition-colors">←</button>
          <div>
            <h1 className="text-xl font-bold text-white">Einstellungen</h1>
            <p className="text-xs text-gray-500">{me.email}</p>
          </div>
        </div>

        {/* Chat-Aussehen */}
        <Section title="Chat anpassen" icon="🎨">
          <div className="space-y-5">

            {/* Buddy-Name */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 font-medium">Name des Baddies</label>
              <input
                value={uiPrefs.buddyName}
                onChange={e => setUiPrefs(p => ({ ...p, buddyName: e.target.value.slice(0, 30) }))}
                placeholder="Baddi"
                className={inputCls}
              />
              <p className="text-[11px] text-gray-600">So nennt sich dein KI-Assistent im Chat.</p>
            </div>

            {/* Sprache */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 font-medium">Chat-Sprache</label>
              <div className="grid grid-cols-4 gap-2">
                {[{ v: "de", l: "Deutsch" }, { v: "en", l: "English" }, { v: "fr", l: "Français" }, { v: "it", l: "Italiano" }].map(({ v, l }) => (
                  <button key={v} onClick={() => setUiPrefs(p => ({ ...p, language: v }))}
                    className={`py-2 rounded-xl text-xs font-medium border transition-all ${uiPrefs.language === v ? "bg-indigo-600 border-indigo-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Schriftgrösse */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 font-medium">Schriftgrösse</label>
              <div className="grid grid-cols-4 gap-2">
                {[{ v: "small", l: "Klein" }, { v: "normal", l: "Normal" }, { v: "large", l: "Gross" }, { v: "xlarge", l: "Sehr gross" }].map(({ v, l }) => (
                  <button key={v} onClick={() => setUiPrefs(p => ({ ...p, fontSize: v }))}
                    className={`py-2 rounded-xl text-xs font-medium border transition-all ${uiPrefs.fontSize === v ? "bg-indigo-600 border-indigo-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Akzentfarbe */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 font-medium">Akzentfarbe</label>
              <div className="flex gap-3">
                {[
                  { v: "indigo", color: "#6366f1" }, { v: "purple", color: "#a855f7" },
                  { v: "green", color: "#22c55e" }, { v: "orange", color: "#f97316" }, { v: "pink", color: "#ec4899" },
                ].map(({ v, color }) => (
                  <button key={v} onClick={() => setUiPrefs(p => ({ ...p, accentColor: v }))}
                    className={`w-9 h-9 rounded-full border-2 transition-all ${uiPrefs.accentColor === v ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"}`}
                    style={{ backgroundColor: color }} title={v} />
                ))}
              </div>
            </div>

            {/* Hintergrund */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 font-medium">Hintergrund</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ v: "dark", l: "Dunkel", bg: "#030712" }, { v: "darker", l: "Sehr dunkel", bg: "#000000" }, { v: "lighter", l: "Leicht hell", bg: "#111827" }].map(({ v, l, bg }) => (
                  <button key={v} onClick={() => setUiPrefs(p => ({ ...p, background: v }))}
                    className={`py-3 rounded-xl text-xs font-medium border transition-all ${uiPrefs.background === v ? "border-indigo-500 text-white" : "border-gray-700 text-gray-400 hover:text-white"}`}
                    style={{ backgroundColor: bg }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Zeilenabstand */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 font-medium">Zeilenabstand</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ v: "compact", l: "Kompakt" }, { v: "normal", l: "Normal" }, { v: "wide", l: "Weit" }].map(({ v, l }) => (
                  <button key={v} onClick={() => setUiPrefs(p => ({ ...p, lineSpacing: v }))}
                    className={`py-2 rounded-xl text-xs font-medium border transition-all ${uiPrefs.lineSpacing === v ? "bg-indigo-600 border-indigo-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {msgUi && <p className={`text-sm ${msgUi.ok ? "text-green-400" : "text-red-400"}`}>{msgUi.text}</p>}
            <button onClick={saveUiPrefs} disabled={savingUi}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 transition-colors">
              {savingUi ? "Wird gespeichert…" : "Einstellungen speichern"}
            </button>
            <p className="text-[11px] text-gray-600 text-center">Du kannst diese Einstellungen auch direkt im Chat per Spracheingabe ändern.</p>
          </div>
        </Section>

        {/* Profil */}
        <Section title="Profil" icon="👤">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Sprache</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className={inputCls}>
                {LANGUAGES.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Telefon</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+41 79 000 00 00" className={inputCls} />
            </div>
          </div>
        </Section>

        {/* Adresse */}
        <Section title="Adresse" icon="🏠">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Strasse & Hausnummer</label>
              <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Musterstrasse 1" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">PLZ</label>
                <input value={zip} onChange={e => setZip(e.target.value)} placeholder="8001" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Ort</label>
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="Zürich" className={inputCls} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Land</label>
              <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Schweiz" className={inputCls} />
            </div>
          </div>
        </Section>

        {/* Speichern */}
        <div className="flex items-center gap-3">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</span>
          )}
        </div>

        {/* Passwort */}
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
            {msgPw && (
              <p className={`text-sm ${msgPw.ok ? "text-green-400" : "text-red-400"}`}>{msgPw.text}</p>
            )}
            <button
              onClick={changePassword}
              disabled={savingPw || !pwCurrent || !pwNew || !pwNew2}
              className="w-full py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {savingPw ? "Wird geändert…" : "Passwort ändern"}
            </button>
          </div>
        </Section>

        {/* Langzeitgedächtnis */}
        <Section title="Langzeitgedächtnis" icon="🧠">
          <p className="text-sm text-gray-400 leading-relaxed">
            Damit Baddi dein Begleiter fürs Leben wird, merkt er sich wichtige Dinge über dich — Vorlieben, Erlebnisse, Ziele. Diese Daten werden sicher gespeichert und niemals an Dritte weitergegeben.
          </p>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
            me.memory_consent ? "border-yellow-500/30 bg-yellow-950/20" : "border-gray-700 bg-gray-800/30"
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${me.memory_consent ? "bg-yellow-400" : "bg-gray-600"}`} />
            <span className="text-sm font-medium text-gray-200 flex-1">
              {me.memory_consent ? "Aktiviert — Baddi baut sein Gedächtnis auf" : "Deaktiviert — Baddi merkt sich nichts"}
            </span>
          </div>
          {me.memory_consent ? (
            <button
              onClick={() => setRevokeOpen(true)}
              className="w-full px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors"
            >
              Langzeitgedächtnis widerrufen & Daten löschen
            </button>
          ) : (
            <button
              onClick={enableMemory}
              className="w-full px-4 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-semibold transition-colors"
            >
              Langzeitgedächtnis aktivieren
            </button>
          )}
        </Section>

      </div>

      {/* Widerruf Modal */}
      {revokeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setRevokeOpen(false); setRevokeInput(""); }} />
          <div className="relative bg-gray-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">⚠️</span>
              <div>
                <h3 className="font-bold text-white text-lg">Langzeitgedächtnis widerrufen</h3>
                <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                  Alle Daten im Langzeitgedächtnis werden
                  <span className="text-red-400 font-semibold"> unwiderruflich gelöscht</span>.
                  Baddi vergisst alles was er über dich gelernt hat.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-300">
                Schreibe <code className="text-red-400 font-mono bg-red-950/30 px-1 rounded">Lösche Langzeitdaten</code> und drücke Löschen.
              </p>
              <input
                type="text"
                value={revokeInput}
                onChange={e => setRevokeInput(e.target.value)}
                placeholder="Lösche Langzeitdaten"
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500/60 font-mono"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setRevokeOpen(false); setRevokeInput(""); }} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                Abbrechen
              </button>
              <button
                onClick={revokeMemory}
                disabled={revokeInput !== "Lösche Langzeitdaten" || revoking}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40"
              >
                {revoking ? "Wird gelöscht…" : "Löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
