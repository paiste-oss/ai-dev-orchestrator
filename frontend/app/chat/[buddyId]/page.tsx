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
  const [showAvatar, setShowAvatar] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
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

  const providerLabel =
    lastProvider === "claude" ? "Claude (Anthropic)" :
    lastProvider === "gemini" ? "Gemini" :
    lastProvider === "openai" ? "ChatGPT (Fallback)" : "AI";
  const providerColor =
    lastProvider === "claude" ? "text-orange-400" :
    lastProvider === "gemini" ? "text-blue-400" : "text-green-400";

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-xl leading-none">←</button>
          <div>
            <h1 className="font-bold text-sm">{buddy?.name ?? "KI-Chat"}</h1>
            <p className={`text-xs ${providerColor}`}>{providerLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {buddy?.avatar_url && (
            <button
              onClick={() => setShowAvatar(!showAvatar)}
              title={showAvatar ? "Avatar ausblenden" : "Avatar anzeigen"}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                showAvatar
                  ? "bg-yellow-400/20 border-yellow-500/40 text-yellow-300"
                  : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
              }`}
            >
              🧍
            </button>
          )}
          <button
            onClick={() => setShowMemory(!showMemory)}
            title="Gedächtnis"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              showMemory
                ? "bg-violet-700 border-violet-600 text-white"
                : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            🧠 {memories.length}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Avatar Panel (links, wenn vorhanden) ── */}
        {buddy?.avatar_url && showAvatar && (
          <aside className="w-56 shrink-0 border-r border-gray-800 bg-gray-950 flex flex-col items-center justify-start pt-6 gap-3 hidden md:flex">
            <BuddyAvatar avatarUrl={buddy.avatar_url} height={320} cameraDistance={2.4} />
            <p className="text-xs text-gray-500 px-3 text-center">{buddy.name}</p>
          </aside>
        )}

        {/* ── Messages ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Avatar mobile (oben, klein) */}
          {buddy?.avatar_url && showAvatar && (
            <div className="md:hidden shrink-0 border-b border-gray-800">
              <BuddyAvatar avatarUrl={buddy.avatar_url} height={180} cameraDistance={2.0} />
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {!historyLoaded && (
              <p className="text-center text-gray-600 text-sm pt-10">Lade Verlauf…</p>
            )}

            {historyLoaded && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-20">
                <p className="text-5xl">💬</p>
                <p className="text-gray-400 text-sm">
                  Starte ein Gespräch{buddy?.name ? ` mit ${buddy.name}` : ""}.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-gray-800 text-gray-100 rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                  {msg.role === "assistant" && msg.provider && (
                    <p className="text-xs mt-2 opacity-40">
                      {msg.provider === "claude" ? "Claude" : msg.provider === "gemini" ? "Gemini" : msg.provider === "openai" ? "ChatGPT" : msg.provider ?? "AI"} · {msg.model}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                  <span className="inline-flex gap-1.5 items-center">
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input ── */}
          <div className="px-4 pb-4 pt-2 border-t border-gray-800 bg-gray-950 shrink-0">
            <div className="flex gap-2 items-end bg-gray-900 border border-gray-700 rounded-2xl px-4 py-2 focus-within:border-blue-600 transition-colors">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nachricht schreiben…"
                className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder-gray-600 max-h-32 py-1"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ↑
              </button>
            </div>
            <p className="text-xs text-gray-700 mt-1.5 text-center">Enter senden · Shift+Enter neue Zeile</p>
          </div>
        </div>

        {/* ── Memory panel ── */}
        {showMemory && (
          <aside className="w-72 border-l border-gray-800 bg-gray-900 flex flex-col overflow-hidden shrink-0">
            <div className="px-4 py-3 border-b border-gray-800">
              <h2 className="font-bold text-sm">🧠 Gedächtnis</h2>
              <p className="text-xs text-gray-500 mt-0.5">Von Ollama extrahierte Fakten. Werden als Kontext mitgegeben.</p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {memories.length === 0 && (
                <p className="text-xs text-gray-600 pt-2">
                  Noch keine Erinnerungen. Nach dem ersten Gespräch merkt sich Ollama relevante Informationen.
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
            <div className="px-4 py-3 border-t border-gray-800">
              <p className="text-xs text-gray-600">Alle Erinnerungen sind nur für dich sichtbar und dauerhaft gespeichert.</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
