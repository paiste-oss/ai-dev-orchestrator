"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/config";
import { saveSession, saveToken } from "@/lib/auth";

function useMathCaptcha() {
  return useMemo(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, answer: a + b };
  }, []);
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1920 - 5 }, (_, i) => currentYear - 6 - i);

export default function RegisterPage() {
  const router = useRouter();
  const captcha = useMathCaptcha();

  const [form, setForm] = useState({
    vorname: "", nachname: "",
    geburtstag: "", geburtsmonat: "", geburtsjahr: "",
    email: "", passwort: "", passwortBestaetigung: "",
    website: "",
  });
  const [captchaInput, setCaptchaInput] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [memoryConsent, setMemoryConsent] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const birthDateString = form.geburtstag && form.geburtsmonat && form.geburtsjahr
    ? `${form.geburtsjahr}-${String(Number(form.geburtsmonat)).padStart(2, "0")}-${String(Number(form.geburtstag)).padStart(2, "0")}`
    : null;

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError("");

    if (form.website) return;

    if (!tosAccepted) {
      setError("Bitte AGB und Datenschutzerklärung akzeptieren.");
      return;
    }
    if (parseInt(captchaInput) !== captcha.answer) {
      setError("Sicherheitsfrage falsch. Bitte nochmals versuchen.");
      return;
    }
    if (!form.geburtstag || !form.geburtsmonat || !form.geburtsjahr) {
      setError("Bitte vollständiges Geburtsdatum angeben.");
      return;
    }
    if (form.passwort !== form.passwortBestaetigung) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    if (form.passwort.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${form.vorname} ${form.nachname}`.trim(),
          email: form.email,
          password: form.passwort,
          birth_year: Number(form.geburtsjahr) || null,
          birth_date: birthDateString,
          tos_accepted: tosAccepted,
          memory_consent: memoryConsent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Registrierung fehlgeschlagen.");
        return;
      }

      saveToken(data.access_token);
      saveSession({ name: data.name, email: data.email, role: data.role });
      router.push(`/register/plan?name=${encodeURIComponent(form.vorname)}`);
    } catch {
      setError("Server nicht erreichbar. Bitte später nochmals versuchen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">

        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="text-gray-500 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-2xl font-bold text-white">Registriere mich</h1>
            <p className="text-xs text-gray-500">Dein persönlicher KI-Begleiter</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">

          <input type="text" name="website" value={form.website}
            onChange={(e) => set("website", e.target.value)}
            style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Vorname</label>
              <input required value={form.vorname} onChange={(e) => set("vorname", e.target.value)}
                placeholder="Anna"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Nachname</label>
              <input required value={form.nachname} onChange={(e) => set("nachname", e.target.value)}
                placeholder="Müller"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Geburtsdatum</label>
            <div className="grid grid-cols-3 gap-2">
              <select required value={form.geburtstag} onChange={(e) => set("geburtstag", e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                <option value="">Tag</option>
                {DAYS.map((d) => <option key={d} value={String(d)}>{d}</option>)}
              </select>
              <select required value={form.geburtsmonat} onChange={(e) => set("geburtsmonat", e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                <option value="">Monat</option>
                {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
              </select>
              <select required value={form.geburtsjahr} onChange={(e) => set("geburtsjahr", e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                <option value="">Jahr</option>
                {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">E-Mail</label>
            <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              placeholder="anna@beispiel.ch"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort <span className="text-gray-600">(min. 8 Zeichen)</span></label>
            <input required type="password" value={form.passwort} minLength={8}
              onChange={(e) => set("passwort", e.target.value)} placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort bestätigen</label>
            <input required type="password" value={form.passwortBestaetigung}
              onChange={(e) => set("passwortBestaetigung", e.target.value)} placeholder="••••••••"
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
            <input required type="number" value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)} placeholder="Antwort"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
          </div>

          {/* Einwilligungen */}
          <div className="space-y-3">
            <label className={`flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-colors ${
              tosAccepted ? "border-indigo-500/50 bg-indigo-950/20" : "border-gray-700 bg-gray-800/30"
            }`}>
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={e => setTosAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0"
              />
              <span className="text-sm text-gray-300 leading-relaxed">
                Ich akzeptiere die{" "}
                <button type="button" onClick={() => window.open("/datenschutz", "_blank")}
                  className="text-indigo-400 hover:text-indigo-300 underline">
                  AGB und Datenschutzerklärung
                </button>
                .{" "}
                <span className="text-red-400 text-xs">*&nbsp;Pflichtfeld</span>
              </span>
            </label>

            <label className={`flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-colors ${
              memoryConsent ? "border-yellow-500/40 bg-yellow-950/10" : "border-gray-700 bg-gray-800/30"
            }`}>
              <input
                type="checkbox"
                checked={memoryConsent}
                onChange={e => setMemoryConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-yellow-400 shrink-0"
              />
              <span className="text-sm text-gray-300 leading-relaxed">
                <span className="text-yellow-400 font-medium">Langzeitgedächtnis</span>
                {" — "}Damit Baddi dein Begleiter fürs Leben wird, merkt er sich wichtige Dinge über dich
                (Vorlieben, Erlebnisse, Ziele). Stimmst du zu, dass Baddi sein Langzeitgedächtnis für
                dich aufbaut?
                {" "}<span className="text-gray-500 text-xs">Jederzeit widerrufbar.</span>
              </span>
            </label>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-800/50 rounded-lg px-4 py-3">{error}</p>
          )}

          <button type="submit" disabled={loading || !tosAccepted}
            className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition-colors disabled:opacity-50">
            {loading ? "Wird registriert…" : "Konto erstellen →"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Bereits registriert?{" "}
          <button onClick={() => router.push("/login")} className="text-indigo-400 hover:text-indigo-300">Anmelden</button>
        </p>
      </div>
    </main>
  );
}
