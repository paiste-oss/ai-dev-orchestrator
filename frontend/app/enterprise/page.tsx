"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";

const NAV = [
  { label: "Übersicht", href: "/enterprise", icon: "🏢" },
  { label: "Meine Buddies", href: "/enterprise/buddies", icon: "🤖" },
  { label: "Gespräche", href: "/enterprise/conversations", icon: "💬" },
  { label: "Auslastung", href: "/enterprise/usage", icon: "📈" },
  { label: "Einstellungen", href: "/enterprise/settings", icon: "⚙️" },
];

export default function EnterpriseDashboard() {
  const router = useRouter();
  const user = getSession();
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "enterprise") router.replace("/login");
  }, []);

  if (!user) return null;

  const handleChat = async () => {
    if (!prompt) return;
    setLoading(true);
    setResponse("");
    try {
      const res = await fetch("http://localhost:5678/webhook/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: "auto" }),
      });
      const data = await res.json();
      const out = Array.isArray(data) ? data[0]?.output : data.output;
      setResponse(out || "Keine Antwort erhalten.");
    } catch {
      setResponse("Verbindung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-4 space-y-1">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-blue-400">AI Buddy</h1>
          <p className="text-xs text-gray-500">Enterprise</p>
        </div>
        {NAV.map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className="flex items-center gap-3 text-sm text-gray-300 hover:text-white hover:bg-gray-800 px-3 py-2 rounded transition-colors text-left"
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => { clearSession(); router.push("/"); }}
          className="flex items-center gap-3 text-sm text-gray-500 hover:text-red-400 px-3 py-2 rounded transition-colors"
        >
          <span>🚪</span><span>Abmelden</span>
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold">Willkommen, {user.name}</h2>
          <p className="text-gray-400 text-sm mt-1">Enterprise-Umgebung</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Aktive Buddies", value: "—", color: "text-blue-400" },
            { label: "Gespräche heute", value: "—", color: "text-green-400" },
            { label: "Nutzer", value: "—", color: "text-purple-400" },
          ].map((card) => (
            <div key={card.label} className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <p className="text-sm text-gray-400">{card.label}</p>
              <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Schnell-Chat */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-4">
          <h3 className="font-semibold text-gray-200">AI Buddy — Schnell-Chat</h3>
          <div className="flex gap-3">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChat()}
              placeholder="Frag deinen Buddy..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleChat}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 rounded font-bold transition-colors"
            >
              {loading ? "..." : "Senden"}
            </button>
          </div>
          {response && (
            <div className="bg-gray-900 p-4 rounded text-sm text-gray-300 whitespace-pre-wrap">
              {response}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
