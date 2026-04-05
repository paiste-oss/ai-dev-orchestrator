"use client";

import { useEffect, useRef, useMemo, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, saveToken } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { registerAction, type RegisterState } from "./actions";

function useMathCaptcha() {
  return useMemo(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, answer: a + b };
  }, []);
}

const DAYS   = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1920 - 5 }, (_, i) => currentYear - 6 - i);

export default function RegisterPage() {
  const router  = useRouter();
  const captcha = useMathCaptcha();

  const [state, formAction, isPending] = useActionState<RegisterState, FormData>(
    registerAction,
    null,
  );

  // Registrierung gesperrt wenn show_register_menschen deaktiviert
  useEffect(() => {
    fetch(`${BACKEND_URL}/v1/settings/portal`)
      .then(r => r.json())
      .then((data: { show_register_menschen?: boolean }) => {
        if (data.show_register_menschen === false) router.replace("/login");
      })
      .catch(() => {});
  }, [router]);

  // Nach erfolgreicher Registrierung — Token + Session in localStorage
  useEffect(() => {
    if (!state || state.status !== "ok") return;
    saveToken(state.token);
    saveSession({ name: state.name, email: state.email, role: state.role });
    router.push(`/register/security?name=${encodeURIComponent(state.firstName)}`);
  }, [state, router]);

  // Kontrollierte Felder die nicht direkt in Form-Inputs passen
  const [language, setLanguage]       = useState("de");
  const [captchaInput, setCaptchaInput] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Client-seitige Vorab-Validierung (Captcha) vor dem Action-Submit
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setClientError(null);
    if (parseInt(captchaInput, 10) !== captcha.answer) {
      e.preventDefault();
      setClientError("Sicherheitsfrage falsch. Bitte nochmals versuchen.");
    }
  }

  const serverError = state?.status === "error" ? state.message : null;
  const displayError = clientError ?? serverError;

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

        <form
          ref={formRef}
          action={formAction}
          onSubmit={handleSubmit}
          className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5"
        >
          {/* Hidden-Fields für kontrollierte Werte */}
          <input type="hidden" name="language" value={language} />

          {/* Honeypot — verstecktes Feld (Bots füllen es aus, echte User nicht) */}
          <input type="text" name="website" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

          {/* Rufname */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">
              Rufname <span className="text-gray-600">(wie Baddi dich anspricht)</span>
            </label>
            <input
              name="rufname"
              placeholder="z. B. Anna oder Müller"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="text-xs text-gray-600">Leer lassen = Baddi verwendet deinen Vornamen.</p>
          </div>

          {/* Vor- + Nachname */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Vorname <span className="text-gray-600">(rechtlich)</span></label>
              <input
                required
                name="vorname"
                placeholder="Anna"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Nachname <span className="text-gray-600">(rechtlich)</span></label>
              <input
                required
                name="nachname"
                placeholder="Müller"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Geburtsdatum */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">Geburtsdatum</label>
            <div className="grid grid-cols-3 gap-2">
              <select
                required
                name="geburtstag"
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Tag</option>
                {DAYS.map((d) => <option key={d} value={String(d)}>{d}</option>)}
              </select>
              <select
                required
                name="geburtsmonat"
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Monat</option>
                {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
              </select>
              <select
                required
                name="geburtsjahr"
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Jahr</option>
                {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* E-Mail */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">E-Mail</label>
            <input
              required
              type="email"
              name="email"
              placeholder="anna@beispiel.ch"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Mobilnummer */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">
              Mobilnummer <span className="text-gray-600">(für 2FA-Schutz empfohlen)</span>
            </label>
            <input
              type="tel"
              name="mobile"
              placeholder="+41791234567"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="text-xs text-gray-600">Optional — ermöglicht SMS-Sicherheitscode beim Login</p>
          </div>

          {/* Sprachauswahl — kontrollierte Buttons + Hidden-Input */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Bevorzugte Sprache</label>
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

          {/* Passwort */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort <span className="text-gray-600">(min. 8 Zeichen)</span></label>
            <input
              required
              type="password"
              name="passwort"
              minLength={8}
              placeholder="••••••••"
              autoComplete="new-password"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Passwort bestätigen */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort bestätigen</label>
            <input
              required
              type="password"
              name="passwortBestaetigung"
              placeholder="••••••••"
              autoComplete="new-password"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Captcha — Antwort Client-seitig in onSubmit geprüft */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 space-y-2">
            <label className="text-sm text-gray-300 font-medium">
              Sicherheitsfrage: Was ist {captcha.a} + {captcha.b}?
            </label>
            <input
              required
              type="number"
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)}
              placeholder="Antwort"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Einwilligungen — native Checkboxes (senden "on" / nicht vorhanden) */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-700 bg-gray-800/30 p-4 transition-colors has-[:checked]:border-indigo-500/50 has-[:checked]:bg-indigo-950/20">
              <input
                type="checkbox"
                name="tos_accepted"
                required
                className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0"
              />
              <span className="text-sm text-gray-300 leading-relaxed">
                Ich akzeptiere die{" "}
                <button type="button" onClick={() => router.push("/agb?from=/register")}
                  className="text-indigo-400 hover:text-indigo-300 underline">
                  AGB
                </button>
                {" "}und die{" "}
                <button type="button" onClick={() => router.push("/datenschutz?from=/register")}
                  className="text-indigo-400 hover:text-indigo-300 underline">
                  Datenschutzerklärung
                </button>
                .{" "}
                <span className="text-red-400 text-xs">* Pflichtfeld</span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-700 bg-gray-800/30 p-4 transition-colors has-[:checked]:border-yellow-500/40 has-[:checked]:bg-yellow-950/10">
              <input
                type="checkbox"
                name="memory_consent"
                defaultChecked
                className="mt-0.5 w-4 h-4 accent-yellow-400 shrink-0"
              />
              <span className="text-sm text-gray-300 leading-relaxed">
                <span className="text-yellow-400 font-medium">Langzeitgedächtnis</span>
                {" — "}Damit Baddi dein Begleiter fürs Leben wird, merkt er sich wichtige Dinge über dich
                (Vorlieben, Erlebnisse, Ziele). Stimmst du zu, dass Baddi sein Langzeitgedächtnis für
                dich aufbaut?{" "}
                <span className="text-gray-500 text-xs">Jederzeit widerrufbar.</span>
              </span>
            </label>
          </div>

          {displayError && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-800/50 rounded-lg px-4 py-3">
              {displayError}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            {isPending ? "Wird registriert…" : "Konto erstellen →"}
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
