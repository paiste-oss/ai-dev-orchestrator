"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiFetch, clearSession, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import FileDropZone, { AttachedFile } from "@/components/FileDropZone";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

const VoiceButton = dynamic(() => import("@/components/VoiceButton"), { ssr: false });

interface StockData {
  symbol: string;
  name?: string;
  price?: number;
  currency?: string;
  change?: number;
  change_pct?: number;
  market_cap?: number;
  volume?: number;
  exchange?: string;
}

interface StockHistoryData {
  symbol: string;
  period: string;
  currency: string;
  total_change_pct: number;
  start_price: number;
  end_price: number;
  data_points: { date: string; close: number; change_pct: number | null }[];
}

interface ImageGalleryData {
  images: { image_url: string; description: string; photographer: string; source: string }[];
}

interface TransportDeparture {
  line: string;
  destination: string;
  departure: string;
  track?: string;
  delay?: number;
  category?: string;
}

interface TransportBoardData {
  station?: string;
  departures: TransportDeparture[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];       // object URLs for display (user uploads)
  generatedImages?: string[]; // URLs from DALL-E
  responseType?: string;
  structuredData?: StockData | StockHistoryData | ImageGalleryData | TransportBoardData;
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

// ── Structured Card Components ────────────────────────────────────────────

function StockCard({ data }: { data: StockData }) {
  const isPositive = (data.change_pct ?? 0) >= 0;
  const changeColor = isPositive ? "text-emerald-400" : "text-red-400";
  const changeBg = isPositive ? "bg-emerald-500/10" : "bg-red-500/10";
  const arrow = isPositive ? "▲" : "▼";

  function formatMarketCap(mc: number) {
    if (mc >= 1e12) return `${(mc / 1e12).toFixed(2)}T`;
    if (mc >= 1e9) return `${(mc / 1e9).toFixed(2)}B`;
    if (mc >= 1e6) return `${(mc / 1e6).toFixed(2)}M`;
    return mc.toLocaleString();
  }

  return (
    <div className="mt-3 rounded-2xl bg-gray-900 border border-gray-700 p-4 min-w-[240px] max-w-[340px] shadow-lg">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">{data.symbol}</p>
          {data.name && <p className="text-sm text-gray-300 font-medium leading-tight">{data.name}</p>}
        </div>
        {data.exchange && (
          <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">{data.exchange}</span>
        )}
      </div>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold text-white tabular-nums">
          {data.price?.toFixed(2) ?? "–"}
        </span>
        <span className="text-sm text-gray-500 mb-0.5">{data.currency}</span>
      </div>
      {data.change_pct !== null && data.change_pct !== undefined && (
        <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-sm font-medium ${changeBg} ${changeColor}`}>
          <span>{arrow}</span>
          <span>{Math.abs(data.change ?? 0).toFixed(2)} ({Math.abs(data.change_pct).toFixed(2)}%)</span>
        </div>
      )}
      {(data.market_cap || data.volume) && (
        <div className="flex gap-4 mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
          {data.market_cap && (
            <div>
              <p className="text-gray-600 mb-0.5">Market Cap</p>
              <p className="text-gray-400">{formatMarketCap(data.market_cap)}</p>
            </div>
          )}
          {data.volume && (
            <div>
              <p className="text-gray-600 mb-0.5">Volumen</p>
              <p className="text-gray-400">{data.volume.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StockHistoryCard({ data }: { data: StockHistoryData }) {
  const isPositive = data.total_change_pct >= 0;
  const changeColor = isPositive ? "text-emerald-400" : "text-red-400";
  const lineColor = isPositive ? "#34d399" : "#f87171";
  const arrow = isPositive ? "▲" : "▼";
  const [showTable, setShowTable] = useState(false);

  const chartData = data.data_points.map(row => ({
    date: row.date.substring(0, 7),
    close: row.close,
    change_pct: row.change_pct,
  }));

  const minVal = Math.min(...chartData.map(d => d.close));
  const maxVal = Math.max(...chartData.map(d => d.close));
  const padding = (maxVal - minVal) * 0.08 || 1;

  return (
    <div className="mt-3 rounded-2xl bg-gray-900 border border-gray-700 p-4 w-full max-w-[460px] shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">{data.symbol}</p>
          <p className="text-sm text-gray-400">Kursverlauf · {data.period}</p>
        </div>
        <div className={`text-right ${changeColor}`}>
          <p className="text-lg font-bold">{arrow} {Math.abs(data.total_change_pct).toFixed(2)}%</p>
          <p className="text-xs text-gray-500 tabular-nums">{data.start_price} → {data.end_price} {data.currency}</p>
        </div>
      </div>

      {/* Line Chart */}
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              interval={Math.floor(chartData.length / 5)}
            />
            <YAxis
              domain={[minVal - padding, maxVal + padding]}
              tick={{ fontSize: 10, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#9ca3af" }}
              formatter={(value) => [`${(value as number).toFixed(2)} ${data.currency}`, "Kurs"]}
            />
            <ReferenceLine y={data.start_price} stroke="#4b5563" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="close"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Toggle table */}
      <button
        onClick={() => setShowTable(v => !v)}
        className="mt-3 text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        {showTable ? "▲ Tabelle ausblenden" : "▼ Tabelle anzeigen"}
      </button>

      {showTable && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-600">
                <th className="text-left py-1 px-1">Datum</th>
                <th className="text-right py-1 px-1">Kurs</th>
                <th className="text-right py-1 px-1">Änderung</th>
              </tr>
            </thead>
            <tbody>
              {data.data_points.map((row, i) => (
                <tr key={i} className="border-t border-gray-800/60">
                  <td className="py-1 px-1 text-gray-500 font-mono">{row.date.substring(0, 7)}</td>
                  <td className="py-1 px-1 text-right text-gray-300 tabular-nums">{row.close.toFixed(2)}</td>
                  <td className={`py-1 px-1 text-right tabular-nums ${
                    row.change_pct === null ? "text-gray-600"
                    : row.change_pct >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {row.change_pct !== null ? `${row.change_pct >= 0 ? "+" : ""}${row.change_pct.toFixed(2)}%` : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ImageGalleryCard({ data }: { data: ImageGalleryData }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {data.images.map((img, i) => (
        <div key={i} className="rounded-2xl overflow-hidden shadow-lg max-w-[300px]">
          <a href={img.image_url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.image_url}
              alt={img.description}
              className="w-full max-h-[220px] object-cover hover:scale-105 transition-transform cursor-pointer"
            />
          </a>
          <div className="bg-gray-900 px-3 py-1.5">
            <p className="text-xs text-gray-500">
              Foto: <span className="text-gray-400">{img.photographer}</span>
              <span className="ml-1 text-gray-600">· {img.source}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TransportBoardCard({ data }: { data: TransportBoardData }) {
  return (
    <div className="mt-3 rounded-2xl bg-gray-900 border border-gray-700 overflow-hidden shadow-lg max-w-[460px]">
      <div className="bg-gray-800 px-4 py-2.5 flex items-center gap-2">
        <span className="text-lg">🚆</span>
        <span className="text-sm font-semibold text-white">{data.station ?? "Abfahrten"}</span>
      </div>
      <div className="divide-y divide-gray-800">
        {data.departures.slice(0, 8).map((dep, i) => {
          const isDelayed = dep.delay && dep.delay > 0;
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xs font-bold bg-indigo-600 text-white px-2 py-0.5 rounded min-w-[40px] text-center">
                {dep.line}
              </span>
              <span className="flex-1 text-sm text-gray-300 truncate">{dep.destination}</span>
              <div className="text-right shrink-0">
                <span className={`text-sm font-mono font-medium ${isDelayed ? "text-red-400" : "text-white"}`}>
                  {dep.departure}
                </span>
                {isDelayed && (
                  <span className="block text-xs text-red-500">+{dep.delay} min</span>
                )}
              </div>
              {dep.track && (
                <span className="text-xs text-gray-600 min-w-[30px] text-right">Gl. {dep.track}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data:...;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  // ── TTS (ElevenLabs) ──────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function stripMarkdown(text: string): string {
    return text
      // Tabellen-Zeilen entfernen (| ... | ... |)
      .replace(/^\|.*\|$/gm, "")
      // Tabellen-Trennzeilen (|---|---|)
      .replace(/^\|[-| :]+\|$/gm, "")
      // Bold/Italic (**text** / *text* / __text__ / _text_)
      .replace(/(\*{1,2}|_{1,2})(.+?)\1/g, "$2")
      // Emojis entfernen
      .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/gu, "")
      // Markdown-Links [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Inline-Code `code`
      .replace(/`([^`]+)`/g, "$1")
      // Überschriften # ## ###
      .replace(/^#{1,6}\s+/gm, "")
      // Mehrere Leerzeilen → eine
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async function speak(text: string) {
    if (!ttsEnabled) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/tts`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch { /* TTS Fehler still */ }
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCameraOpen(true);
      // attach stream after modal renders
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 120);
    } catch {
      alert("Kamera nicht verfügbar oder Zugriff verweigert.");
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function capturePhoto() {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
      setAttachedFiles(prev => [...prev, { file, id: `cam-${Date.now()}` }]);
      closeCamera();
    }, "image/jpeg", 0.9);
  }

  // ── Video frame extraction ────────────────────────────────────────────────
  function extractVideoFrames(file: File, count = 4): Promise<string[]> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      video.src = url;
      video.muted = true;
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        const duration = video.duration;
        const frames: string[] = [];
        const timestamps = Array.from({ length: count }, (_, i) =>
          (duration / (count + 1)) * (i + 1)
        );
        let idx = 0;

        function captureNext() {
          if (idx >= timestamps.length) {
            URL.revokeObjectURL(url);
            resolve(frames);
            return;
          }
          video.currentTime = timestamps[idx];
        }

        video.onseeked = () => {
          const canvas = document.createElement("canvas");
          canvas.width = Math.min(video.videoWidth, 640);
          canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
          canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
          idx++;
          captureNext();
        };

        captureNext();
      };

      video.onerror = () => { URL.revokeObjectURL(url); resolve([]); };
    });
  }

  // ── File input handler (attach button) ───────────────────────────────────
  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);

    for (const f of files) {
      if (f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|mpeg|mpga)$/i.test(f.name)) {
        // Audio → Whisper transkribieren
        await transcribeAudio(f);
      } else {
        setAttachedFiles(prev => [...prev, { file: f, id: `f-${Date.now()}-${Math.random()}` }]);
      }
    }
    e.target.value = "";
  }

  async function transcribeAudio(file: File) {
    setLoading(true);
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
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  // ── Drag & Drop (gesamter Chat-Bereich) ──────────────────────────────────
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    // nur auslösen wenn das Element wirklich verlassen wird (nicht bei Child-Wechsel)
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

  // ── Send ──────────────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || loading) return;

    const imageFiles = attachedFiles.filter(f => f.file.type.startsWith("image/"));
    const videoFiles = attachedFiles.filter(f => f.file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(f.file.name));
    const docFiles   = attachedFiles.filter(f =>
      !f.file.type.startsWith("image/") &&
      !f.file.type.startsWith("video/") &&
      !/\.(mp4|mov|webm)$/i.test(f.file.name)
    );

    // Build optimistic display
    const displayText = [
      text,
      videoFiles.map(f => `📹 ${f.file.name}`).join("\n"),
      docFiles.map(f => `📎 ${f.file.name}`).join("\n"),
    ].filter(Boolean).join("\n");

    const imageUrls = imageFiles.map(f => URL.createObjectURL(f.file));

    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: displayText,
      images: imageUrls.length > 0 ? imageUrls : undefined,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setInput("");
    setAttachedFiles([]);
    setLoading(true);
    setSpeaking(true);

    try {
      // Convert images to base64
      const imagesPayload = await Promise.all(
        imageFiles.map(async af => ({
          data: await fileToBase64(af.file),
          media_type: af.file.type,
        }))
      );

      // Extract video frames
      for (const vf of videoFiles) {
        const frames = await extractVideoFrames(vf.file, 4);
        for (const frame of frames) {
          imagesPayload.push({ data: frame, media_type: "image/jpeg" });
        }
      }

      // Append doc/video names to message text if present
      const fullMessage = [
        text,
        videoFiles.length > 0
          ? `[Video analysieren: ${videoFiles.map(f => f.file.name).join(", ")} — ${videoFiles.length * 4} Frames extrahiert]`
          : "",
        docFiles.length > 0
          ? `[Angehängte Dateien: ${docFiles.map(f => f.file.name).join(", ")}]`
          : "",
      ].filter(Boolean).join("\n");

      const body: Record<string, unknown> = { message: fullMessage };
      if (imagesPayload.length > 0) body.images = imagesPayload;

      const res = await apiFetch(`${BACKEND_URL}/v1/chat/message`, {
        method: "POST",
        body: JSON.stringify(body),
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
        generatedImages: data.image_urls ?? undefined,
        responseType: data.response_type ?? "text",
        structuredData: data.structured_data ?? undefined,
        provider: data.provider,
        model: data.model,
        created_at: new Date().toISOString(),
      };
      setLastProvider(data.provider);
      setMessages(prev => [...prev, assistantMsg]);
      speak(stripMarkdown(data.response));
      setTimeout(loadMemories, 4000);
    } catch (err: unknown) {
      setMessages(prev => [
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
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch { /* ignore */ }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Voice input appends to textarea
  const handleVoiceResult = useCallback((text: string) => {
    setInput(prev => prev ? `${prev} ${text}` : text);
  }, []);

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
          {/* TTS Toggle */}
          <button
            onClick={() => {
              if (ttsEnabled) {
                if (audioRef.current) audioRef.current.pause();
              } else {
                // Autoplay-Sperre des Browsers aufheben durch sofortigen Play-Aufruf im Click-Handler
                const unlock = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
                unlock.play().catch(() => {});
              }
              setTtsEnabled(v => !v);
            }}
            title={ttsEnabled ? "Baddi-Stimme aus" : "Baddi-Stimme ein"}
            className={`p-1.5 rounded-lg transition-colors text-base ${
              ttsEnabled
                ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                : "text-gray-500 hover:text-white hover:bg-gray-800"
            }`}
          >
            {ttsEnabled ? "🔊" : "🔇"}
          </button>
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

      {/* Camera Modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-[4/3] object-cover bg-black"
            />
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-t border-white/10">
              <button
                onClick={closeCamera}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={capturePhoto}
                className="w-14 h-14 rounded-full bg-white border-4 border-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center"
                title="Foto aufnehmen"
              >
                <span className="w-10 h-10 rounded-full bg-white border-2 border-gray-400 block" />
              </button>
              <div className="w-16" />
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
        <div
          className="flex-1 flex flex-col overflow-hidden relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag-Overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-indigo-950/70 border-2 border-dashed border-indigo-400 rounded-none pointer-events-none">
              <div className="text-center">
                <p className="text-4xl mb-2">📎</p>
                <p className="text-indigo-200 font-semibold text-lg">Datei hier ablegen</p>
                <p className="text-indigo-400 text-sm mt-1">Bilder, Videos, PDFs, Dokumente…</p>
              </div>
            </div>
          )}

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
                  {/* User image attachments */}
                  {msg.images && msg.images.length > 0 && (
                    <div className={`flex flex-wrap gap-2 ${msg.content ? "mb-2" : ""}`}>
                      {msg.images.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={src} alt="Anhang" className="rounded-xl max-w-[200px] max-h-[200px] object-cover" />
                      ))}
                    </div>
                  )}
                  {msg.content}
                  {/* DALL-E generated images */}
                  {msg.generatedImages && msg.generatedImages.length > 0 && !msg.structuredData && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {msg.generatedImages.map((src, i) => (
                        <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt="Generiertes Bild"
                            className="rounded-2xl max-w-[280px] max-h-[280px] object-cover shadow-lg hover:scale-105 transition-transform cursor-pointer"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  {/* Structured cards */}
                  {msg.responseType === "stock_card" && msg.structuredData && (
                    <StockCard data={msg.structuredData as StockData} />
                  )}
                  {msg.responseType === "stock_history" && msg.structuredData && (
                    <StockHistoryCard data={msg.structuredData as StockHistoryData} />
                  )}
                  {msg.responseType === "image_gallery" && msg.structuredData && (
                    <ImageGalleryCard data={msg.structuredData as ImageGalleryData} />
                  )}
                  {msg.responseType === "transport_board" && msg.structuredData && (
                    <TransportBoardCard data={msg.structuredData as TransportBoardData} />
                  )}
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
            {/* Drag-Drop wrapper + file chips */}
            <FileDropZone
              files={attachedFiles}
              onFilesChange={setAttachedFiles}
              compact
              className="mb-1"
            />

            <div className="flex gap-2 items-end bg-gray-900 border border-gray-700 rounded-2xl px-3 py-2 focus-within:border-indigo-600 transition-colors">
              {/* Attach button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Datei oder Bild anhängen"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:text-white hover:bg-gray-700 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>

              {/* Camera button */}
              <button
                type="button"
                onClick={openCamera}
                title="Foto aufnehmen"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:text-white hover:bg-gray-700 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nachricht an Baddi…"
                className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder-gray-600 max-h-32 py-1"
              />

              {/* Voice button */}
              <VoiceButton
                onResult={handleVoiceResult}
                className="shrink-0 w-9 h-9"
              />

              {/* Send button */}
              <button
                onClick={sendMessage}
                disabled={loading || (!input.trim() && attachedFiles.length === 0)}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
              >
                ↑
              </button>
            </div>

            <p className="text-xs text-gray-700 mt-1.5 text-center">
              Enter senden · Shift+Enter neue Zeile
            </p>

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
