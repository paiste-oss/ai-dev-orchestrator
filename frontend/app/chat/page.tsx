"use client";

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiFetchForm, clearSession, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { AttachedFile } from "@/components/FileDropZone";
import {
  ArtifactEntry,
  MemoryItem,
  OpenWindowData,
  OpenDocumentData,
  OpenUrlData,
  CloseWindowData,
  NetzwerkAktionData,
  ImageGalleryData,
  FlightBoardData,
} from "@/lib/chat-types";
// ImageGalleryData used in renderWindowContent

import { useChatMessages, UploadedFileInfo } from "@/hooks/useChatMessages";
import { useArtifacts } from "@/hooks/useArtifacts";
import { useCamera } from "@/hooks/useCamera";
import { useTTS } from "@/hooks/useTTS";
import { useUiPrefs, BG_COLORS, WINDOW_BG_COLORS } from "@/hooks/useUiPrefs";

import TopBar from "@/components/chat/TopBar";
import ArtifactShell from "@/components/chat/ArtifactShell";
import AvatarCircle from "@/components/chat/AvatarCircle";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";
import MemoryPanel from "@/components/chat/MemoryPanel";
import CameraModal from "@/components/chat/CameraModal";
import SetupModal from "@/components/chat/SetupModal";

import WhiteboardWindow from "@/components/windows/WhiteboardWindow";
import ImageViewerWindow from "@/components/windows/ImageViewerWindow";
import NetzwerkWindow from "@/components/windows/NetzwerkWindow";
import DocumentsWindow from "@/components/windows/DocumentsWindow";
import DictationWindow from "@/components/windows/DictationWindow";
import FileViewerWindow from "@/components/windows/FileViewerWindow";
import MemoryWindow from "@/components/windows/MemoryWindow";
import ChartWindow from "@/components/windows/ChartWindow";
import GeoMapWindow from "@/components/windows/GeoMapWindow";
import AssistenzWindow from "@/components/windows/AssistenzWindow";
import FlightBoardWindow from "@/components/windows/FlightBoardWindow";
import EmailWindow from "@/components/windows/EmailWindow";
import CalendarWindow from "@/components/windows/CalendarWindow";
import StockCard from "@/components/chat/StockCard";
import StockHistoryCard from "@/components/chat/StockHistoryCard";
import ImageGalleryCard from "@/components/chat/ImageGalleryCard";
import TransportBoardCard from "@/components/chat/TransportBoardCard";
import ActionButtonsCard from "@/components/chat/ActionButtonsCard";
import { WINDOW_MODULES } from "@/lib/window-registry";
import MobilePinnedPanel from "@/components/mobile/MobilePinnedPanel";
import HomeWindow from "@/components/windows/HomeWindow";
import MobileWindowTray from "@/components/mobile/MobileWindowTray";
import MobileWindowPickerSheet from "@/components/mobile/MobileWindowPickerSheet";
import InvoiceModal from "@/components/chat/InvoiceModal";
import { TranslationProvider } from "@/lib/i18n";

const suggestions = ["Was kannst du?", "Erkläre mir etwas", "Öffne eine Webseite", "Aktuelle Nachrichten"];

// ── richCardMeta: artifact title für bekannte response types ─────────────────
function richCardTitle(responseType: string): string | null {
  switch (responseType) {
    case "stock_card":      return "📈 Aktienkurs";
    case "stock_history":   return "📊 Kursverlauf";
    case "image_gallery":   return "🖼 Bilder";
    case "transport_board": return "🚆 Abfahrten";
    default:                return null;
  }
}

function openWindowTitle(canvasType: string): string | null {
  const mod = WINDOW_MODULES.find((m) => m.canvasType === canvasType);
  return mod ? `${mod.icon} ${mod.label}` : null;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter();
  const [user] = useState<ReturnType<typeof getSession>>(() =>
    typeof window !== "undefined" ? getSession() : null
  );

  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showMemory, setShowMemory] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // Split-Panel Resize
  const [chatWidth, setChatWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 400;
    const stored = localStorage.getItem("baddi:chatWidth");
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 260), 800) : 400;
  });
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = chatWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [chatWidth]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isResizing.current) return;
      const delta = e.clientX - resizeStartX.current;
      const next = Math.min(Math.max(resizeStartWidth.current + delta, 260), 800);
      setChatWidth(next);
    }
    function onMouseUp() {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setChatWidth((w) => {
        localStorage.setItem("baddi:chatWidth", String(w));
        return w;
      });
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Viewport
  const [vw, setVw] = useState<number>(1280);
  const isMobile = vw < 768;

  // Mobile panel state
  const [activeMobileWindowId, setActiveMobileWindowId] = useState<string | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileHomeOpen, setMobileHomeOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showMobileWindowPicker, setShowMobileWindowPicker] = useState(false);

  useEffect(() => {
    setVw(window.innerWidth);
    function onResize() { setVw(window.innerWidth); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    function onVpResize() {
      setKeyboardVisible((window.visualViewport!.height) < window.innerHeight * 0.85);
    }
    window.visualViewport.addEventListener("resize", onVpResize);
    return () => window.visualViewport!.removeEventListener("resize", onVpResize);
  }, []);

  // ── Artifact state (einheitliche State-Quelle für User + KI) ────────────────
  const {
    artifacts, activeId: activeArtifactId,
    openArtifact, updateArtifact, closeArtifact, closeArtifactByType, focusArtifact,
  } = useArtifacts();
  const [refreshingArtifacts, setRefreshingArtifacts] = useState<Set<string>>(new Set());

  const handleFlightRefresh = useCallback(async (artifactId: string, data: FlightBoardData) => {
    if (!data.airport_iata && !data.query) return;
    setRefreshingArtifacts((prev) => new Set(prev).add(artifactId));
    try {
      const params = new URLSearchParams();
      if (data.airport_iata) {
        params.set("airport_iata", data.airport_iata);
        params.set("board_type", data.board_type ?? "departure");
        params.set("limit", "20");
        const res = await apiFetch(`${BACKEND_URL}/v1/flights/board?${params}`);
        if (res.ok) {
          const fresh = await res.json() as FlightBoardData;
          updateArtifact(artifactId, fresh as unknown as Record<string, unknown>);
        }
      } else if (data.query) {
        params.set("flight_iata", data.query);
        const res = await apiFetch(`${BACKEND_URL}/v1/flights/status?${params}`);
        if (res.ok) {
          const fresh = await res.json() as FlightBoardData;
          updateArtifact(artifactId, fresh as unknown as Record<string, unknown>);
        }
      }
    } finally {
      setRefreshingArtifacts((prev) => {
        const next = new Set(prev);
        next.delete(artifactId);
        return next;
      });
    }
  }, [updateArtifact]);

  // Mobile: Auto-open panel wenn neues Artifact gespawnt wird
  const prevArtifactCountRef = useRef(-1);
  useEffect(() => {
    if (!isMobile) return;
    if (prevArtifactCountRef.current === -1) {
      prevArtifactCountRef.current = artifacts.length;
      return;
    }
    if (artifacts.length > prevArtifactCountRef.current) {
      const last = artifacts[artifacts.length - 1];
      setActiveMobileWindowId(last.id);
      setMobilePanelOpen(true);
    }
    if (activeMobileWindowId && !artifacts.find((a) => a.id === activeMobileWindowId)) {
      const last = artifacts[artifacts.length - 1];
      setActiveMobileWindowId(last?.id ?? null);
      if (!last) setMobilePanelOpen(false);
    }
    prevArtifactCountRef.current = artifacts.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifacts, isMobile]);

  // ── Process refs ─────────────────────────────────────────────────────────
  const processedMsgs = useRef(new Set<string>());
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const whiteboardScreenshotRef = useRef<(() => Promise<string | null>) | null>(null);

  const { messages, setMessages, loading, historyLoaded, loadHistory, sendMessage } = useChatMessages();
  const { cameraOpen, videoRef, openCamera, closeCamera, capturePhoto } = useCamera();
  const { uiPrefs, setUiPrefs, loadPreferences, savePreferences } = useUiPrefs();
  const { speaking, setSpeaking, ttsEnabled, setTtsEnabled, audioRef, speak, stripMarkdown, unlockAudio } = useTTS(
    false,
    uiPrefs.ttsVoice ?? "female",
  );
  const ttsDefaultSynced = useRef(false);
  useEffect(() => {
    if (ttsDefaultSynced.current) return;
    if (uiPrefs.ttsDefault !== undefined) {
      setTtsEnabled(uiPrefs.ttsDefault);
      ttsDefaultSynced.current = true;
    }
  }, [uiPrefs.ttsDefault, setTtsEnabled]);
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

  // Auto-scroll — rAF stellt sicher dass DOM vollständig gerendert ist bevor
  // scrollHeight gemessen wird. Bei loading=true sofort scrollen (kein smooth),
  // damit der "Baddi denkt"-Indikator immer sichtbar ist.
  useEffect(() => {
    if (userScrolledUp.current) return;
    const el = chatScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: loading ? "instant" : "smooth" });
    });
  }, [messages, loading]);

  // ResizeObserver — nur auf signifikante Grössenänderungen reagieren (Fenster-/Panel-Resize),
  // NICHT auf kleine Schwankungen durch Textarea-Reflow beim Tippen (Threshold: 4px)
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    let lastH = el.clientHeight;
    const observer = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (Math.abs(h - lastH) > 4) {
        lastH = h;
        if (!userScrolledUp.current) el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Textarea auto-resize: wächst mit dem Inhalt bis max-h-40 (160px)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // ── Spawn artifacts für rich responses ──────────────────────────────────
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.structuredData) return;
    if (last.responseType === "text" || !last.responseType) return;
    if (processedMsgs.current.has(last.id)) return;
    processedMsgs.current.add(last.id);

    // Flugplan-Fenster automatisch öffnen
    if (last.responseType === "flight_board") {
      const d = last.structuredData as FlightBoardData;
      const title = d.airport_name
        ? `✈ ${d.airport_name} — ${d.board_type === "arrival" ? "Ankünfte" : "Abflüge"}`
        : `✈ Flug ${d.query ?? ""}`;
      openArtifact("flight_board", title, d as unknown as Record<string, unknown>);
      return;
    }

    // Fenster öffnen via [FENSTER:]-Marker
    if (last.responseType === "open_window") {
      const d = last.structuredData as OpenWindowData;
      const title = openWindowTitle(d.canvasType) ?? `🪟 ${d.canvasType}`;
      const data: Record<string, unknown> = {};
      if (d.symbols) data.symbols = d.symbols;
      if (d.symbol)  data.symbol  = d.symbol;
      if (d.east)    { data.east = d.east; data.north = d.north; data.zoom = d.zoom; data.bgLayer = d.bgLayer; }
      if (d.url)     { data.url = d.url; data.goal = d.goal; }
      openArtifact(d.canvasType, title, data);
      return;
    }

    // Dokument öffnen
    if (last.responseType === "open_document") {
      const d = last.structuredData as OpenDocumentData;
      apiFetch(`${BACKEND_URL}/v1/documents/mine`).then(async (res) => {
        if (!res.ok) return;
        const docs = await res.json();
        const doc = docs.find((x: { original_filename: string }) =>
          x.original_filename.toLowerCase().includes((d.filename ?? "").toLowerCase())
        );
        if (!doc) return;
        const contentRes = await apiFetch(`${BACKEND_URL}/v1/documents/mine/${doc.id}/content`);
        if (!contentRes.ok) return;
        const blob = await contentRes.blob();
        const url = URL.createObjectURL(blob);
        openArtifact("file_viewer", `📄 ${doc.original_filename}`, {
          url, filename: doc.original_filename, fileType: doc.file_type, mimeType: doc.mime_type,
        });
      });
      return;
    }

    // URL in neuem Tab
    if (last.responseType === "open_url") {
      const d = last.structuredData as OpenUrlData;
      if (d?.url) window.open(d.url, "_blank", "noopener,noreferrer");
      return;
    }

    // Netzwerk-Aktion: openArtifact merged Daten in bestehende Instanz (Singleton-Logik)
    if (last.responseType === "netzwerk_aktion") {
      const d = last.structuredData as NetzwerkAktionData;
      const existing = artifacts.find((a) => a.type === "netzwerk");
      openArtifact("netzwerk", "🕸 Namensnetz", {
        boardId: d?.board_id ?? "",
        reloadKey: ((existing?.data?.reloadKey ?? 0) as number) + 1,
      });
      return;
    }

    // Fenster schliessen
    if (last.responseType === "close_window") {
      const d = last.structuredData as CloseWindowData;
      closeArtifactByType(d.canvasType);
      return;
    }

    // Standard rich cards (stock, transport, images)
    const title = richCardTitle(last.responseType ?? "");
    if (!title) return;
    openArtifact(
      last.responseType ?? "text",
      title,
      last.structuredData as unknown as Record<string, unknown>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // ── Artifact öffnen (User-Klick auf + Schaltfläche) ──────────────────────
  // Derselbe openArtifact-Aufruf wie bei KI-Responses — eine einzige State-Quelle.
  const handleAddCard = useCallback((canvasType: string) => {
    const mod = WINDOW_MODULES.find((m) => m.canvasType === canvasType);
    if (mod) {
      openArtifact(mod.canvasType, `${mod.icon} ${mod.label}`);
      if (canvasType === "memory") loadMemories();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openArtifact]);

  const handleOpenFile = useCallback(({ url, filename, fileType }: { url: string; filename: string; fileType: string }) => {
    const isImage = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes((fileType ?? "").toLowerCase());
    if (isImage) {
      openArtifact("image_gallery", `🖼 ${filename}`, { images: [{ image_url: url, filename }] });
    } else {
      openArtifact("file_viewer", `📄 ${filename}`, { url, filename, fileType });
    }
  }, [openArtifact]);

  const handleRemoveGeneratedImage = useCallback((msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, generatedImages: undefined } : m));
    // Auch das zugehörige Artifact-Fenster schliessen
    closeArtifactByType("image_gallery");
    closeArtifactByType("image_viewer");
  }, [setMessages, closeArtifactByType]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function loadMemories() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/memories`);
      if (res.ok) setMemories(await res.json());
    } catch { /* ignore */ }
  }

  async function deleteMemory(id: string) {
    try {
      await apiFetch(`${BACKEND_URL}/v1/chat/memories/${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch { /* ignore */ }
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    for (const f of Array.from(e.target.files)) {
      if (f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|mpeg|mpga)$/i.test(f.name)) {
        await transcribeAudio(f);
      } else {
        setAttachedFiles((prev) => [...prev, { file: f, id: `f-${Date.now()}-${Math.random()}` }]);
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
      if (data.text) setInput((prev) => prev ? `${prev} ${data.text}` : data.text);
    } catch {
      setInput((prev) => `${prev}[Audio konnte nicht transkribiert werden]`);
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
        setAttachedFiles((prev) => [...prev, { file: f, id: `drop-${Date.now()}` }]);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  async function handleSend() {
    userScrolledUp.current = false;
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });

    // Screenshot vom aktiven Whiteboard einholen (Vision-Input)
    let screenshotB64: string | undefined;
    const activeArt = artifacts.find(a => a.id === activeArtifactId);
    if (activeArt?.type === "whiteboard" && whiteboardScreenshotRef.current) {
      screenshotB64 = (await whiteboardScreenshotRef.current()) ?? undefined;
    }

    const provider = await sendMessage({
      input, attachedFiles,
      canvasContext: artifacts,
      activeArtifactId,
      screenshotB64,
      onUiUpdate: async (update) => {
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
            update = { ...update, backgroundImage: dataUrl };
            apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
              method: "POST",
              body: JSON.stringify({ backgroundImage: dataUrl }),
            }).catch(() => {});
          } catch { /* URL direkt verwenden */ }
        } else if ("backgroundImage" in update) {
          // Explizite Entfernung (leerer String) auch persistieren
          apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
            method: "POST",
            body: JSON.stringify({ backgroundImage: "" }),
          }).catch(() => {});
        }
        setUiPrefs((p) => ({ ...p, ...update }));
      },
      speak, stripMarkdown,
      onAfterSend: () => setInput(""),
      onFilesChange: setAttachedFiles,
      onFileUploaded: ({ filename, blobUrl, fileType }: UploadedFileInfo) => {
        openArtifact("file_viewer", `📄 ${filename}`, { url: blobUrl, filename, fileType });
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
    setInput((prev) => prev ? `${prev} ${text}` : text);
  }, []);

  // ── Render artifact content ───────────────────────────────────────────────
  function renderWindowContent(artifact: ArtifactEntry): React.ReactNode {
    const d = artifact.data;
    switch (artifact.type) {
      case "whiteboard": return (
        <WhiteboardWindow
          boardId={d?.boardId as string | undefined}
          onBoardId={(id) => updateArtifact(artifact.id, { boardId: id })}
          screenshotRef={whiteboardScreenshotRef}
        />
      );
      case "image_viewer": return (
        <ImageViewerWindow
          initialUrl={(d?.url as string | undefined) ?? ""}
          onNaturalSize={() => { /* Shell ist immer full-size */ }}
        />
      );
      case "netzwerk": return (
        <NetzwerkWindow
          boardId={d?.boardId as string | undefined}
          reloadKey={d?.reloadKey as number | undefined}
          onBoardId={(id) => updateArtifact(artifact.id, { boardId: id })}
        />
      );
      case "memory": return (
        <MemoryWindow
          buddyName={uiPrefs.buddyName ?? "Baddi"}
          memories={memories}
          onDelete={deleteMemory}
          onRefresh={loadMemories}
        />
      );
      case "chart": return (
        <ChartWindow
          initialSymbol={d?.symbol as string | undefined}
          initialSymbols={d?.symbols as string[] | undefined}
          onStateChange={(s) => updateArtifact(artifact.id, s)}
        />
      );
      case "geo_map": return (
        <GeoMapWindow
          east={d?.east as number | undefined}
          north={d?.north as number | undefined}
          zoom={d?.zoom as number | undefined}
          bgLayer={d?.bgLayer as string | undefined}
          onStateChange={(s) => updateArtifact(artifact.id, s)}
        />
      );
      case "assistenz": return (
        <AssistenzWindow
          initialUrl={d?.url as string | undefined}
          initialGoal={d?.goal as string | undefined}
        />
      );
      case "documents": return (
        <DocumentsWindow onOpenFile={handleOpenFile} />
      );
      case "diktieren": return (
        <DictationWindow language={uiPrefs.language} />
      );
      case "file_viewer": return (
        <FileViewerWindow
          url={(d?.url as string | undefined) ?? ""}
          filename={(d?.filename as string | undefined) ?? "Datei"}
          fileType={d?.fileType as string | undefined}
          mimeType={d?.mimeType as string | undefined}
        />
      );
      case "stock_card": return (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <div className="h-full overflow-auto p-4"><StockCard data={d as any} /></div>
      );
      case "stock_history": return (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <div className="h-full overflow-auto p-4"><StockHistoryCard data={d as any} /></div>
      );
      case "image_gallery": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imgData = d as any as ImageGalleryData;
        // Einzelbild (DALL-E) → voller Viewer ohne Beschneidung
        if (imgData?.images?.length === 1) {
          return <ImageViewerWindow initialUrl={imgData.images[0].image_url} onNaturalSize={() => {}} />;
        }
        return <div className="h-full overflow-auto p-4"><ImageGalleryCard data={imgData} /></div>;
      }
      case "transport_board": return (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <div className="h-full overflow-auto p-4"><TransportBoardCard data={d as any} /></div>
      );
      case "flight_board": return (
        <FlightBoardWindow
          data={d as unknown as FlightBoardData}
          onRefresh={() => handleFlightRefresh(artifact.id, d as unknown as FlightBoardData)}
          isRefreshing={refreshingArtifacts.has(artifact.id)}
        />
      );
      case "action_buttons": return (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <div className="h-full overflow-auto p-4"><ActionButtonsCard data={d as any} /></div>
      );
      case "email": return <EmailWindow />;
      case "calendar": return <CalendarWindow />;
      default: return (
        <div className="p-4 text-sm text-gray-400 font-mono whitespace-pre-wrap">
          {JSON.stringify(d, null, 2)}
        </div>
      );
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const bgColor = BG_COLORS[uiPrefs.background] ?? "#030712";

  useLayoutEffect(() => {
    const val = WINDOW_BG_COLORS[uiPrefs.windowBg ?? "glass"] ?? "rgba(8, 12, 22, 0.92)";
    document.documentElement.style.setProperty("--window-bg", val);
  }, [uiPrefs.windowBg]);

  const bgStyle = uiPrefs.backgroundImage
    ? { backgroundImage: `url(${uiPrefs.backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: bgColor };

  // ── Chat column content (shared Desktop + Mobile) ─────────────────────────
  const chatColumnContent = (
    <>
      {!historyLoaded && (
        <p className="text-center text-gray-600 text-sm pt-8">Lade Verlauf…</p>
      )}
      {historyLoaded && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[60%] gap-4 text-center py-8">
          <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-900/40 ${speaking ? "shadow-[0_0_0_10px_rgba(99,102,241,0.2)] scale-105" : ""} transition-all`}>
            <span className="text-white font-bold text-xl">{buddyInitial}</span>
          </div>
          <div>
            <h2 className="font-semibold text-white">Hallo{firstName ? `, ${firstName}` : ""}!</h2>
            <p className="text-gray-400 text-sm mt-1">Wie kann ich dir helfen?</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 max-w-xs">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="px-3 py-1.5 rounded-full text-xs text-gray-300 bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/15 transition-all"
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
          hideRichContent
          onRemoveGeneratedImage={handleRemoveGeneratedImage}
        />
      ))}
      {loading && (
        <div className="flex gap-3 items-center">
          <AvatarCircle speaking={true} initial={buddyInitial} />
          <div className="flex items-center gap-1.5 py-3">
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}
    </>
  );

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    const activeArtifact = activeMobileWindowId
      ? artifacts.find((a) => a.id === activeMobileWindowId)
      : null;
    const showChat = !mobilePanelOpen && !mobileHomeOpen;

    return (
      <TranslationProvider lang={uiPrefs.language}>
      <div className="flex flex-col h-[100dvh] overflow-hidden" style={bgStyle}>
        <TopBar
          buddyName={uiPrefs.buddyName ?? "Baddi"}
          buddyInitial={buddyInitial}
          speaking={speaking}
          lastProvider={lastProvider}
          isAdmin={user?.role === "admin"}
          avatar={uiPrefs.avatarType ?? "robot"}
          emotion={emotion}
          onSettings={() => setSetupOpen(true)}
          onAdminBack={() => router.push("/admin")}
        />

        <div
          ref={chatScrollRef}
          className={`overflow-y-auto px-3 py-3 space-y-3 min-h-0 ${showChat ? "flex-1" : "hidden"}`}
          onScroll={() => {
            const el = chatScrollRef.current;
            if (!el) return;
            userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
          }}
        >
          {chatColumnContent}
        </div>

        {mobileHomeOpen && (
          <MobilePinnedPanel
            card={{ id: "__home__", title: firstName || "Home", type: "home" }}
            onCollapse={() => setMobileHomeOpen(false)}
          >
            <HomeWindow
              artifacts={artifacts}
              bgStyle={bgStyle}
              uiPrefs={uiPrefs}
              onPrefsChange={(patch) => setUiPrefs((p) => ({ ...p, ...patch }))}
              onOpen={(type) => { handleAddCard(type); setMobileHomeOpen(false); setMobilePanelOpen(true); }}
            />
          </MobilePinnedPanel>
        )}

        {mobilePanelOpen && activeArtifact && !mobileHomeOpen && (
          <MobilePinnedPanel
            card={activeArtifact}
            onCollapse={() => setMobilePanelOpen(false)}
            onCloseArtifact={() => {
              closeArtifact(activeArtifact.id);
              setMobilePanelOpen(false);
            }}
          >
            {renderWindowContent(activeArtifact)}
          </MobilePinnedPanel>
        )}

        <MobileWindowTray
          cards={artifacts}
          activeWindowId={activeMobileWindowId}
          panelOpen={mobilePanelOpen}
          homeOpen={mobileHomeOpen}
          userName={firstName}
          onActivate={(id) => { setMobileHomeOpen(false); setActiveMobileWindowId(id); setMobilePanelOpen(true); }}
          onClose={(id) => {
            closeArtifact(id);
            if (id === activeMobileWindowId) setMobilePanelOpen(false);
          }}
          onAdd={() => setShowMobileWindowPicker(true)}
          onShowChat={() => { setMobilePanelOpen(false); setMobileHomeOpen(false); }}
          onShowHome={() => { setMobilePanelOpen(false); setMobileHomeOpen(true); }}
        />

        <ChatInput
          input={input} onChange={setInput} onSend={handleSend} onKeyDown={handleKeyDown}
          loading={loading} attachedFiles={attachedFiles} onFilesChange={setAttachedFiles}
          onAttachClick={() => fileInputRef.current?.click()} onCameraClick={openCamera}
          onVoiceResult={handleVoiceResult} buddyName={uiPrefs.buddyName}
          fontSize={uiPrefs.fontSize} voiceLang={voiceLang} language={uiPrefs.language}
          textareaRef={textareaRef} compact
          ttsEnabled={ttsEnabled}
          onTtsToggle={() => {
            if (ttsEnabled && audioRef.current) audioRef.current.pause();
            else unlockAudio();
            setTtsEnabled((v) => !v);
          }}
        />

        <input ref={fileInputRef} type="file" multiple className="hidden"
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm"
          onChange={handleFileInputChange}
        />

        <MobileWindowPickerSheet
          open={showMobileWindowPicker}
          onClose={() => setShowMobileWindowPicker(false)}
          onSelect={(type) => { handleAddCard(type); setShowMobileWindowPicker(false); }}
        />

        {showMemory && (
          <MemoryPanel memories={memories} buddyName={uiPrefs.buddyName} onDelete={deleteMemory} onClose={() => setShowMemory(false)} />
        )}
        {setupOpen && (
          <SetupModal onClose={() => setSetupOpen(false)} onNavigate={(href) => { setSetupOpen(false); router.push(href); }} onLogout={() => { clearSession(); router.push("/"); }} />
        )}
        {cameraOpen && (
          <CameraModal videoRef={videoRef} onClose={closeCamera} onCapture={() => capturePhoto((file) => { setAttachedFiles((prev) => [...prev, { file, id: `cam-${Date.now()}` }]); })} />
        )}
        {invoiceOpen && <InvoiceModal onClose={() => setInvoiceOpen(false)} />}
      </div>
      </TranslationProvider>
    );
  }

  // ── DESKTOP SPLIT-VIEW ────────────────────────────────────────────────────
  return (
    <TranslationProvider lang={uiPrefs.language}>
    <div className="flex h-[100dvh] overflow-hidden" style={bgStyle}>

      {/* ── Chat-Spalte (inkl. TopBar) ── */}
      <div
        className="flex flex-col shrink-0 min-h-0"
        style={{ width: chatWidth }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <TopBar
          buddyName={uiPrefs.buddyName ?? "Baddi"}
          buddyInitial={buddyInitial}
          speaking={speaking}
          lastProvider={lastProvider}
          isAdmin={user?.role === "admin"}
          avatar={uiPrefs.avatarType ?? "robot"}
          emotion={emotion}
          onSettings={() => setSetupOpen(true)}
          onAdminBack={() => router.push("/admin")}
        />
          {isDragOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-950/80 border-2 border-dashed border-indigo-400 pointer-events-none">
              <div className="text-center">
                <p className="text-4xl mb-3">📎</p>
                <p className="text-indigo-200 font-semibold text-lg">Datei hier ablegen</p>
                <p className="text-indigo-400 text-sm mt-1">Bilder, Videos, PDFs, Dokumente…</p>
              </div>
            </div>
          )}

          {/* Messages */}
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
            onScroll={() => {
              const el = chatScrollRef.current;
              if (!el) return;
              userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
            }}
          >
            {chatColumnContent}
          </div>

          {/* Input */}
          <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/5">
            {user?.role === "admin" && (
              <div className="mb-1.5 flex items-center gap-2">
                <button
                  onClick={() => setInvoiceOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 transition-colors"
                >
                  <span>🧾</span>
                  <span>Rechnung buchen</span>
                </button>
              </div>
            )}
            {artifacts.find(a => a.id === activeArtifactId)?.type === "whiteboard" && (
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-indigo-400/80">
                <span>🎨</span>
                <span>Whiteboard-Screenshot wird beim Senden mitgeschickt</span>
              </div>
            )}
            <ChatInput
              input={input} onChange={setInput} onSend={handleSend} onKeyDown={handleKeyDown}
              loading={loading} attachedFiles={attachedFiles} onFilesChange={setAttachedFiles}
              onAttachClick={() => fileInputRef.current?.click()} onCameraClick={openCamera}
              onVoiceResult={handleVoiceResult} buddyName={uiPrefs.buddyName}
              fontSize={uiPrefs.fontSize} voiceLang={voiceLang} language={uiPrefs.language}
              textareaRef={textareaRef}
              ttsEnabled={ttsEnabled}
              onTtsToggle={() => {
                if (ttsEnabled && audioRef.current) audioRef.current.pause();
                else unlockAudio();
                setTtsEnabled((v) => !v);
              }}
            />
          </div>
        </div>

        {/* ── Resize Handle ── */}
        <div
          className="group relative flex items-center justify-center shrink-0 w-[5px] cursor-col-resize hover:bg-indigo-500/20 active:bg-indigo-500/30 transition-colors border-x border-white/5"
          onMouseDown={onResizeMouseDown}
        >
          <div className="w-[3px] h-8 rounded-full bg-white/10 group-hover:bg-indigo-400/60 transition-colors" />
        </div>

        {/* ── Artifact-Shell ── */}
        <ArtifactShell
          artifacts={artifacts}
          activeId={activeArtifactId}
          onSetActive={focusArtifact}
          onClose={closeArtifact}
          renderContent={renderWindowContent}
          onAddArtifact={handleAddCard}
          bgStyle={bgStyle}
          userName={firstName}
          uiPrefs={uiPrefs}
          onPrefsChange={(patch) => setUiPrefs((p) => ({ ...p, ...patch }))}
        />

      {/* ── Hidden file input ── */}
      <input ref={fileInputRef} type="file" multiple className="hidden"
        accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm"
        onChange={handleFileInputChange}
      />

      {/* ── Overlays ── */}
      {showMemory && (
        <MemoryPanel memories={memories} buddyName={uiPrefs.buddyName} onDelete={deleteMemory} onClose={() => setShowMemory(false)} />
      )}
      {setupOpen && (
        <SetupModal onClose={() => setSetupOpen(false)}
          onNavigate={(href) => { setSetupOpen(false); router.push(href); }}
          onLogout={() => { clearSession(); router.push("/"); }} />
      )}
      {cameraOpen && (
        <CameraModal videoRef={videoRef} onClose={closeCamera}
          onCapture={() => capturePhoto((file) => {
            setAttachedFiles((prev) => [...prev, { file, id: `cam-${Date.now()}` }]);
          })} />
      )}
      {invoiceOpen && <InvoiceModal onClose={() => setInvoiceOpen(false)} />}
    </div>
    </TranslationProvider>
  );
}
