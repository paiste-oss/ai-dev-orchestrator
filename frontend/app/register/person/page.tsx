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

export default function RegisterMenschen() {
  const router = useRouter();
  const captcha = useMathCaptcha();

  const [form, setForm] = useState({
    vorname: "", nachname: "",
    geburtstag: "", geburtsmonat: "", geburtsjahr: "",
    email: "", passwort: "", passwortBestaetigung: "",
    website: "", // honeypot
  });
  const [captchaInput, setCaptchaInput] = useState("");
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

    if (form.website) return; // honeypot triggered

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

    const birth = Number(form.geburtsjahr);

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${form.vorname} ${form.nachname}`.trim(),
          email: form.email,
          password: form.passwort,
          segment: "menschen",
          birth_year: birth || null,
          birth_date: birthDateString,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Registrierung fehlgeschlagen.");
        return;
      }

      saveToken(data.access_token);
      saveSession({ name: data.name, email: data.email, role: data.role });
      setSuccess(true);
    } catch {
      setError("Server nicht erreichbar. Bitte später nochmals versuchen.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-rose-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl">🧑</div>
          <h2 className="text-2xl font-bold text-rose-300">Willkommen, {form.vorname}!</h2>
          <p className="text-gray-300">
            Dein persönlicher Baddi wird gerade für dich eingerichtet ✨
          </p>
          <button onClick={() => router.push("/chat")}
            className="w-full bg-rose-700 hover:bg-rose-600 py-3 rounded-xl font-bold transition-colors">
            Los geht&apos;s →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="text-gray-500 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-2xl font-bold text-rose-300">🧑 Registrierung Menschen</h1>
            <p className="text-xs text-gray-500">Dein persönlicher KI-Begleiter</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">

          {/* Honeypot — invisible to humans */}
          <input type="text" name="website" value={form.website}
            onChange={(e) => set("website", e.target.value)}
            style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Vorname</label>
              <input required value={form.vorname} onChange={(e) => set("vorname", e.target.value)}
                placeholder="Anna"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-rose-500" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Nachname</label>
              <input required value={form.nachname} onChange={(e) => set("nachname", e.target.value)}
                placeholder="Müller"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-rose-500" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Geburtsdatum</label>
            <div className="grid grid-cols-3 gap-2">
              <select required value={form.geburtstag} onChange={(e) => set("geburtstag", e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-rose-500">
                <option value="">Tag</option>
                {DAYS.map((d) => (
                  <option key={d} value={String(d)}>{d}</option>
                ))}
              </select>
              <select required value={form.geburtsmonat} onChange={(e) => set("geburtsmonat", e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-rose-500">
                <option value="">Monat</option>
                {MONTHS.map((m, i) => (
                  <option key={i} value={String(i + 1)}>{m}</option>
                ))}
              </select>
              <select required value={form.geburtsjahr} onChange={(e) => set("geburtsjahr", e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-rose-500">
                <option value="">Jahr</option>
                {YEARS.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {assignedUseCase && (
            <div className={`${assignedUseCase.bgColor} border ${assignedUseCase.borderColor} rounded-xl p-4 flex items-center gap-3`}>
              <span className="text-3xl">{assignedUseCase.icon}</span>
              <div>
                <p className={`font-bold text-sm ${assignedUseCase.color}`}>Dein Baddi: {assignedUseCase.buddyName}</p>
                <p className="text-xs text-gray-400">{assignedUseCase.name} · {assignedUseCase.tagline}</p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm text-gray-400">E-Mail</label>
            <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              placeholder="anna@beispiel.ch"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-rose-500" />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort <span className="text-gray-600">(min. 8 Zeichen)</span></label>
            <input required type="password" value={form.passwort} minLength={8}
              onChange={(e) => set("passwort", e.target.value)} placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-rose-500" />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort bestätigen</label>
            <input required type="password" value={form.passwortBestaetigung}
              onChange={(e) => set("passwortBestaetigung", e.target.value)} placeholder="••••••••"
              className={`w-full bg-gray-800 border rounded-lg p-3 text-white focus:outline-none ${
                form.passwortBestaetigung && form.passwort !== form.passwortBestaetigung
                  ? "border-red-500" : "border-gray-700 focus:border-rose-500"
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
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-rose-500" />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-800/50 rounded-lg px-4 py-3">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-rose-700 hover:bg-rose-600 py-3 rounded-xl font-bold transition-colors disabled:opacity-50">
            {loading ? "Wird registriert…" : "Konto erstellen →"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Bereits registriert?{" "}
          <button onClick={() => router.push("/login")} className="text-rose-400 hover:text-rose-300">Anmelden</button>
        </p>
      </div>
    </main>
  );
}
