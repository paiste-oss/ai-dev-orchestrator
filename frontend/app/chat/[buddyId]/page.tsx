"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

const BuddyAvatar = dynamic(() => import("@/components/BuddyAvatar"), { ssr: false });

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  created_at: string;
}

interface MemoryItem {
  id: string;
  content: string;
  importance: number;
}

interface BuddyInfo {
  id: string;
  name: string;
  avatar_url: string | null;
}

/** Generiert einen konsistenten Gradient-Hintergrund aus dem Buddy-Namen */
function nameToGradient(name: string) {
  const gradients = [
    "from-violet-500 to-indigo-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-600",
    "from-sky-500 to-blue-600",
    "from-purple-500 to-fuchsia-600",
  ];
  const idx = (name.charCodeAt(0) ?? 0) % gradients.length;
  return gradients[idx];
}

function AvatarFallback({ name, size, speaking }: { name: string; size: number; speaking: boolean }) {
  const gradient = nameToGradient(name);
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
        speaking ? "shadow-[0_0_0_6px_rgba(99,102,241,0.35)] scale-105" : "shadow-[0_0_0_3px_rgba(255,255,255,0.08)]"
      }`}
    >
      <span className="text-white font-bold select-none" style={{ fontSize: size * 0.38 }}>
        {initial}
      </span>
      {speaking && (
        <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500 opacity-20" />
      )}
    </div>
  );
}

export default function ChatPage() {
  const { buddyId } = useParams<{ buddyId: string }>();
  const router = useRouter();
  const user = getSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [buddy, setBuddy] = useState<BuddyInfo | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    loadBuddy();
    loadHistory();
    loadMemories();
  }, [buddyId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadBuddy() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/buddies/${buddyId}`);
      if (res.ok) setBuddy(await res.json());
    } catch { /* ignore */ }
  }

  async function loadHistory() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/history?buddy_id=${buddyId}&limit=60`);
      if (res.ok) setMessages(await res.json());
    } catch { /* ignore */ } finally {
      setHistoryLoaded(true);
    }
  }

  async function loadMemories() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/memories`);
      if (res.ok) setMemories(await res.json());
    } catch { /* ignore */ }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setLoading(true);
    setSpeaking(true);

    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/message`, {
        method: "POST",
        body: JSON.stringify({ message: text, buddy_id: buddyId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unbekannter Fehler" }));
        throw new Error(err.detail ?? "Fehler beim Senden");
      }

      const data = await res.json();
      const assistantMsg: Message = {
        id: data.message_id,
        role: "assistant",
        content: data.response,
        provider: data.provider,
        model: data.model,
        created_at: new Date().toISOString(),
      };
      setLastProvider(data.provider);
      setMessages((prev) => [...prev, assistantMsg]);
      setTimeout(loadMemories, 4000);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Fehler: ${err instanceof Error ? err.message : "Verbindungsproblem"}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      setSpeaking(false);
      textareaRef.current?.focus();
    }
  }

  async function deleteMemory(id: string) {
    try {
      await apiFetch(`${BACKEND_URL}/v1/chat/memories/${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch { /* ignore */ }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const buddyName = buddy?.name ?? "Baddi";

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur shrink-0">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-800"
        >
          ← Zurück
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMemory(!showMemory)}
            title="Gedächtnis"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              showMemory
                ? "bg-violet-700 border-violet-600 text-white"
                : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            🧠 {memories.length > 0 ? memories.length : ""}
          </button>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Avatar Sidebar (Desktop) ── */}
        <aside className="hidden md:flex w-64 shrink-0 border-r border-gray-800 bg-gray-900/50 flex-col items-center justify-start pt-10 pb-6 gap-4">
          <div className="flex flex-col items-center gap-3 px-4 w-full">
            {buddy?.avatar_url ? (
              <div className={`rounded-2xl overflow-hidden w-full transition-all duration-300 ${speaking ? "ring-4 ring-indigo-500/40 shadow-[0_0_30px_rgba(99,102,241,0.3)]" : ""}`}>
                <BuddyAvatar avatarUrl={buddy.avatar_url} height={300} cameraDistance={2.4} />
              </div>
            ) : (
              <AvatarFallback name={buddyName} size={120} speaking={speaking} />
            )}

            <div className="text-center mt-2">
              <h2 className="font-bold text-lg text-white">{buddyName}</h2>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${speaking ? "bg-green-400 animate-pulse" : "bg-green-500"}`} />
                <span className="text-xs text-gray-400">{speaking ? "antwortet…" : "Online"}</span>
              </div>
            </div>

            {lastProvider && (
              <div className="mt-2 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-xs text-gray-400 text-center w-full">
                {lastProvider === "claude" ? "🟠 Claude (Anthropic)" :
                 lastProvider === "gemini" ? "🔵 Gemini" :
                 lastProvider === "openai" ? "🟢 ChatGPT" : "🤖 KI"}
              </div>
            )}
          </div>
        </aside>

        {/* ── Chat area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Avatar Mobile (kompakt, immer sichtbar) */}
          <div className="md:hidden shrink-0 border-b border-gray-800 bg-gray-900/60 flex items-center gap-4 px-4 py-3">
            {buddy?.avatar_url ? (
              <div className={`rounded-xl overflow-hidden shrink-0 transition-all duration-300 ${speaking ? "ring-2 ring-indigo-500/60 shadow-[0_0_16px_rgba(99,102,241,0.4)]" : ""}`} style={{ width: 56, height: 56 }}>
                <BuddyAvatar avatarUrl={buddy.avatar_url} height={56} cameraDistance={2.0} />
              </div>
            ) : (
              <AvatarFallback name={buddyName} size={52} speaking={speaking} />
            )}
            <div>
              <p className="font-semibold text-sm text-white">{buddyName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${speaking ? "bg-green-400 animate-pulse" : "bg-green-500"}`} />
                <span className="text-xs text-gray-400">{speaking ? "antwortet…" : "Online"}</span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {!historyLoaded && (
              <p className="text-center text-gray-600 text-sm pt-10">Lade Verlauf…</p>
            )}

            {historyLoaded && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl shadow-xl">
                  👋
                </div>
                <div>
                  <p className="font-semibold text-white text-lg">Hallo! Ich bin {buddyName}.</p>
                  <p className="text-gray-400 text-sm mt-1">Wie kann ich dir heute helfen?</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex items-end gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="shrink-0 mb-0.5">
                    <AvatarFallback name={buddyName} size={28} speaking={false} />
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-md"
                      : "bg-gray-800 text-gray-100 rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-end gap-2.5 justify-start">
                <div className="shrink-0 mb-0.5">
                  <AvatarFallback name={buddyName} size={28} speaking={true} />
                </div>
                <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                  <span className="inline-flex gap-1.5 items-center">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t border-gray-800 bg-gray-950 shrink-0">
            <div className="flex gap-2 items-end bg-gray-900 border border-gray-700 rounded-2xl px-4 py-2 focus-within:border-indigo-600 transition-colors">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Nachricht an ${buddyName}…`}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder-gray-600 max-h-32 py-1"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
              >
                ↑
              </button>
            </div>
            <p className="text-xs text-gray-700 mt-1.5 text-center">Enter senden · Shift+Enter neue Zeile</p>
          </div>
        </div>

        {/* Memory Panel */}
        {showMemory && (
          <aside className="w-72 border-l border-gray-800 bg-gray-900 flex flex-col overflow-hidden shrink-0">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-sm">🧠 Gedächtnis</h2>
                <p className="text-xs text-gray-500 mt-0.5">Gespeicherte Informationen über dich</p>
              </div>
              <button onClick={() => setShowMemory(false)} className="text-gray-600 hover:text-white text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {memories.length === 0 && (
                <p className="text-xs text-gray-600 pt-2 text-center leading-relaxed">
                  Noch keine Erinnerungen.<br />Nach dem ersten Gespräch merkt sich dein Baddi relevante Informationen.
                </p>
              )}
              {memories.map((m) => (
                <div key={m.id} className="flex items-start gap-2 bg-gray-800 rounded-xl px-3 py-2 text-xs group">
                  <span className="flex-1 text-gray-300 leading-relaxed">{m.content}</span>
                  <button
                    onClick={() => deleteMemory(m.id)}
                    className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                    title="Löschen"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
