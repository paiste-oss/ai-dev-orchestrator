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

import TopBar from "@/components/chat/TopBar";
import CanvasCard from "@/components/chat/CanvasCard";
import AvatarCircle from "@/components/chat/AvatarCircle";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";
import MemoryPanel from "@/components/chat/MemoryPanel";
import CameraModal from "@/components/chat/CameraModal";
import SetupModal from "@/components/chat/SetupModal";

import StockCard from "@/components/chat/StockCard";
import StockHistoryCard from "@/components/chat/StockHistoryCard";
import ImageGalleryCard from "@/components/chat/ImageGalleryCard";
import TransportBoardCard from "@/components/chat/TransportBoardCard";
import ActionButtonsCard from "@/components/chat/ActionButtonsCard";
import BrowserViewCard from "@/components/chat/BrowserViewCard";
import BrowserWindowCard from "@/components/chat/BrowserWindowCard";
import WhiteboardWindow from "@/components/windows/WhiteboardWindow";
import ImageViewerWindow from "@/components/windows/ImageViewerWindow";
import NetzwerkWindow from "@/components/windows/NetzwerkWindow";
import { WINDOW_MODULES } from "@/lib/window-registry";

// ── Canvas card state ─────────────────────────────────────────────────────────

interface CardData {
  id: string;
  title: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  zIndex: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

function richCardMeta(responseType: string): { title: string; width: number; height: number } {
  switch (responseType) {
    case "stock_card":      return { title: "📈 Aktienkurs",    width: 320, height: 240 };
    case "stock_history":   return { title: "📊 Kursverlauf",   width: 440, height: 340 };
    case "image_gallery":   return { title: "🖼 Bilder",        width: 520, height: 380 };
    case "transport_board": return { title: "🚆 Abfahrten",     width: 400, height: 320 };
    case "action_buttons":  return { title: "⚡ Aktionen",      width: 320, height: 180 };
    case "browser_view":    return { title: "🌐 Browser",       width: 560, height: 440 };
    default:                return { title: "📦 Ergebnis",      width: 380, height: 300 };
  }
}

// Spawnt Fenster-Karte aus Baddi's [FENSTER:]-Marker
function openWindowData(canvasType: string): { title: string; width: number; height: number } | null {
  const mod = WINDOW_MODULES.find(m => m.canvasType === canvasType);
  if (!mod) return null;
  return { title: `${mod.icon} ${mod.label}`, width: mod.defaultWidth, height: mod.defaultHeight };
}

const CHAT_CARD_ID = "chat";
const suggestions = ["Was kannst du?", "Erkläre mir etwas", "Öffne eine Webseite", "Aktuelle Nachrichten"];

// ── Page ─────────────────────────────────────────────────────────────────────

const CANVAS_STORAGE_KEY = "baddi_canvas_cards";

// Strip large binary data before saving
function stripForStorage(cards: CardData[]): CardData[] {
  return cards.map(c => {
    if (!c.data) return c;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { ...c.data };
    delete data.screenshot_b64; // browser screenshots können MB gross sein
    return { ...c, data };
  });
}

function loadPersistedCards(): CardData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CardData[];
  } catch { return []; }
}

// Viewport-aware initial chat card size
function initialChatCard(): CardData {
  if (typeof window === "undefined") {
    return { id: CHAT_CARD_ID, title: "💬 Gespräch", type: "chat", x: 24, y: 16, width: 500, height: 560, minimized: false, zIndex: 1 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const topBarH = 48;
  const inputH = 80;
  const available = vh - topBarH - inputH - 32;
  const w = Math.min(520, Math.max(320, Math.floor(vw * 0.5)));
  const h = Math.min(available, Math.max(400, Math.floor(vh * 0.75)));
  return { id: CHAT_CARD_ID, title: "💬 Gespräch", type: "chat", x: 24, y: 16, width: w, height: h, minimized: false, zIndex: 1 };
}

function initialCards(): CardData[] {
  const persisted = loadPersistedCards();
  const chatCard = persisted.find(c => c.id === CHAT_CARD_ID) ?? initialChatCard();
  const others = persisted.filter(c => c.id !== CHAT_CARD_ID);
  return [chatCard, ...others];
}

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

  // Viewport size tracking
  const [vw, setVw] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  const isMobile = vw < 768;

  useEffect(() => {
    function onResize() { setVw(window.innerWidth); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Canvas cards state — restored from localStorage
  const [cards, setCards] = useState<CardData[]>(() => initialCards());

  // Persist cards to localStorage whenever they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(stripForStorage(cards)));
  }, [cards]);
  const topZ = useRef(2);
  const processedMsgs = useRef(new Set<string>());

  const chatScrollRef = useRef<HTMLDivElement>(null);
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

  // Auto-scroll chat card
  useEffect(() => {
    if (!userScrolledUp.current) {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  // Spawn canvas cards for rich responses
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.structuredData) return;
    if (last.responseType === "text" || !last.responseType) return;
    if (processedMsgs.current.has(last.id)) return;
    processedMsgs.current.add(last.id);

    topZ.current++;
    const spread = (processedMsgs.current.size - 1) % 5;
    const chatCard = cards.find(c => c.id === CHAT_CARD_ID);
    const baseX = (chatCard ? chatCard.x + chatCard.width + 24 : 548) + spread * 16;
    const baseY = 16 + spread * 24;

    // Baddi öffnet ein Fenster via [FENSTER:]-Marker
    if (last.responseType === "open_window") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = last.structuredData as any;
      const wMeta = openWindowData(d.canvasType);
      if (wMeta) {
        setCards(cs => [...cs, {
          id: `win-${last.id}`,
          title: wMeta.title,
          type: d.canvasType,
          x: baseX, y: baseY,
          width: wMeta.width, height: wMeta.height,
          minimized: false,
          zIndex: topZ.current,
          data: d.url ? { url: d.url } : {},
        }]);
      }
      return;
    }

    // Baddi schließt ein Fenster via [FENSTER_SCHLIESSEN:]-Marker
    if (last.responseType === "close_window") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = last.structuredData as any;
      setCards(cs => cs.filter(c => c.id === CHAT_CARD_ID || c.type !== d.canvasType));
      return;
    }

    const meta = richCardMeta(last.responseType);
    setCards(cs => [...cs, {
      id: `rich-${last.id}`,
      title: meta.title,
      type: last.responseType ?? "text",
      x: baseX, y: baseY,
      width: meta.width, height: meta.height,
      minimized: false,
      zIndex: topZ.current,
      data: last.structuredData,
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Canvas card management
  const moveCard = useCallback((id: string, x: number, y: number) => {
    setCards(cs => cs.map(c => c.id === id ? { ...c, x, y } : c));
  }, []);

  const resizeCard = useCallback((id: string, width: number, height: number) => {
    setCards(cs => cs.map(c => c.id === id ? { ...c, width, height } : c));
  }, []);

  const focusCard = useCallback((id: string) => {
    topZ.current++;
    const z = topZ.current;
    setCards(cs => cs.map(c => c.id === id ? { ...c, zIndex: z } : c));
  }, []);

  const closeCard = useCallback((id: string) => {
    setCards(cs => cs.filter(c => c.id !== id));
  }, []);

  const minimizeCard = useCallback((id: string) => {
    setCards(cs => cs.map(c => c.id === id ? { ...c, minimized: !c.minimized } : c));
  }, []);

  // Spawn a new card (from "+" button or from rich content callbacks)
  const spawnCard = useCallback((type: string, title: string, width: number, height: number, data?: unknown) => {
    topZ.current++;
    const offset = cards.length * 20;
    setCards(cs => [...cs, {
      id: `${type}-${Date.now()}`,
      title, type,
      x: 40 + offset, y: 40 + offset,
      width, height,
      minimized: false,
      zIndex: topZ.current,
      data,
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length]);

  const handleAddCard = useCallback((canvasType: string) => {
    const mod = WINDOW_MODULES.find(m => m.canvasType === canvasType);
    if (mod) spawnCard(mod.canvasType, `${mod.icon} ${mod.label}`, mod.defaultWidth, mod.defaultHeight);
  }, [spawnCard]);

  // Helpers
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
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.text) setInput(prev => prev ? `${prev} ${data.text}` : data.text);
    } catch {
      setInput(prev => `${prev}[Audio konnte nicht transkribiert werden]`);
    } finally {
      textareaRef.current?.focus();
    }
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragOver(true); }
  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragOver(false);
    for (const f of Array.from(e.dataTransfer.files)) {
      if (f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|mpeg|mpga)$/i.test(f.name)) {
        await transcribeAudio(f);
      } else {
        setAttachedFiles(prev => [...prev, { file: f, id: `drop-${Date.now()}` }]);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  async function handleSend() {
    // Force scroll to bottom on send
    userScrolledUp.current = false;
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
    const provider = await sendMessage({
      input, attachedFiles,
      onUiUpdate: (update) => setUiPrefs(p => ({ ...p, ...update })),
      speak, stripMarkdown,
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

  // Render rich content inside a canvas card
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderRichCard(type: string, data: any) {
    switch (type) {
      case "stock_card":      return <div className="h-full overflow-auto p-2"><StockCard data={data} /></div>;
      case "stock_history":   return <div className="h-full overflow-auto p-2"><StockHistoryCard data={data} /></div>;
      case "image_gallery":   return <div className="h-full overflow-auto p-2"><ImageGalleryCard data={data} /></div>;
      case "transport_board": return <div className="h-full overflow-auto p-2"><TransportBoardCard data={data} /></div>;
      case "action_buttons":  return <div className="h-full overflow-auto p-2"><ActionButtonsCard data={data} /></div>;
      case "browser_view":    return <div className="h-full overflow-auto p-2"><BrowserViewCard data={data} /></div>;
      default: return <div className="p-4 text-sm text-gray-400">{JSON.stringify(data, null, 2)}</div>;
    }
  }

  const bgColor = BG_COLORS[uiPrefs.background] ?? "#030712";

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────────────
  if (isMobile) return (
    <div className="flex flex-col h-[100dvh] text-white overflow-hidden" style={{ background: bgColor }}>
      <TopBar
        buddyName={uiPrefs.buddyName ?? "Baddi"}
        buddyInitial={buddyInitial}
        speaking={speaking}
        ttsEnabled={ttsEnabled}
        lastProvider={lastProvider}
        memoriesCount={memories.length}
        firstName={firstName}
        isAdmin={user?.role === "admin"}
        onToggleTts={() => { if (ttsEnabled && audioRef.current) audioRef.current.pause(); else unlockAudio(); setTtsEnabled(v => !v); }}
        onToggleMemory={() => setShowMemory(v => !v)}
        onSettings={() => setSetupOpen(true)}
        onLogout={() => { clearSession(); router.push("/"); }}
        onAdminBack={() => router.push("/admin")}
      />
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
        onScroll={() => {
          const el = chatScrollRef.current;
          if (!el) return;
          userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
        }}
      >
        {!historyLoaded && <p className="text-center text-gray-600 text-sm pt-8">Lade Verlauf…</p>}
        {historyLoaded && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[60%] gap-4 text-center py-8">
            <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center ${speaking ? "shadow-[0_0_0_8px_rgba(99,102,241,0.2)]" : ""} transition-all`}>
              <span className="text-white font-bold text-xl">{buddyInitial}</span>
            </div>
            <div>
              <h2 className="font-semibold text-white">Hallo{firstName ? `, ${firstName}` : ""}!</h2>
              <p className="text-gray-400 text-sm mt-1">Wie kann ich dir helfen?</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="px-3 py-1.5 rounded-full text-xs text-gray-300 bg-white/5 hover:bg-white/10 border border-white/8 transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => (
          <ChatMessage key={msg.id} msg={msg} uiPrefs={uiPrefs} copied={copied} onCopy={handleCopy} buddyInitial={buddyInitial} />
        ))}
        {loading && (
          <div className="flex gap-2 items-center">
            <AvatarCircle speaking={true} initial={buddyInitial} />
            <div className="flex gap-1 py-2">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-white/5" style={{ background: "rgba(5,10,20,0.95)" }}>
        <ChatInput
          input={input} onChange={setInput} onSend={handleSend} onKeyDown={handleKeyDown}
          loading={loading} attachedFiles={attachedFiles} onFilesChange={setAttachedFiles}
          onAttachClick={() => fileInputRef.current?.click()} onCameraClick={openCamera}
          onVoiceResult={handleVoiceResult} buddyName={uiPrefs.buddyName}
          fontSize={uiPrefs.fontSize} textareaRef={textareaRef} compact
        />
      </div>
      <input ref={fileInputRef} type="file" multiple className="hidden"
        accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm"
        onChange={handleFileInputChange}
      />
      {showMemory && <MemoryPanel memories={memories} buddyName={uiPrefs.buddyName} onDelete={deleteMemory} onClose={() => setShowMemory(false)} />}
      {setupOpen && <SetupModal onClose={() => setSetupOpen(false)} onNavigate={href => { setSetupOpen(false); router.push(href); }} onLogout={() => { clearSession(); router.push("/"); }} />}
      {cameraOpen && <CameraModal videoRef={videoRef} onClose={closeCamera} onCapture={() => capturePhoto(file => { setAttachedFiles(prev => [...prev, { file, id: `cam-${Date.now()}` }]); })} />}
    </div>
  );

  // ── DESKTOP CANVAS LAYOUT ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] text-white overflow-hidden" style={{ background: bgColor }}>

      {/* ── TOP BAR ── */}
      <TopBar
        buddyName={uiPrefs.buddyName ?? "Baddi"}
        buddyInitial={buddyInitial}
        speaking={speaking}
        ttsEnabled={ttsEnabled}
        lastProvider={lastProvider}
        memoriesCount={memories.length}
        firstName={firstName}
        isAdmin={user?.role === "admin"}
        onToggleTts={() => {
          if (ttsEnabled && audioRef.current) audioRef.current.pause();
          else unlockAudio();
          setTtsEnabled(v => !v);
        }}
        onToggleMemory={() => setShowMemory(v => !v)}
        onSettings={() => setSetupOpen(true)}
        onLogout={() => { clearSession(); router.push("/"); }}
        onAdminBack={() => router.push("/admin")}
        onAddCard={handleAddCard}
      />

      {/* ── WHITEBOARD CANVAS ── */}
      <div
        className="flex-1 relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-950/80 border-2 border-dashed border-indigo-400 pointer-events-none">
            <div className="text-center">
              <p className="text-4xl mb-3">📎</p>
              <p className="text-indigo-200 font-semibold text-lg">Datei hier ablegen</p>
              <p className="text-indigo-400 text-sm mt-1">Bilder, Videos, PDFs, Dokumente…</p>
            </div>
          </div>
        )}

        {/* ── CANVAS CARDS ── */}
        {cards.map(card => (
          <CanvasCard
            key={card.id}
            id={card.id}
            title={card.title}
            x={card.x} y={card.y}
            width={card.width} height={card.height}
            minimized={card.minimized}
            zIndex={card.zIndex}
            closable={card.id !== CHAT_CARD_ID}
            onMove={moveCard}
            onResize={resizeCard}
            onFocus={focusCard}
            onClose={closeCard}
            onMinimize={minimizeCard}
          >
            {card.type === "browser_window" ? (
              <BrowserWindowCard
                initialUrl={card.data?.url ?? ""}
                onUrlChange={(url) => setCards(cs => cs.map(c => c.id === card.id ? { ...c, data: { ...c.data, url } } : c))}
                onNaturalSize={(w, h) => {
                  // Maintain 16:9 screenshot aspect ratio, max 800px wide
                  const maxW = 800;
                  const fw = Math.min(w, maxW);
                  const fh = Math.round(fw / w * h);
                  resizeCard(card.id, fw, fh + 80); // +80 for URL bar + type bar
                }}
              />
            ) : card.type === "whiteboard" ? (
              <WhiteboardWindow
                boardId={card.data?.boardId}
                onBoardId={(id) => setCards(cs => cs.map(c => c.id === card.id ? { ...c, data: { ...c.data, boardId: id } } : c))}
              />
            ) : card.type === "image_viewer" ? (
              <ImageViewerWindow
                initialUrl={card.data?.url ?? ""}
                onNaturalSize={(w, h) => resizeCard(card.id, Math.min(w, 900), Math.min(h, 640) + 44)}
              />
            ) : card.type === "netzwerk" ? (
              <NetzwerkWindow
                boardId={card.data?.boardId}
                onBoardId={(id) => setCards(cs => cs.map(c => c.id === card.id ? { ...c, data: { ...c.data, boardId: id } } : c))}
              />
            ) : card.type === "chat" ? (
              /* ── Main chat card content ── */
              <div
                ref={chatScrollRef}
                className="h-full overflow-y-auto px-4 py-4 space-y-4"
                onScroll={() => {
                  const el = chatScrollRef.current;
                  if (!el) return;
                  userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
                }}
              >
                {!historyLoaded && (
                  <p className="text-center text-gray-600 text-sm pt-8">Lade Verlauf…</p>
                )}

                {historyLoaded && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center min-h-[60%] gap-5 text-center py-8">
                    <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-900/40 ${speaking ? "shadow-[0_0_0_10px_rgba(99,102,241,0.2)] scale-105" : ""} transition-all`}>
                      <span className="text-white font-bold text-2xl">{buddyInitial}</span>
                    </div>
                    <div>
                      <h2 className="font-semibold text-white text-lg">
                        Hallo{firstName ? `, ${firstName}` : ""}!
                      </h2>
                      <p className="text-gray-400 text-sm mt-1">Wie kann ich dir heute helfen?</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                      {suggestions.map(s => (
                        <button key={s} onClick={() => setInput(s)}
                          className="px-3 py-1.5 rounded-full text-xs text-gray-300 bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/15 transition-all">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map(msg => (
                  <ChatMessage
                    key={msg.id}
                    msg={msg}
                    uiPrefs={uiPrefs}
                    copied={copied}
                    onCopy={handleCopy}
                    buddyInitial={buddyInitial}
                    hideRichContent
                  />
                ))}

                {loading && (
                  <div className="flex gap-3">
                    <AvatarCircle speaking={true} initial={buddyInitial} />
                    <div className="flex items-center gap-1.5 py-3">
                      <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              renderRichCard(card.type, card.data)
            )}
          </CanvasCard>
        ))}
      </div>

      {/* ── FLOATING INPUT ── */}
      <div className="shrink-0 px-4 pb-3 pt-2" style={{ background: "rgba(5,10,20,0.85)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
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
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" multiple className="hidden"
        accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm"
        onChange={handleFileInputChange}
      />

      {/* ── OVERLAYS ── */}
      {showMemory && (
        <MemoryPanel memories={memories} buddyName={uiPrefs.buddyName}
          onDelete={deleteMemory} onClose={() => setShowMemory(false)} />
      )}
      {setupOpen && (
        <SetupModal onClose={() => setSetupOpen(false)}
          onNavigate={href => { setSetupOpen(false); router.push(href); }}
          onLogout={() => { clearSession(); router.push("/"); }} />
      )}
      {cameraOpen && (
        <CameraModal videoRef={videoRef} onClose={closeCamera}
          onCapture={() => capturePhoto(file => {
            setAttachedFiles(prev => [...prev, { file, id: `cam-${Date.now()}` }]);
          })} />
      )}
    </div>
  );
}
