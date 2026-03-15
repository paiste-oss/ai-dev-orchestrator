"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";

export default function UserDashboard() {
  const router = useRouter();
  const user = getSession();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "buddy"; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "user") router.replace("/login");
  }, []);

  if (!user) return null;

  const handleSend = async () => {
    if (!prompt.trim()) return;
    const userMsg = prompt.trim();
    setPrompt("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5678/webhook/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMsg, model: "auto" }),
      });
      const data = await res.json();
      const out = Array.isArray(data) ? data[0]?.output : data.output;
      setMessages((prev) => [...prev, { role: "buddy", text: out || "Keine Antwort erhalten." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "buddy", text: "Verbindung fehlgeschlagen." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-green-400">Dein AI Buddy</h1>
          <p className="text-xs text-gray-500">Persönlicher Begleiter</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user.name}</span>
          <button
            onClick={() => { clearSession(); router.push("/"); }}
            className="text-sm text-gray-500 hover:text-red-400 transition-colors"
          >
            Abmelden
          </button>
        </div>
      </header>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-2xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-20 space-y-2">
            <p className="text-4xl">🤖</p>
            <p className="text-lg">Hallo! Ich bin dein AI Buddy.</p>
            <p className="text-sm">Schreib mir etwas — ich bin für dich da.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-green-700 text-white rounded-br-sm"
                : "bg-gray-800 text-gray-200 rounded-bl-sm"
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400">
              Buddy denkt nach...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 bg-gray-900 p-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Schreib deinem Buddy..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded-xl p-3 text-white focus:outline-none focus:border-green-500"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 px-5 rounded-xl font-bold transition-colors"
          >
            Senden
          </button>
        </div>
      </div>
    </div>
  );
}
