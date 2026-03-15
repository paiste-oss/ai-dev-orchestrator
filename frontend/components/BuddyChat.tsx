"use client";

import { useState, useEffect, useRef, useCallback, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getSession } from "@/lib/auth";
import type { UseCase } from "@/lib/usecases";
import VoiceButton from "@/components/VoiceButton";
import FileDropZone, { AttachedFile } from "@/components/FileDropZone";
import { BuddyEventBannerList } from "@/components/BuddyEventBanner";
import { useBuddyEvents } from "@/lib/useBuddyEvents";
import { API_ROUTES, BACKEND_URL } from "@/lib/config";

interface Message {
  role: "user" | "buddy";
  text: string;
  files?: string[];  // Dateinamen der angehängten Dateien
  fileInfo?: {       // Infos über verarbeitete Dateien
    name: string;
    type: string;
    pages: number;
    chars: number;
    saved_doc_id?: string;
  }[];
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
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragOverChat, setIsDragOverChat] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Customer-UUID für SSE laden
  useEffect(() => {
    if (!user?.email) return;
    fetch(`${BACKEND_URL}/v1/customers/lookup?email=${encodeURIComponent(user.email)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((c) => { if (c?.id) setCustomerId(c.id); })
      .catch(() => {});
  }, [user?.email]);

  // Echtzeit-Events von n8n via SSE
  const { notifications, dismiss, dismissAll } = useBuddyEvents(customerId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ─── Globales Drag-Over für den Chat-Bereich ──────────────────────────────

  const handleChatDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOverChat(true);
    }
  }, []);

  const handleChatDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Nur wenn wirklich außerhalb
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOverChat(false);
    }
  }, []);

  const handleChatDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOverChat(false);

    if (e.dataTransfer.files.length > 0) {
      const newFiles: AttachedFile[] = Array.from(e.dataTransfer.files).map((file) => ({
        file,
        id: `${Date.now()}-${Math.random()}`,
      }));
      setAttachedFiles((prev) => [...prev, ...newFiles].slice(0, 5));
    }
  }, []);

  // ─── Senden ───────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if ((!prompt.trim() && attachedFiles.length === 0) || loading) return;

    const userText = prompt.trim() || "Analysiere diese Datei(en).";
    const fileNames = attachedFiles.map((af) => af.file.name);

    // User-Nachricht sofort anzeigen
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userText, files: fileNames.length > 0 ? fileNames : undefined },
    ]);
    setPrompt("");

    const filesToSend = [...attachedFiles];
    setAttachedFiles([]);
    setLoading(true);

    try {
      if (filesToSend.length > 0) {
        // ── Mit Dateien: Multipart-Request ──────────────────────────────────
        const results = await Promise.all(
          filesToSend.map((af) => sendFileToAgent(af.file, userText))
        );

        // Antworten zusammenfassen wenn mehrere Dateien
        const combinedOutput = results.map((r, i) =>
          filesToSend.length > 1
            ? `**${filesToSend[i].file.name}**\n${r.output}`
            : r.output
        ).join("\n\n---\n\n");

        const fileInfos = results.map((r) => r.file).filter(Boolean);

        setMessages((prev) => [
          ...prev,
          {
            role: "buddy",
            text: combinedOutput || "Keine Antwort.",
            fileInfo: fileInfos,
          },
        ]);
      } else {
        // ── Nur Text: Standard-Request ──────────────────────────────────────
        const res = await fetch(API_ROUTES.agentRun, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: userText,
            model: "mistral",
            system_prompt: useCase.systemPrompt,
            customer_id: user?.email,  // E-Mail als Customer-ID Proxy für Dokument-Kontext
          }),
        });
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "buddy", text: data.output || "Keine Antwort." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "buddy", text: "Verbindung fehlgeschlagen. Läuft Docker?" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendFileToAgent = async (file: File, userPrompt: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("prompt", userPrompt || "Analysiere dieses Dokument und fasse die wichtigsten Informationen zusammen.");
    formData.append("model", "auto");
    formData.append("system_prompt", useCase.systemPrompt);
    // Wenn User bekannt: Dokument persistieren
    if (user?.email) {
      formData.append("customer_id", user.email);
      formData.append("store_postgres", "true");
      formData.append("store_qdrant", "true");
    } else {
      formData.append("store_postgres", "false");
      formData.append("store_qdrant", "false");
    }

    const res = await fetch(`${BACKEND_URL}/agent/run-with-file`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    return res.json();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={`min-h-screen ${useCase.bgColor} text-white flex flex-col relative`}
      onDragOver={handleChatDragOver}
      onDragLeave={handleChatDragLeave}
      onDrop={handleChatDrop}
    >
      {/* Drag-Over Overlay für den gesamten Chat */}
      {isDragOverChat && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="absolute inset-0 bg-blue-900/60 backdrop-blur-sm border-4 border-dashed border-blue-400 rounded-none" />
          <div className="relative z-10 text-center space-y-3">
            <div className="text-6xl">📎</div>
            <p className="text-white text-2xl font-bold">Datei hier ablegen</p>
            <p className="text-blue-200 text-sm">PDF, Word, Excel, PowerPoint, CSV, TXT ...</p>
          </div>
        </div>
      )}

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

      {/* Echtzeit-Event-Banner (n8n → Buddy → Frontend) */}
      {notifications.length > 0 && (
        <div className="max-w-2xl w-full mx-auto px-4 pt-3">
          <BuddyEventBannerList
            notifications={notifications}
            onDismiss={dismiss}
            onDismissAll={dismissAll}
          />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center mt-24 space-y-3 px-4">
            <div className="text-5xl">{useCase.icon}</div>
            <p className={`text-lg font-semibold ${useCase.color}`}>
              Hallo! Ich bin {useCase.buddyName}.
            </p>
            <p className="text-gray-400 text-sm">{useCase.tagline}</p>
            <p className="text-gray-500 text-xs mt-4">
              💡 Tipp: Du kannst Dateien per Drag & Drop in den Chat ziehen
            </p>
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
              {/* Datei-Anhänge anzeigen */}
              {msg.files && msg.files.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {msg.files.map((fname, fi) => (
                    <span
                      key={fi}
                      className="inline-flex items-center gap-1 bg-white/20 rounded-md px-2 py-0.5 text-xs"
                    >
                      📎 {fname}
                    </span>
                  ))}
                </div>
              )}
              {msg.text}
              {/* Verarbeitungs-Info */}
              {msg.fileInfo && msg.fileInfo.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                  {msg.fileInfo.map((fi, idx) => (
                    <p key={idx} className="text-xs text-gray-400">
                      ✅ {fi.name} · {fi.type?.toUpperCase()} · {fi.pages} Seite(n) · {fi.chars?.toLocaleString()} Zeichen
                      {fi.saved_doc_id && " · 💾 Gespeichert"}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <span className="text-xl mr-2 mt-1">{useCase.icon}</span>
            <div className={`${useCase.bubbleColor} rounded-2xl rounded-bl-sm px-4 py-3`}>
              <div className="flex gap-1 items-center h-5">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className={`bg-black/30 border-t ${useCase.borderColor} px-4 py-3 max-w-2xl w-full mx-auto`}>

        {/* FileDropZone kompakt — zeigt angehängte Dateien als Chips */}
        <FileDropZone
          files={attachedFiles}
          onFilesChange={setAttachedFiles}
          compact
          className="mb-2"
        />

        <div className="flex items-end gap-2">
          {/* Datei-Anheft-Button */}
          <button
            onClick={() => {
              // Trigger versteckten File-Input via ID
              document.getElementById("buddy-file-input")?.click();
            }}
            className="text-gray-400 hover:text-white transition-colors p-2 shrink-0 mb-0.5"
            title="Datei anhängen"
          >
            📎
          </button>
          <input
            id="buddy-file-input"
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.xml,.html,.log"
            onChange={(e) => {
              if (e.target.files) {
                const newFiles: AttachedFile[] = Array.from(e.target.files).map((f) => ({
                  file: f,
                  id: `${Date.now()}-${Math.random()}`,
                }));
                setAttachedFiles((prev) => [...prev, ...newFiles].slice(0, 5));
              }
              e.target.value = "";
            }}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              attachedFiles.length > 0
                ? "Was soll ich mit der Datei machen? (oder leer lassen für Zusammenfassung)"
                : useCase.placeholder
            }
            rows={1}
            className={`
              flex-1 bg-white/10 border ${useCase.borderColor} rounded-2xl px-4 py-3
              text-sm text-white placeholder-gray-500 outline-none focus:ring-1
              focus:ring-white/30 resize-none overflow-hidden min-h-[44px] max-h-[120px]
            `}
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
            }}
          />

          {/* Voice Button */}
          <VoiceButton
            onResult={(text: string) => setPrompt((prev) => prev + text)}
            className="shrink-0"
          />

          {/* Senden */}
          <button
            onClick={handleSend}
            disabled={loading || (!prompt.trim() && attachedFiles.length === 0)}
            className={`
              shrink-0 w-10 h-10 rounded-full flex items-center justify-center
              transition-all duration-150 font-bold text-lg
              ${loading || (!prompt.trim() && attachedFiles.length === 0)
                ? "bg-white/10 text-gray-600 cursor-not-allowed"
                : `bg-white/20 hover:bg-white/30 text-white`
              }
            `}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
            ) : (
              "↑"
            )}
          </button>
        </div>

        <p className="text-center text-gray-600 text-xs mt-2">
          Enter zum Senden · Shift+Enter für Zeilenumbruch · 📎 für Datei-Anhang
        </p>
      </div>
    </div>
  );
}
