"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import VoiceButton from "@/components/VoiceButton";

export default function Portal() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("auto");
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const router = useRouter();
  const user = getSession();

  const fetchHistory = async () => {
    try {
      const res = await fetch("http://localhost:8000/agent/history");
      const data = await res.json();
      if (data.history) setHistory(data.history);
    } catch (error) {
      console.error("Fehler beim Laden der Historie", error);
    }
  };

  useEffect(() => { fetchHistory(); }, []);

  const handleSubmit = async () => {
    if (!prompt) return;
    const modelLabel =
      model === "auto" ? "Router" :
      model === "openclaw" ? "OpenClaw" :
      model.startsWith("claude") ? "Claude" : model;
    setStatus(`${modelLabel} denkt nach...`);
    try {
      const response = await fetch("http://localhost:5678/webhook/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model }),
      });
      const data = await response.json();
      if (response.ok) {
        const rawOutput = Array.isArray(data) ? data[0]?.output : data.output;
        setStatus("Ergebnis:\n\n" + (rawOutput || "Antwortformat unbekannt (siehe Konsole)"));
        fetchHistory();
      } else {
        setStatus("Fehler vom Server: " + data.detail);
      }
    } catch {
      setStatus("Verbindung zum Backend fehlgeschlagen. Läuft Docker?");
    }
  };

  const modelBadgeColor = (m: string) => {
    if (m === "openclaw") return "bg-red-900 text-red-300";
    if (m?.startsWith("claude")) return "bg-purple-900 text-purple-300";
    if (m === "mistral") return "bg-orange-900 text-orange-300";
    if (m?.startsWith("llama")) return "bg-blue-900 text-blue-300";
    return "bg-gray-700 text-gray-300";
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center">
      {/* Header */}
      <div className="w-full max-w-2xl flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-blue-400">AI Buddy Portal</h1>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-gray-400">
              {user.name} ({user.role})
            </span>
          )}
          <button
            onClick={() => router.push(user ? `/${user.role}` : "/login")}
            className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded transition-colors"
          >
            {user ? "Dashboard" : "Login"}
          </button>
          {user && (
            <button
              onClick={() => { clearSession(); router.push("/"); }}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Abmelden
            </button>
          )}
        </div>
      </div>

      <div className="w-full max-w-2xl bg-gray-800 rounded-xl shadow-lg p-6 space-y-6">
        <div className="space-y-2">
          <label className="text-sm text-gray-400">Welche KI soll arbeiten?</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="auto">🧭 Auto (Router entscheidet)</option>
            <option value="mistral">🖥️ Mistral 7B (Lokal)</option>
            <option value="llama3.2">🖥️ Llama 3.2 (Lokal)</option>
            <option value="claude-sonnet-4-6">☁️ Claude Sonnet (Anthropic)</option>
            <option value="openclaw">🦞 OpenClaw Agent (Lokal Gateway)</option>
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-400">Dein Auftrag</label>
            <VoiceButton
              onResult={(text) => setPrompt((prev) => (prev ? prev + " " + text : text))}
              className="w-9 h-9 text-sm"
            />
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Schreibe ein Python-Skript, das..."
            className="w-full h-32 bg-gray-700 border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={handleSubmit}
          className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-3 rounded font-bold text-white"
        >
          Agent starten
        </button>

        {status && (
          <div className="text-left text-sm text-gray-300 mt-4 p-4 bg-gray-700 rounded whitespace-pre-wrap overflow-x-auto">
            {status}
          </div>
        )}
      </div>

      <div className="w-full max-w-2xl mt-8 space-y-4">
        <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2">Protokoll & Gedächtnis</h2>
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm">Noch keine Einträge im Gedächtnis.</p>
        ) : (
          history.map((item) => (
            <div key={item.id} className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700 space-y-2">
              <div className="flex justify-between items-center text-xs text-gray-400">
                <span className={`px-2 py-1 rounded ${modelBadgeColor(item.model)}`}>{item.model}</span>
                <span>{new Date(item.timestamp).toLocaleString("de-DE")}</span>
              </div>
              <p className="font-semibold text-gray-200">"{item.prompt}"</p>
              <div className="bg-gray-900 p-3 rounded text-sm text-gray-400 whitespace-pre-wrap overflow-x-auto">
                {item.result}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
