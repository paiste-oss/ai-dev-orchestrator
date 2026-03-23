"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearSession, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { AttachedFile } from "@/components/FileDropZone";
import { MemoryItem } from "@/lib/chat-types";

import { useChatMessages } from "@/hooks/useChatMessages";
import { useCamera } from "@/hooks/useCamera";
import { useTTS } from "@/hooks/useTTS";
import { useUiPrefs, BG_COLORS } from "@/hooks/useUiPrefs";

import AvatarCircle from "@/components/chat/AvatarCircle";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";
import ChatSidebar from "@/components/chat/ChatSidebar";
import MemoryPanel from "@/components/chat/MemoryPanel";
import CameraModal from "@/components/chat/CameraModal";
import SetupModal from "@/components/chat/SetupModal";

function providerLabel(p: string) {
  if (p === "claude") return "Claude";
  if (p === "gemini") return "Gemini";
  if (p === "openai") return "ChatGPT";
  return p;
}

const suggestions = ["Was kannst du?", "Erkläre mir etwas", "Aktuelle Nachrichten", "Öffne eine Webseite"];

export default function ChatPage() {
  const router = useRouter();
  const user = getSession();

  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showMemory, setShowMemory] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, setMessages, loading, historyLoaded, loadHistory, sendMessage } = useChatMessages();
  const { cameraOpen, videoRef, openCamera, closeCamera, capturePhoto } = useCamera();
  const { speaking, setSpeaking, ttsEnabled, setTtsEnabled, audioRef, speak, stripMarkdown, unlockAudio } = useTTS();
  const { uiPrefs, setUiPrefs, loadPreferences } = useUiPrefs();

  const firstName = user?.name?.split(" ")[0] ?? "";
  const buddyInitial = (uiPrefs.buddyName ?? "B").charAt(0).toUpperCase();

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    loadHistory();
    loadMemories();
    loadPreferences();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  async function loadMemories() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/memories`);
      if (res.ok) setMemories(await res.json());
    } catch { /* ignore */ }
  }

  async function deleteMemory(id: string) {
    try {
      await apiFetch(`${BACKEND_URL}/v1/chat/memories/${id}`, { method: "DELETE" });
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch { /* ignore */ }
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    for (const f of files) {
      if (f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|mpeg|mpga)$/i.test(f.name)) {
        await transcribeAudio(f);
      } else {
        setAttachedFiles(prev => [...prev, { file: f, id: `f-${Date.now()}-${Math.random()}` }]);
      }
    }
    e.target.value = "";
  }

  async function transcribeAudio(file: File) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${BACKEND_URL}/v1/chat/transcribe`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Transkription fehlgeschlagen");
      const data = await res.json();
      if (data.text) setInput(prev => prev ? `${prev} ${data.text}` : data.text);
    } catch {
      setInput(prev => `${prev}[Audio konnte nicht transkribiert werden]`);
    } finally {
      textareaRef.current?.focus();
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    for (const f of droppedFiles) {
      if (f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|mpeg|mpga)$/i.test(f.name)) {
        await transcribeAudio(f);
      } else {
        setAttachedFiles(prev => [...prev, { file: f, id: `drop-${Date.now()}-${Math.random()}` }]);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleSend() {
    const provider = await sendMessage({
      input,
      attachedFiles,
      onUiUpdate: (update) => setUiPrefs(p => ({ ...p, ...update })),
      speak,
      stripMarkdown,
      onAfterSend: () => { setInput(""); setAttachedFiles([]); },
      setSpeaking,
      focusTextarea: () => textareaRef.current?.focus(),
    });
    if (provider) setLastProvider(provider);
    setTimeout(loadMemories, 4000);
  }

  function handleCopy(id: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  const handleVoiceResult = useCallback((text: string) => {
    setInput(prev => prev ? `${prev} ${text}` : text);
  }, []);

  const uiStyle: React.CSSProperties = {
    backgroundColor: BG_COLORS[uiPrefs.background] ?? "#030712",
  };

  return (
    <div className="flex h-screen text-white overflow-hidden" style={uiStyle}>

      {/* ── LEFT SIDEBAR ── */}
      <ChatSidebar
        buddyName={uiPrefs.buddyName}
        buddyInitial={buddyInitial}
        firstName={firstName}
        onNewChat={() => { setMessages([]); setInput(""); setAttachedFiles([]); }}
        onLogout={() => { clearSession(); router.push("/"); }}
      />

      {/* ── MAIN AREA ── */}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag Overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-indigo-950/80 border-2 border-dashed border-indigo-400 pointer-events-none">
            <div className="text-center">
              <p className="text-4xl mb-3">📎</p>
              <p className="text-indigo-200 font-semibold text-lg">Datei hier ablegen</p>
              <p className="text-indigo-400 text-sm mt-1">Bilder, Videos, PDFs, Dokumente…</p>
            </div>
          </div>
        )}

        {/* ── TOP HEADER ── */}
        <header className="shrink-0 bg-gray-950/80 backdrop-blur border-b border-white/5 px-4 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {user?.role === "admin" && (
              <button
                onClick={() => router.push("/admin")}
                className="text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 px-2.5 py-1.5 rounded-lg transition-all shrink-0"
              >
                ← Zurück
              </button>
            )}
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-white text-sm truncate">{uiPrefs.buddyName}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${speaking ? "bg-green-400 animate-pulse" : "bg-green-500"}`} />
                <span className="text-xs text-gray-500 hidden sm:block">{speaking ? "antwortet…" : "Online"}</span>
              </div>
            </div>
          </div>

          {lastProvider && (
            <div className="hidden md:flex items-center">
              <span className="text-xs text-gray-500 bg-white/5 border border-white/8 px-2.5 py-1 rounded-full">
                {lastProvider === "claude" ? "🟠" : lastProvider === "gemini" ? "🔵" : lastProvider === "openai" ? "🟢" : "🤖"}{" "}
                {providerLabel(lastProvider)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowMemory(!showMemory)}
              title="Gedächtnis"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showMemory
                  ? "bg-violet-600/30 text-violet-300 border border-violet-500/30"
                  : "text-gray-500 hover:text-white hover:bg-white/5"
              }`}
            >
              🧠{memories.length > 0 && <span className="text-xs">{memories.length}</span>}
            </button>

            <button
              onClick={() => {
                if (ttsEnabled) {
                  if (audioRef.current) audioRef.current.pause();
                } else {
                  unlockAudio();
                }
                setTtsEnabled(v => !v);
              }}
              title={ttsEnabled ? "Baddi-Stimme aus" : "Baddi-Stimme ein"}
              className={`p-1.5 rounded-lg transition-colors text-sm ${
                ttsEnabled
                  ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                  : "text-gray-500 hover:text-white hover:bg-white/5"
              }`}
            >
              {ttsEnabled ? "🔊" : "🔇"}
            </button>

            <button
              onClick={() => setSetupOpen(true)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors text-sm"
              title="Einstellungen"
            >
              ⚙
            </button>

            <button
              onClick={() => { clearSession(); router.push("/"); }}
              className="lg:hidden text-xs text-gray-500 hover:text-red-400 bg-white/5 hover:bg-red-500/5 border border-white/5 hover:border-red-500/20 px-2.5 py-1.5 rounded-lg transition-all"
            >
              Abmelden
            </button>
          </div>
        </header>

        {/* ── MESSAGES AREA ── */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
          onScroll={() => {
            const el = scrollContainerRef.current;
            if (!el) return;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            userScrolledUp.current = !atBottom;
          }}
        >
          <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
            {!historyLoaded && (
              <p className="text-center text-gray-600 text-sm pt-10">Lade Verlauf…</p>
            )}

            {historyLoaded && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
                <div className={`w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-900/40 transition-all duration-300 ${
                  speaking ? "shadow-[0_0_0_12px_rgba(99,102,241,0.2)] scale-105" : ""
                }`}>
                  <span className="text-white font-bold text-3xl">{buddyInitial}</span>
                </div>
                <div>
                  <h2 className="font-semibold text-white text-xl">
                    Hallo{firstName ? `, ${firstName}` : ""}!
                  </h2>
                  <p className="text-gray-400 text-sm mt-1.5">Wie kann ich dir heute helfen?</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-sm">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="px-4 py-2 rounded-full text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/15 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                msg={msg}
                uiPrefs={uiPrefs}
                copied={copied}
                onCopy={handleCopy}
                buddyInitial={buddyInitial}
              />
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="shrink-0 mt-0.5">
                  <AvatarCircle speaking={true} initial={buddyInitial} />
                </div>
                <div className="flex items-center gap-1.5 py-3">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── INPUT AREA ── */}
        <ChatInput
          input={input}
          onChange={setInput}
          onSend={handleSend}
          onKeyDown={handleKeyDown}
          loading={loading}
          attachedFiles={attachedFiles}
          onFilesChange={setAttachedFiles}
          onAttachClick={() => fileInputRef.current?.click()}
          onCameraClick={openCamera}
          onVoiceResult={handleVoiceResult}
          buddyName={uiPrefs.buddyName}
          fontSize={uiPrefs.fontSize}
          textareaRef={textareaRef}
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm"
          onChange={handleFileInputChange}
        />
      </div>

      {/* ── RIGHT MEMORY PANEL ── */}
      {showMemory && (
        <MemoryPanel
          memories={memories}
          buddyName={uiPrefs.buddyName}
          onDelete={deleteMemory}
          onClose={() => setShowMemory(false)}
        />
      )}

      {/* ── SETUP MODAL ── */}
      {setupOpen && (
        <SetupModal
          onClose={() => setSetupOpen(false)}
          onNavigate={(href) => { setSetupOpen(false); router.push(href); }}
          onLogout={() => { clearSession(); router.push("/"); }}
        />
      )}

      {/* ── CAMERA MODAL ── */}
      {cameraOpen && (
        <CameraModal
          videoRef={videoRef}
          onClose={closeCamera}
          onCapture={() => capturePhoto((file) => {
            setAttachedFiles(prev => [...prev, { file, id: `cam-${Date.now()}` }]);
          })}
        />
      )}

    </div>
  );
}
