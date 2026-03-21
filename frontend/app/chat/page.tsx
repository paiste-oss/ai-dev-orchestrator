"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiFetch, clearSession, getSession } from "@/lib/auth";
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

function AvatarCircle({ speaking }: { speaking: boolean }) {
  return (
    <div
      style={{ width: 40, height: 40 }}
      className={`relative rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
        speaking
          ? "shadow-[0_0_0_6px_rgba(99,102,241,0.35)] scale-105"
          : "shadow-[0_0_0_3px_rgba(255,255,255,0.08)]"
      }`}
    >
      <span className="text-white font-bold text-sm select-none">B</span>
      {speaking && (
        <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500 opacity-20" />
      )}
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const user = getSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const firstName = user?.name?.split(" ")[0] ?? "";

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    loadHistory();
    loadMemories();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadHistory() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/history?limit=60`);
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
        body: JSON.stringify({ message: text }),
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

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          {lastProvider && (
            <span className="text-xs text-gray-600 hidden sm:block">
              {lastProvider === "claude" ? "🟠 Claude" :
               lastProvider === "gemini" ? "🔵 Gemini" :
               lastProvider === "openai" ? "🟢 ChatGPT" : "🤖"}
            </span>
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
            🧠 {memories.length > 0 ? memories.length : ""}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSetupOpen(true)}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-800"
            title="Einstellungen"
          >
            ⚙
          </button>
          <button
            onClick={() => { clearSession(); router.push("/"); }}
            className="text-xs text-gray-500 hover:text-red-400 bg-white/5 hover:bg-red-500/5 border border-white/5 hover:border-red-500/20 px-3 py-1.5 rounded-lg transition-all"
          >
            Abmelden
          </button>
        </div>
      </header>

      {/* Setup Modal */}
      {setupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSetupOpen(false)} />
          <div className="relative bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-2 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">Konto & Einstellungen</h2>
              <button onClick={() => setSetupOpen(false)} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
            </div>

            {[
              { icon: "💳", label: "Wallet & Guthaben",  desc: "Guthaben aufladen, Limits, Auto-Topup", href: "/user/wallet" },
              { icon: "📋", label: "Abonnement",         desc: "Plan wechseln, Rechnungen ansehen",      href: "/user/billing" },
              { icon: "⚙",  label: "Einstellungen",      desc: "Profil, Sprache, Benachrichtigungen",   href: "/user/settings" },
            ].map(item => (
              <button
                key={item.href}
                onClick={() => { setSetupOpen(false); router.push(item.href); }}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all text-left"
              >
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
                <span className="ml-auto text-gray-600 text-sm">→</span>
              </button>
            ))}

            <div className="pt-2 border-t border-white/5">
              <button
                onClick={() => { clearSession(); router.push("/"); }}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all text-left"
              >
                <span className="text-2xl">🚪</span>
                <div>
                  <p className="text-sm font-semibold text-red-400">Abmelden</p>
                  <p className="text-xs text-gray-600">Von Baddi abmelden</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar (Desktop) ── */}
        <aside className="hidden md:flex w-56 shrink-0 border-r border-gray-800 bg-gray-900/50 flex-col items-center justify-start pt-10 pb-6 gap-4">
          <div className="flex flex-col items-center gap-3 px-4 w-full">
            <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl transition-all duration-300 ${
              speaking ? "shadow-[0_0_0_8px_rgba(99,102,241,0.3)] scale-105" : "shadow-[0_0_0_4px_rgba(255,255,255,0.06)]"
            }`}>
              🤖
            </div>
            <div className="text-center mt-1">
              <h2 className="font-bold text-lg text-white">Baddi</h2>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${speaking ? "bg-green-400 animate-pulse" : "bg-green-500"}`} />
                <span className="text-xs text-gray-400">{speaking ? "antwortet…" : "Online"}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Chat area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Mobile header bar */}
          <div className="md:hidden shrink-0 border-b border-gray-800 bg-gray-900/60 flex items-center gap-3 px-4 py-3">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-lg shrink-0 transition-all ${
              speaking ? "ring-2 ring-indigo-500/60" : ""
            }`}>
              🤖
            </div>
            <div>
              <p className="font-semibold text-sm text-white">Baddi</p>
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
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-xl">
                  🤖
                </div>
                <div>
                  <p className="font-semibold text-white text-lg">
                    Hallo{firstName ? `, ${firstName}` : ""}! Ich bin dein Baddi.
                  </p>
                  <p className="text-gray-400 text-sm mt-1">Wie kann ich dir heute helfen?</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex items-end gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <AvatarCircle speaking={false} />
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
                <AvatarCircle speaking={true} />
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
                placeholder="Nachricht an Baddi…"
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
                <p className="text-xs text-gray-500 mt-0.5">Was Baddi über dich weiss</p>
              </div>
              <button onClick={() => setShowMemory(false)} className="text-gray-600 hover:text-white text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {memories.length === 0 && (
                <p className="text-xs text-gray-600 pt-2 text-center leading-relaxed">
                  Noch keine Erinnerungen.<br />Nach dem ersten Gespräch merkt sich Baddi relevante Informationen.
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
