"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterAllgemein() {
  const router = useRouter();
  const [form, setForm] = useState({
    vorname: "",
    nachname: "",
    geburtsjahr: "",
    email: "",
    passwort: "",
    sprache: "de",
  });
  const [submitted, setSubmitted] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-green-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl">🌍</div>
          <h2 className="text-2xl font-bold text-green-300">Willkommen, {form.vorname}!</h2>
          <p className="text-gray-300">Dein Konto wurde erfolgreich erstellt.</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-green-700 hover:bg-green-600 py-3 rounded-xl font-bold transition-colors"
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

        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="text-gray-500 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-2xl font-bold text-green-300">🌍 Registrierung</h1>
            <p className="text-xs text-gray-500">Für alle — entdecke deinen Baddi</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Vorname</label>
              <input required value={form.vorname} onChange={(e) => set("vorname", e.target.value)}
                placeholder="Dein Vorname"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-green-500" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Nachname</label>
              <input value={form.nachname} onChange={(e) => set("nachname", e.target.value)}
                placeholder="Dein Nachname"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-green-500" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Geburtsjahr</label>
            <input required type="number" min="1920" max={new Date().getFullYear() - 6} value={form.geburtsjahr}
              onChange={(e) => set("geburtsjahr", e.target.value)}
              placeholder="z.B. 1990"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-green-500" />
          </div>


          <div className="space-y-1">
            <label className="text-sm text-gray-400">E-Mail</label>
            <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              placeholder="deine@email.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-green-500" />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort</label>
            <input required type="password" value={form.passwort} onChange={(e) => set("passwort", e.target.value)}
              placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-green-500" />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Bevorzugte Sprache</label>
            <select value={form.sprache} onChange={(e) => set("sprache", e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-green-500">
              <option value="de">🇩🇪 Deutsch</option>
              <option value="de-ch">🇨🇭 Schweizerdeutsch</option>
              <option value="fr">🇫🇷 Français</option>
              <option value="it">🇮🇹 Italiano</option>
              <option value="en">🇬🇧 English</option>
            </select>
          </div>

          <button type="submit"
            className="w-full bg-green-700 hover:bg-green-600 py-3 rounded-xl font-bold transition-colors">
            Konto erstellen →
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Bereits registriert?{" "}
          <button onClick={() => router.push("/login")} className="text-green-400 hover:text-green-300 transition-colors">
            Anmelden
          </button>
        </p>
      </div>
    </main>
  );
}
