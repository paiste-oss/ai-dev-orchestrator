"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiFetchForm, clearSession, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { AttachedFile } from "@/components/FileDropZone";
import { MemoryItem } from "@/lib/chat-types";

import { useChatMessages, UploadedFileInfo } from "@/hooks/useChatMessages";
import { useCamera } from "@/hooks/useCamera";
import { useTTS } from "@/hooks/useTTS";
import { useUiPrefs, BG_COLORS, FONT_COLORS } from "@/hooks/useUiPrefs";

import TopBar from "@/components/chat/TopBar";
import CanvasCard from "@/components/chat/CanvasCard";
import AvatarCircle from "@/components/chat/AvatarCircle";
import dynamic from "next/dynamic";
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
import DocumentsWindow from "@/components/windows/DocumentsWindow";
import DictationWindow from "@/components/windows/DictationWindow";
import FileViewerWindow from "@/components/windows/FileViewerWindow";
import MemoryWindow from "@/components/windows/MemoryWindow";
import DesignWindow from "@/components/windows/DesignWindow";
import ChartWindow from "@/components/windows/ChartWindow";
import GeoMapWindow from "@/components/windows/GeoMapWindow";
import AssistenzWindow from "@/components/windows/AssistenzWindow";
import { WINDOW_MODULES } from "@/lib/window-registry";
import MobilePinnedPanel from "@/components/mobile/MobilePinnedPanel";
import MobileWindowTray from "@/components/mobile/MobileWindowTray";
import MobileWindowPickerSheet from "@/components/mobile/MobileWindowPickerSheet";

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

  // Mobile Panel State
  const [activeMobileWindowId, setActiveMobileWindowId] = useState<string | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobilePanelHeight, setMobilePanelHeight] = useState(0.42);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showMobileWindowPicker, setShowMobileWindowPicker] = useState(false);

  useEffect(() => {
    function onResize() { setVw(window.innerWidth); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keyboard-Erkennung via visualViewport (Mobile)
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    function onVpResize() {
      setKeyboardVisible((window.visualViewport!.height) < window.innerHeight * 0.85);
    }
    window.visualViewport.addEventListener("resize", onVpResize);
    return () => window.visualViewport!.removeEventListener("resize", onVpResize);
  }, []);

  // Canvas cards state — restored from localStorage
  const [cards, setCards] = useState<CardData[]>(() => initialCards());

  // Persist cards to localStorage whenever they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(stripForStorage(cards)));
  }, [cards]);
  // topZ aus gespeicherten Karten initialisieren, damit neue Karten immer zuoberst erscheinen
  const topZ = useRef(Math.max(2, ...initialCards().map(c => c.zIndex)));
  const processedMsgs = useRef(new Set<string>());
  const prevMobileCardCountRef = useRef(-1);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, setMessages, loading, historyLoaded, loadHistory, sendMessage } = useChatMessages();
  const { cameraOpen, videoRef, openCamera, closeCamera, capturePhoto } = useCamera();
  const { speaking, setSpeaking, ttsEnabled, setTtsEnabled, audioRef, speak, stripMarkdown, unlockAudio } = useTTS();
  const { uiPrefs, setUiPrefs, loadPreferences, savePreferences } = useUiPrefs();
  const [emotion, setEmotion] = useState<string | null>(null);

  const firstName = user?.name?.split(" ")[0] ?? "";
  const buddyInitial = (uiPrefs.buddyName ?? "B").charAt(0).toUpperCase();
  const voiceLang = ({
    de: "de-CH", gsw: "de-CH",
    en: "en-US", fr: "fr-FR", it: "it-IT",
    es: "es-ES", pt: "pt-PT", nl: "nl-NL", pl: "pl-PL", tr: "tr-TR",
  } as Record<string, string>)[uiPrefs.language ?? "de"] ?? "de-CH";

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    loadHistory();
    loadMemories();
    loadPreferences();
    // Prefs neu laden wenn Nutzer aus Einstellungen zurückkommt (auch mobile)
    const onVisible = () => { if (document.visibilityState === "visible") loadPreferences(); };
    const onStorage = (e: StorageEvent) => { if (e.key === "prefs_updated") loadPreferences(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll chat card
  useEffect(() => {
    if (!userScrolledUp.current) {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  // Keep scroll anchored to bottom when container resizes (window resize, mobile keyboard)
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!userScrolledUp.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
          data: d.symbols ? { symbols: d.symbols } : d.symbol ? { symbol: d.symbol } : d.east ? { east: d.east, north: d.north, zoom: d.zoom, bgLayer: d.bgLayer } : d.url ? { url: d.url } : {},
        }]);
      }
      return;
    }

    // Baddi öffnet ein Dokument via [DOKUMENT:]-Marker
    if (last.responseType === "open_document") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = last.structuredData as any;
      const filename: string = d.filename ?? "";
      // Dokumente laden, passendes finden, öffnen
      apiFetch(`${BACKEND_URL}/v1/documents/mine`).then(async res => {
        if (!res.ok) return;
        const docs = await res.json();
        const doc = docs.find((x: { original_filename: string }) =>
          x.original_filename.toLowerCase().includes(filename.toLowerCase())
        );
        if (!doc) return;
        const contentRes = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/content`);
        if (!contentRes.ok) return;
        const blob = await contentRes.blob();
        const url = URL.createObjectURL(blob);
        spawnCard("file_viewer", `📄 ${doc.original_filename}`, 720, 540, {
          url, filename: doc.original_filename, fileType: doc.file_type, mimeType: doc.mime_type,
        });
      });
      return;
    }

    // Baddi öffnet URL in neuem Tab
    if (last.responseType === "open_url") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = last.structuredData as any;
      if (d?.url) window.open(d.url, "_blank", "noopener,noreferrer");
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

  // Auto-open Panel auf Mobile wenn neue Karte gespawnt wird
  useEffect(() => {
    if (!isMobile) return;
    const nonChatCards = cards.filter(c => c.id !== CHAT_CARD_ID);
    // Ersten Render: Desktop-Karten aus localStorage entfernen (gehören nicht auf Mobile)
    if (prevMobileCardCountRef.current === -1) {
      prevMobileCardCountRef.current = 0;
      if (nonChatCards.length > 0) {
        setCards(cs => cs.filter(c => c.id === CHAT_CARD_ID));
      }
      return;
    }
    // Aktive Karte wurde entfernt → auf letzte verfügbare wechseln
    if (activeMobileWindowId && !cards.find(c => c.id === activeMobileWindowId)) {
      if (nonChatCards.length > 0) {
        setActiveMobileWindowId(nonChatCards[nonChatCards.length - 1].id);
      } else {
        setActiveMobileWindowId(null);
        setMobilePanelOpen(false);
      }
    }
    // Neue Karte hinzugekommen → Panel öffnen
    if (nonChatCards.length > prevMobileCardCountRef.current) {
      setActiveMobileWindowId(nonChatCards[nonChatCards.length - 1].id);
      setMobilePanelOpen(true);
    }
    prevMobileCardCountRef.current = nonChatCards.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, isMobile]);

  // Canvas card management
  const moveCard = useCallback((id: string, x: number, y: number) => {
    // Snap-to-Bounds: Titelleiste muss immer sichtbar bleiben
    const canvas = canvasRef.current;
    if (canvas) {
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      x = Math.max(-180, Math.min(cw - 60, x));  // 60px min. sichtbar rechts/links
      y = Math.max(0, Math.min(ch - 36, y));       // Titelleiste darf nicht aus Canvas raus
    }
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

  const maximizeCard = useCallback((id: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = 8;
    setCards(cs => cs.map(c => c.id === id
      ? { ...c, x: pad, y: pad, width: canvas.clientWidth - pad * 2, height: canvas.clientHeight - pad * 2, minimized: false }
      : c));
  }, []);

  const halfCard = useCallback((id: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = 8;
    const halfW = Math.floor((canvas.clientWidth - pad * 3) / 2);
    const h = canvas.clientHeight - pad * 2;
    // Abwechselnd links/rechts je nach aktueller Position
    setCards(cs => cs.map(c => {
      if (c.id !== id) return c;
      const goRight = c.x > canvas.clientWidth / 2 - 50;
      return { ...c, x: goRight ? pad * 2 + halfW : pad, y: pad, width: halfW, height: h, minimized: false };
    }));
  }, []);

  // Auto-Layout: Fenster automatisch in Grid anordnen
  const autoLayoutCards = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const pad = 12;

    setCards(cs => {
      const visible = cs.filter(c => !c.minimized);
      const n = visible.length;
      if (n === 0) return cs;

      // Spaltenanzahl je nach Fensteranzahl
      const cols = n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 2 : 3;
      const rows = Math.ceil(n / cols);
      const cellW = Math.floor((cw - pad * (cols + 1)) / cols);
      const cellH = Math.floor((ch - pad * (rows + 1)) / rows);

      let idx = 0;
      return cs.map(c => {
        if (c.minimized) return c;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        idx++;
        return {
          ...c,
          x: pad + col * (cellW + pad),
          y: pad + row * (cellH + pad),
          width: Math.max(cellW, 280),
          height: Math.max(cellH, 200),
        };
      });
    });
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
    if (mod) {
      spawnCard(mod.canvasType, `${mod.icon} ${mod.label}`, mod.defaultWidth, mod.defaultHeight);
      if (canvasType === "memory") loadMemories();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawnCard]);

  const handleOpenFile = useCallback(({ url, filename, fileType }: { url: string; filename: string; fileType: string }) => {
    spawnCard("file_viewer", `📄 ${filename}`, 720, 600, { url, filename, fileType });
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
      const res = await apiFetchForm(`${BACKEND_URL}/v1/chat/transcribe`, formData);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.text) setInput(prev => prev ? `${prev} ${data.text}` : data.text);
    } catch {
      setInput(prev => `${prev}[Audio konnte nicht transkribiert werden]`);
    } finally {
      if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        textareaRef.current?.focus();
      }
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
      onUiUpdate: async (update) => {
        // Wenn backgroundImage eine externe URL ist → als base64 herunterladen (DALL-E URLs laufen ab)
        if (update.backgroundImage && (update.backgroundImage as string).startsWith("http")) {
          try {
            const res = await fetch(update.backgroundImage as string);
            const blob = await res.blob();
            const dataUrl = await new Promise<string>((resolve) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement("canvas");
                const maxW = 1920, maxH = 1080;
                let { naturalWidth: w, naturalHeight: h } = img;
                if (w > maxW || h > maxH) {
                  const r = Math.min(maxW / w, maxH / h);
                  w = Math.round(w * r); h = Math.round(h * r);
                }
                canvas.width = w; canvas.height = h;
                canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.80));
              };
              img.src = URL.createObjectURL(blob);
            });
            update = { ...update, backgroundImage: dataUrl as any };
            // base64 dauerhaft ins Backend speichern (URL würde ablaufen)
            apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
              method: "POST",
              body: JSON.stringify({ backgroundImage: dataUrl }),
            }).catch(() => {});
          } catch { /* bei Fehler URL direkt verwenden */ }
        }
        setUiPrefs(p => ({ ...p, ...update }));
      },
      speak, stripMarkdown,
      onAfterSend: () => setInput(""),
      onFilesChange: setAttachedFiles,
      onFileUploaded: ({ filename, blobUrl, fileType }: UploadedFileInfo) => {
        spawnCard("file_viewer", `📄 ${filename}`, 680, 560, { url: blobUrl, filename, fileType });
      },
      setSpeaking,
      focusTextarea: () => textareaRef.current?.focus(),
      onEmotion: (e) => setEmotion(e),
    });
    if (provider) setLastProvider(provider);
    setTimeout(loadMemories, 6000);
    setTimeout(loadMemories, 12000);
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

  // ── Fenster-Inhalt rendern (geteilt Desktop + Mobile) ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderWindowContent(card: CardData): React.ReactNode {
    switch (card.type) {
      case "browser_window": return (
        <BrowserWindowCard
          initialUrl={card.data?.url ?? ""}
          onUrlChange={(url) => setCards(cs => cs.map(c => c.id === card.id ? { ...c, data: { ...c.data, url } } : c))}
          onNaturalSize={(w, h) => {
            const maxW = 800; const fw = Math.min(w, maxW); const fh = Math.round(fw / w * h);
            resizeCard(card.id, fw, fh + 80);
          }}
        />
      );
      case "whiteboard": return (
        <WhiteboardWindow
          boardId={card.data?.boardId}
          onBoardId={(id) => setCards(cs => cs.map(c => c.id === card.id ? { ...c, data: { ...c.data, boardId: id } } : c))}
        />
      );
      case "image_viewer": return (
        <ImageViewerWindow
          initialUrl={card.data?.url ?? ""}
          onNaturalSize={(w, h) => resizeCard(card.id, Math.min(w, 900), Math.min(h, 640) + 44)}
        />
      );
      case "netzwerk": return (
        <NetzwerkWindow
          boardId={card.data?.boardId}
          onBoardId={(id) => setCards(cs => cs.map(c => c.id === card.id ? { ...c, data: { ...c.data, boardId: id } } : c))}
        />
      );
      case "memory": return (
        <MemoryWindow buddyName={uiPrefs.buddyName ?? "Baddi"} memories={memories} onDelete={deleteMemory} onRefresh={loadMemories} />
      );
      case "chart": return (
        <ChartWindow initialSymbol={card.data?.symbol} initialSymbols={card.data?.symbols} />
      );
      case "geo_map": return (
        <GeoMapWindow east={card.data?.east} north={card.data?.north} zoom={card.data?.zoom} bgLayer={card.data?.bgLayer} />
      );
      case "assistenz": return (
        <AssistenzWindow initialUrl={card.data?.url} />
      );
      case "design": return (
        <DesignWindow prefs={uiPrefs} onPrefsChange={patch => setUiPrefs(p => ({ ...p, ...patch }))} />
      );
      case "documents": return (
        <DocumentsWindow onOpenFile={handleOpenFile} />
      );
      case "diktieren": return (
        <DictationWindow language={uiPrefs.language} />
      );
      case "file_viewer": return (
        <FileViewerWindow
          url={card.data?.url ?? ""}
          filename={card.data?.filename ?? "Datei"}
          fileType={card.data?.fileType}
          mimeType={card.data?.mimeType}
        />
      );
      default: return renderRichCard(card.type, card.data);
    }
  }

  const bgColor = BG_COLORS[uiPrefs.background] ?? "#030712";
  const fontColor = FONT_COLORS[uiPrefs.fontColor] ?? "#ffffff";
  const bgStyle = uiPrefs.backgroundImage
    ? { backgroundImage: `url(${uiPrefs.backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center", color: fontColor }
    : { background: bgColor, color: fontColor };

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────────────
  if (isMobile) {
    const nonChatCards = cards.filter(c => c.id !== CHAT_CARD_ID);
    const activeCard = activeMobileWindowId ? cards.find(c => c.id === activeMobileWindowId) : null;
    const showChat = !mobilePanelOpen;

    return (
      <div className="flex flex-col h-[100dvh] overflow-hidden" style={bgStyle}>
        <TopBar
          buddyName={uiPrefs.buddyName ?? "Baddi"}
          buddyInitial={buddyInitial}
          speaking={speaking}
          lastProvider={lastProvider}
          firstName={firstName}
          isAdmin={user?.role === "admin"}
          avatar={uiPrefs.avatarType ?? "robot"}
          emotion={emotion}
          onSettings={() => setSetupOpen(true)}
          onLogout={() => { clearSession(); router.push("/"); }}
          onAdminBack={() => router.push("/admin")}
        />

        {/* ── Chat Scroll — versteckt wenn Panel offen ── */}
        <div
          ref={chatScrollRef}
          className={`overflow-y-auto px-3 py-3 space-y-3 min-h-0 ${showChat ? "flex-1" : "hidden"}`}
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

        {/* ── Panel — füllt den Platz des Chats wenn offen ── */}
        {mobilePanelOpen && activeCard && (
          <MobilePinnedPanel
            card={activeCard}
            onClose={() => setMobilePanelOpen(false)}
          >
            {renderWindowContent(activeCard)}
          </MobilePinnedPanel>
        )}

        {/* ── Window Tray (direkt über Eingabe) ── */}
        <MobileWindowTray
          cards={nonChatCards}
          activeWindowId={activeMobileWindowId}
          panelOpen={mobilePanelOpen}
          onActivate={(id) => { setActiveMobileWindowId(id); setMobilePanelOpen(true); }}
          onClose={(id) => {
            closeCard(id);
            if (id === activeMobileWindowId) setMobilePanelOpen(false);
          }}
          onAdd={() => setShowMobileWindowPicker(true)}
          onShowChat={() => setMobilePanelOpen(false)}
        />

        {/* ── Input (ganz unten) ── */}
        {/* ── Modus-Toggle ── */}
        <div className="flex justify-center pb-1 shrink-0">
          <button
            onClick={() => {
              const next = uiPrefs.chatMode === "fokus" ? "plauder" : "fokus";
              setUiPrefs(p => ({ ...p, chatMode: next }));
              apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
                method: "POST", body: JSON.stringify({ chatMode: next }),
              }).catch(() => {});
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all"
            style={{
              background: uiPrefs.chatMode === "plauder" ? "rgba(234,179,8,0.1)" : "rgba(99,102,241,0.1)",
              borderColor: uiPrefs.chatMode === "plauder" ? "rgba(234,179,8,0.3)" : "rgba(99,102,241,0.3)",
              color: uiPrefs.chatMode === "plauder" ? "#fbbf24" : "#818cf8",
            }}
          >
            {uiPrefs.chatMode === "plauder" ? "💬 Plauder-Modus" : "🎯 Fokus-Modus"}
          </button>
        </div>

        <ChatInput
          input={input} onChange={setInput} onSend={handleSend} onKeyDown={handleKeyDown}
          loading={loading} attachedFiles={attachedFiles} onFilesChange={setAttachedFiles}
          onAttachClick={() => fileInputRef.current?.click()} onCameraClick={openCamera}
          onVoiceResult={handleVoiceResult} buddyName={uiPrefs.buddyName}
          fontSize={uiPrefs.fontSize} voiceLang={voiceLang} language={uiPrefs.language} textareaRef={textareaRef} compact
        />

        {/* ── Hidden File Input ── */}
        <input ref={fileInputRef} type="file" multiple className="hidden"
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm"
          onChange={handleFileInputChange}
        />

        {/* ── Mobile Window Picker ── */}
        <MobileWindowPickerSheet
          open={showMobileWindowPicker}
          onClose={() => setShowMobileWindowPicker(false)}
          onSelect={(type) => { handleAddCard(type); setShowMobileWindowPicker(false); }}
        />

        {/* ── Overlays ── */}
        {showMemory && <MemoryPanel memories={memories} buddyName={uiPrefs.buddyName} onDelete={deleteMemory} onClose={() => setShowMemory(false)} />}
        {setupOpen && <SetupModal onClose={() => setSetupOpen(false)} onNavigate={href => { setSetupOpen(false); router.push(href); }} onLogout={() => { clearSession(); router.push("/"); }} />}
        {cameraOpen && <CameraModal videoRef={videoRef} onClose={closeCamera} onCapture={() => capturePhoto(file => { setAttachedFiles(prev => [...prev, { file, id: `cam-${Date.now()}` }]); })} />}
      </div>
    );
  }

  // ── DESKTOP CANVAS LAYOUT ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden" style={bgStyle}>

      {/* ── TOP BAR ── */}
      <TopBar
        buddyName={uiPrefs.buddyName ?? "Baddi"}
        buddyInitial={buddyInitial}
        speaking={speaking}
        lastProvider={lastProvider}
        firstName={firstName}
        isAdmin={user?.role === "admin"}
        avatar={uiPrefs.avatarType ?? "robot"}
        emotion={emotion}
        onSettings={() => setSetupOpen(true)}
        onLogout={() => { clearSession(); router.push("/"); }}
        onAdminBack={() => router.push("/admin")}
        onAddCard={handleAddCard}
        onArrangeCards={autoLayoutCards}
      />

      {/* ── WHITEBOARD CANVAS ── */}
      <div
        ref={canvasRef}
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
            headerExtra={card.id === CHAT_CARD_ID ? (
              <button
                onClick={() => { if (ttsEnabled && audioRef.current) audioRef.current.pause(); else unlockAudio(); setTtsEnabled(v => !v); }}
                title={ttsEnabled ? "Stimme aus" : "Stimme ein"}
                className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${ttsEnabled ? "text-emerald-400" : "text-gray-600 hover:text-gray-300"}`}
              >
                {ttsEnabled ? "🔊" : "🔇"}
              </button>
            ) : undefined}
            onMove={moveCard}
            onResize={resizeCard}
            onFocus={focusCard}
            onClose={closeCard}
            onMinimize={minimizeCard}
            onMaximize={maximizeCard}
            onHalf={halfCard}
          >
            {card.type === "chat" ? (
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
              renderWindowContent(card)
            )}
          </CanvasCard>
        ))}

      </div>

      {/* ── FLOATING INPUT ── */}
      <div className="shrink-0 px-4 pb-3 pt-2" style={{ background: "transparent", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex justify-center pb-1.5">
          <button
            onClick={() => {
              const next = uiPrefs.chatMode === "fokus" ? "plauder" : "fokus";
              setUiPrefs(p => ({ ...p, chatMode: next }));
              apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
                method: "POST", body: JSON.stringify({ chatMode: next }),
              }).catch(() => {});
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all"
            style={{
              background: uiPrefs.chatMode === "plauder" ? "rgba(234,179,8,0.1)" : "rgba(99,102,241,0.1)",
              borderColor: uiPrefs.chatMode === "plauder" ? "rgba(234,179,8,0.3)" : "rgba(99,102,241,0.3)",
              color: uiPrefs.chatMode === "plauder" ? "#fbbf24" : "#818cf8",
            }}
          >
            {uiPrefs.chatMode === "plauder" ? "💬 Plauder-Modus" : "🎯 Fokus-Modus"}
          </button>
        </div>
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
          voiceLang={voiceLang}
          language={uiPrefs.language}
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
