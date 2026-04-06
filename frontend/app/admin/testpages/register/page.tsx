"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1920 - 5 }, (_, i) => currentYear - 6 - i);

const LANGUAGES = [
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
];

export default function RegisterPreviewPage() {
  const router = useRouter();
  // Form-Zustand (nur für visuelle Vorschau — kein Submit)
  const [language, setLanguage] = useState("de");
  const [form, setForm] = useState({
    vorname: "", nachname: "",
    geburtstag: "", geburtsmonat: "", geburtsjahr: "",
    email: "", mobile: "", passwort: "", passwortBestaetigung: "",
  });
  const [tosAccepted, setTosAccepted] = useState(false);
  const [memoryConsent, setMemoryConsent] = useState(true);
  const [captchaInput, setCaptchaInput] = useState("");
  const captcha = { a: 7, b: 5 };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const u = getSession();
    if (!u || u.role !== "admin") router.replace("/login");
  }, []);

  return (
    <div className="flex flex-col overflow-hidden h-full min-w-0">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-gray-950">
          <button
            onClick={() => router.push("/admin/testpages")}
            className="text-gray-500 hover:text-white text-sm transition-colors"
          >
            ← Testseiten
          </button>
          <span className="text-gray-700">/</span>
          <h1 className="text-sm font-medium text-white">Registrierung — Vorschau</h1>
          <span className="ml-2 text-[10px] bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 px-2 py-0.5 rounded-full">
            Nur Vorschau · kein Submit
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto flex items-start justify-center p-8 bg-gray-950">
          <div className="w-full max-w-lg space-y-6">

            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">Registriere mich</h1>
                <p className="text-xs text-gray-500">Dein persönlicher KI-Begleiter</p>
              </div>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); }}
              className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-gray-400">Vorname</label>
                  <input value={form.vorname} onChange={(e) => set("vorname", e.target.value)}
                    placeholder="Anna"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-400">Nachname</label>
                  <input value={form.nachname} onChange={(e) => set("nachname", e.target.value)}
                    placeholder="Müller"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-400">Geburtsdatum</label>
                <div className="grid grid-cols-3 gap-2">
                  <select value={form.geburtstag} onChange={(e) => set("geburtstag", e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                    <option value="">Tag</option>
                    {DAYS.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                  </select>
                  <select value={form.geburtsmonat} onChange={(e) => set("geburtsmonat", e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                    <option value="">Monat</option>
                    {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                  </select>
                  <select value={form.geburtsjahr} onChange={(e) => set("geburtsjahr", e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                    <option value="">Jahr</option>
                    {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-400">E-Mail</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                  placeholder="anna@beispiel.ch"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-400">
                  Mobilnummer <span className="text-gray-600">(für 2FA-Schutz empfohlen)</span>
                </label>
                <input type="tel" value={form.mobile} onChange={(e) => set("mobile", e.target.value)}
                  placeholder="+41791234567"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                <p className="text-xs text-gray-600">Optional — ermöglicht SMS-Sicherheitscode beim Login</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-gray-400">Bevorzugte Sprache</label>
                <div className="grid grid-cols-5 gap-2">
                  {LANGUAGES.map(({ v, l }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setLanguage(v)}
                      className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                        language === v
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-400">Passwort <span className="text-gray-600">(min. 8 Zeichen)</span></label>
                <input type="password" value={form.passwort} onChange={(e) => set("passwort", e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-400">Passwort bestätigen</label>
                <input type="password" value={form.passwortBestaetigung}
                  onChange={(e) => set("passwortBestaetigung", e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-gray-800 border rounded-lg p-3 text-white focus:outline-none ${
                    form.passwortBestaetigung && form.passwort !== form.passwortBestaetigung
                      ? "border-red-500" : "border-gray-700 focus:border-indigo-500"
                  }`} />
                {form.passwortBestaetigung && form.passwort !== form.passwortBestaetigung && (
                  <p className="text-xs text-red-400">Passwörter stimmen nicht überein</p>
                )}
              </div>

              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 space-y-2">
                <label className="text-sm text-gray-300 font-medium">
                  Sicherheitsfrage: Was ist {captcha.a} + {captcha.b}?
                </label>
                <input type="number" value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)} placeholder="Antwort"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div className="space-y-3">
                <label className={`flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-colors ${
                  tosAccepted ? "border-indigo-500/50 bg-indigo-950/20" : "border-gray-700 bg-gray-800/30"
                }`}>
                  <input type="checkbox" checked={tosAccepted} onChange={e => setTosAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0" />
                  <span className="text-sm text-gray-300 leading-relaxed">
                    Ich akzeptiere die{" "}
                    <a href="/agb" className="text-indigo-400 hover:text-indigo-300 underline">AGB</a>
                    {" "}und die{" "}
                    <a href="/datenschutz" className="text-indigo-400 hover:text-indigo-300 underline">Datenschutzerklärung</a>.{" "}
                    <span className="text-red-400 text-xs">* Pflichtfeld</span>
                  </span>
                </label>

                <label className={`flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-colors ${
                  memoryConsent ? "border-yellow-500/40 bg-yellow-950/10" : "border-gray-700 bg-gray-800/30"
                }`}>
                  <input type="checkbox" checked={memoryConsent} onChange={e => setMemoryConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-yellow-400 shrink-0" />
                  <span className="text-sm text-gray-300 leading-relaxed">
                    <span className="text-yellow-400 font-medium">Langzeitgedächtnis</span>
                    {" — "}Damit Baddi dein Begleiter fürs Leben wird, merkt er sich wichtige Dinge über dich
                    (Vorlieben, Erlebnisse, Ziele). Stimmst du zu, dass Baddi sein Langzeitgedächtnis für
                    dich aufbaut?{" "}
                    <span className="text-gray-500 text-xs">Jederzeit widerrufbar.</span>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={!tosAccepted}
                className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
              >
                Konto erstellen →
              </button>

              <p className="text-center text-xs text-yellow-500/70 bg-yellow-500/5 border border-yellow-500/15 rounded-lg py-2">
                Vorschau-Modus — Formular wird nicht abgesendet
              </p>
            </form>

            <p className="text-center text-sm text-gray-600">
              Bereits registriert?{" "}
              <span className="text-indigo-400">Anmelden</span>
            </p>
          </div>
        </div>
    </div>
  );
}
