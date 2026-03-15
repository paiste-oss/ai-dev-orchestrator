"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FUNKTIONEN = [
  { id: "dokumente", label: "Dokument-Analyse", icon: "📄", desc: "PDFs, Word, Excel analysieren & zusammenfassen" },
  { id: "chat", label: "KI-Chat", icon: "💬", desc: "Intelligente Konversationen & Beratung" },
  { id: "sprache", label: "Sprach-Assistent", icon: "🎙️", desc: "Sprachsteuerung & Voice-to-Text" },
  { id: "workflows", label: "Automatisierungen", icon: "⚙️", desc: "n8n-Workflows & Prozessautomatisierung" },
  { id: "uebersetzung", label: "Übersetzung", icon: "🌐", desc: "Mehrsprachige Kommunikation" },
  { id: "wissensbase", label: "Wissensdatenbank", icon: "🧠", desc: "Eigene Dokumente als KI-Wissensbasis" },
];

export default function RegisterFunktionen() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    organisation: "",
    passwort: "",
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toggleFunktion = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-violet-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl">⚡</div>
          <h2 className="text-2xl font-bold text-violet-300">Zugang beantragt, {form.name}!</h2>
          <p className="text-gray-300">
            Wir richten deinen Zugang für {selected.length > 0 ? selected.length : "die gewählten"} Funktionen ein. Du erhältst eine Bestätigung per E-Mail.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-violet-700 hover:bg-violet-600 py-3 rounded-xl font-bold transition-colors"
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
            <h1 className="text-2xl font-bold text-violet-300">⚡ Registrierung Funktionen</h1>
            <p className="text-xs text-gray-500">Einzelne KI-Funktionen & Integrationen</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Name</label>
              <input required value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="Max Muster"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Organisation (optional)</label>
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
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggleFunktion(f.id)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    selected.includes(f.id)
                      ? "border-violet-500 bg-violet-900/40 text-violet-200"
                      : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  <span className="text-lg mr-1.5">{f.icon}</span>
                  <span className="text-xs font-semibold">{f.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5 pl-7">{f.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400">Passwort</label>
            <input required type="password" value={form.passwort} onChange={(e) => set("passwort", e.target.value)}
              placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-violet-500" />
          </div>

          <button type="submit"
            className="w-full bg-violet-700 hover:bg-violet-600 py-3 rounded-xl font-bold transition-colors">
            Zugang beantragen →
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Bereits registriert?{" "}
          <button onClick={() => router.push("/login")} className="text-violet-400 hover:text-violet-300 transition-colors">
            Anmelden
          </button>
        </p>
      </div>
    </main>
  );
}
