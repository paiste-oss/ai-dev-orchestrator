"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BRANCHEN = [
  "Gesundheit & Pflege", "Detailhandel", "Finanz & Versicherung",
  "Industrie & Produktion", "IT & Technologie", "Bildung",
  "Gastgewerbe", "Öffentliche Verwaltung", "Andere",
];

export default function RegisterFirma() {
  const router = useRouter();
  const [form, setForm] = useState({
    firmenname: "",
    kontaktperson: "",
    funktion: "",
    email: "",
    telefon: "",
    branche: "",
    mitarbeiter: "",
    land: "CH",
    anwendungsfall: "",
    passwort: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-blue-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl">🏢</div>
          <h2 className="text-2xl font-bold text-blue-300">Willkommen, {form.firmenname}!</h2>
          <p className="text-gray-300">Ihre Unternehmensregistrierung wurde erfolgreich eingereicht. Unser Team meldet sich innerhalb von 24 Stunden.</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-blue-700 hover:bg-blue-600 py-3 rounded-xl font-bold transition-colors"
          >
            Zum Login →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="text-gray-500 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-2xl font-bold text-blue-300">🏢 Unternehmensregistrierung</h1>
            <p className="text-xs text-gray-500">Enterprise & Organisationen</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">

          {/* Firma */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">Firmenname</label>
            <input required value={form.firmenname} onChange={(e) => set("firmenname", e.target.value)}
              placeholder="Musterfirma AG"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" />
          </div>

          {/* Kontakt */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Kontaktperson</label>
              <input required value={form.kontaktperson} onChange={(e) => set("kontaktperson", e.target.value)}
                placeholder="Max Muster"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Funktion</label>
              <input value={form.funktion} onChange={(e) => set("funktion", e.target.value)}
                placeholder="CEO, HR-Leiter..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          {/* E-Mail & Telefon */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Geschäfts-E-Mail</label>
              <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                placeholder="info@firma.ch"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Telefon</label>
              <input type="tel" value={form.telefon} onChange={(e) => set("telefon", e.target.value)}
                placeholder="+41 44 123 45 67"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          {/* Branche & Mitarbeiter */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Branche</label>
              <select required value={form.branche} onChange={(e) => set("branche", e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500">
                <option value="">Bitte wählen</option>
                {BRANCHEN.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Mitarbeiter</label>
              <select value={form.mitarbeiter} onChange={(e) => set("mitarbeiter", e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500">
                <option value="">Grösse wählen</option>
                <option value="1-10">1–10</option>
                <option value="11-50">11–50</option>
                <option value="51-200">51–200</option>
                <option value="201-1000">201–1000</option>
                <option value="1000+">1000+</option>
              </select>
            </div>
          </div>

          {/* Land */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">Land</label>
            <select value={form.land} onChange={(e) => set("land", e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500">
              <option value="CH">🇨🇭 Schweiz</option>
              <option value="DE">🇩🇪 Deutschland</option>
              <option value="AT">🇦🇹 Österreich</option>
              <option value="other">Anderes</option>
            </select>
          </div>

          {/* Anwendungsfall */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">Geplanter Anwendungsfall</label>
            <textarea value={form.anwendungsfall} onChange={(e) => set("anwendungsfall", e.target.value)}
              placeholder="z.B. KI-Assistent für Kundendienst, interner Wissens-Buddy für 50 Mitarbeiter..."
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 resize-none" />
          </div>

          {/* Passwort */}
          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort</label>
            <input required type="password" value={form.passwort} onChange={(e) => set("passwort", e.target.value)}
              placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" />
          </div>

          <button type="submit"
            className="w-full bg-blue-700 hover:bg-blue-600 py-3 rounded-xl font-bold transition-colors">
            Anfrage einreichen →
          </button>

          <p className="text-xs text-gray-600 text-center">Nach der Registrierung meldet sich unser Team innerhalb von 24 Stunden.</p>
        </form>

        <p className="text-center text-sm text-gray-600">
          Bereits registriert?{" "}
          <button onClick={() => router.push("/login")} className="text-blue-400 hover:text-blue-300 transition-colors">
            Anmelden
          </button>
        </p>
      </div>
    </main>
  );
}
