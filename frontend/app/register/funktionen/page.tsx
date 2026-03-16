"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/config";
import { saveSession, saveToken } from "@/lib/auth";

const FUNKTIONEN = [
  { id: "funktion-dokumente", label: "Dokument-Analyse",   icon: "📄", desc: "PDFs, Word, Excel analysieren & zusammenfassen" },
  { id: "funktion-chat",      label: "KI-Chat",            icon: "💬", desc: "Intelligente Konversationen & Beratung" },
  { id: "funktion-sprache",   label: "Sprach-Assistent",   icon: "🎙️", desc: "Sprachsteuerung & Voice-to-Text" },
  { id: "funktion-workflow",  label: "Automatisierungen",  icon: "⚙️", desc: "n8n-Workflows & Prozessautomatisierung" },
  { id: "funktion-uebersetzung", label: "Übersetzung",     icon: "🌐", desc: "Mehrsprachige Kommunikation" },
  { id: "funktion-wissen",    label: "Wissensdatenbank",   icon: "🧠", desc: "Eigene Dokumente als KI-Wissensbasis" },
];

function useMathCaptcha() {
  return useMemo(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, answer: a + b };
  }, []);
}

export default function RegisterFunktionen() {
  const router = useRouter();
  const captcha = useMathCaptcha();

  const [form, setForm] = useState({
    name: "", email: "", organisation: "",
    passwort: "", passwortBestaetigung: "",
    website: "", // honeypot
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [captchaInput, setCaptchaInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toggleFunktion = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError("");

    if (form.website) return;

    if (parseInt(captchaInput) !== captcha.answer) {
      setError("Sicherheitsfrage falsch. Bitte nochmals versuchen.");
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

    // Primary usecase = first selected, or generic funktion-chat
    const primaryUsecase = selected[0] ?? "funktion-chat";

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.passwort,
          segment: "funktionen",
          usecase_id: primaryUsecase,
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
      <main className="min-h-screen bg-violet-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl">⚡</div>
          <h2 className="text-2xl font-bold text-violet-300">Willkommen, {form.name}!</h2>
          <p className="text-gray-300">
            Dein Konto wurde erstellt.{selected.length > 0 ? ` ${selected.length} Funktion(en) aktiviert.` : ""}
          </p>
          <button onClick={() => router.push("/chat")}
            className="w-full bg-violet-700 hover:bg-violet-600 py-3 rounded-xl font-bold transition-colors">
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
            <h1 className="text-2xl font-bold text-violet-300">⚡ Registrierung Funktionen</h1>
            <p className="text-xs text-gray-500">Einzelne KI-Funktionen & Integrationen</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">

          <input type="text" name="website" value={form.website}
            onChange={(e) => set("website", e.target.value)}
            style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Name</label>
              <input required value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="Max Muster"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Organisation <span className="text-gray-600">(optional)</span></label>
              <input value={form.organisation} onChange={(e) => set("organisation", e.target.value)}
                placeholder="Firma / Projekt"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-violet-500" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">E-Mail</label>
            <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              placeholder="max@beispiel.ch"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-violet-500" />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-400">Welche Funktionen interessieren dich?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FUNKTIONEN.map((f) => (
                <button key={f.id} type="button" onClick={() => toggleFunktion(f.id)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    selected.includes(f.id)
                      ? "border-violet-500 bg-violet-900/40 text-violet-200"
                      : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500"
                  }`}>
                  <span className="text-lg mr-1.5">{f.icon}</span>
                  <span className="text-xs font-semibold">{f.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5 pl-7">{f.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort <span className="text-gray-600">(min. 8 Zeichen)</span></label>
            <input required type="password" value={form.passwort} minLength={8}
              onChange={(e) => set("passwort", e.target.value)} placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-violet-500" />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort bestätigen</label>
            <input required type="password" value={form.passwortBestaetigung}
              onChange={(e) => set("passwortBestaetigung", e.target.value)} placeholder="••••••••"
              className={`w-full bg-gray-800 border rounded-lg p-3 text-white focus:outline-none ${
                form.passwortBestaetigung && form.passwort !== form.passwortBestaetigung
                  ? "border-red-500" : "border-gray-700 focus:border-violet-500"
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
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-violet-500" />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-800/50 rounded-lg px-4 py-3">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-violet-700 hover:bg-violet-600 py-3 rounded-xl font-bold transition-colors disabled:opacity-50">
            {loading ? "Wird registriert…" : "Konto erstellen →"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Bereits registriert?{" "}
          <button onClick={() => router.push("/login")} className="text-violet-400 hover:text-violet-300">Anmelden</button>
        </p>
      </div>
    </main>
  );
}
