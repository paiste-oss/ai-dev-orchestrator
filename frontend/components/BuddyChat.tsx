"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getSession } from "@/lib/auth";
import type { UseCase } from "@/lib/usecases";
import VoiceButton from "@/components/VoiceButton";

interface Message {
  role: "user" | "buddy";
  text: string;
}

interface Props {
  useCase: UseCase;
}

export default function BuddyChat({ useCase }: Props) {
  const router = useRouter();
  const user = getSession();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;
    const userMsg = prompt.trim();
    setPrompt("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMsg,
          model: "mistral",
          system_prompt: useCase.systemPrompt,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "buddy", text: data.output || "Keine Antwort." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "buddy", text: "Verbindung fehlgeschlagen. Läuft Docker?" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${useCase.bgColor} text-white flex flex-col`}>
      {/* Header */}
      <header className={`bg-black/30 border-b ${useCase.borderColor} px-5 py-4 flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/user")}
            className="text-gray-400 hover:text-white transition-colors text-xl"
          >
            ←
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{useCase.icon}</span>
              <h1 className={`text-lg font-bold ${useCase.color}`}>{useCase.name}</h1>
            </div>
            <p className="text-xs text-gray-400">{useCase.buddyName} · {useCase.ageRange}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user && <span className="text-sm text-gray-400 hidden sm:block">{user.name}</span>}
          <button
            onClick={() => { clearSession(); router.push("/"); }}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Abmelden
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center mt-24 space-y-3 px-4">
            <div className="text-5xl">{useCase.icon}</div>
            <p className={`text-lg font-semibold ${useCase.color}`}>Hallo! Ich bin {useCase.buddyName}.</p>
            <p className="text-gray-400 text-sm">{useCase.tagline}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "buddy" && (
              <span className="text-xl mr-2 mt-1 self-end">{useCase.icon}</span>
            )}
            <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
              msg.role === "user"
                ? "bg-white/10 text-white rounded-br-sm"
                : `${useCase.bubbleColor} text-gray-100 rounded-bl-sm`
            }`}>
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <span className="text-xl mr-2 self-end">{useCase.icon}</span>
            <div className={`${useCase.bubbleColor} rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400`}>
              {useCase.buddyName} denkt nach...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={`border-t ${useCase.borderColor} bg-black/30 p-4`}>
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={useCase.placeholder}
            className={`flex-1 bg-white/10 border ${useCase.borderColor} rounded-xl p-3 text-white placeholder-gray-500 focus:outline-none focus:border-white/40`}
          />
          <VoiceButton
            onResult={(text) => setPrompt((prev) => (prev ? prev + " " + text : text))}
            className="w-12 h-12"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="w-12 h-12 rounded-xl font-bold transition-colors disabled:opacity-40 bg-white/20 hover:bg-white/30 text-lg"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
