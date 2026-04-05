"use client";

import { useState } from "react";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Message, UiPrefs, QuotaExceededData } from "@/lib/chat-types";
import { AttachedFile } from "@/components/FileDropZone";
import { fileToBase64, extractVideoFrames } from "@/lib/chat-utils";

export interface UploadedFileInfo {
  filename: string;
  blobUrl: string;
  fileType: string;
}

interface SendMessageOptions {
  input: string;
  attachedFiles: AttachedFile[];
  onUiUpdate: (update: Partial<UiPrefs>) => void;
  speak: (text: string) => void;
  stripMarkdown: (text: string) => string;
  onAfterSend: () => void;
  onFilesChange: (files: AttachedFile[]) => void;
  onFileUploaded?: (info: UploadedFileInfo) => void;
  setSpeaking: (v: boolean) => void;
  focusTextarea: () => void;
  onEmotion?: (emotion: string | null) => void;
}

export function useChatMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  async function loadHistory() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/history?limit=60`);
      if (res.ok) setMessages(await res.json());
    } catch { /* ignore */ } finally {
      setHistoryLoaded(true);
    }
  }

  async function sendMessage({
    input, attachedFiles, onUiUpdate, speak, stripMarkdown,
    onAfterSend, onFilesChange, onFileUploaded, setSpeaking, focusTextarea, onEmotion,
  }: SendMessageOptions) {
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || loading) return;

    const imageFiles = attachedFiles.filter(f => f.file.type.startsWith("image/"));
    const videoFiles = attachedFiles.filter(f =>
      f.file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(f.file.name)
    );
    const docFiles = attachedFiles.filter(f =>
      !f.file.type.startsWith("image/") &&
      !f.file.type.startsWith("video/") &&
      !/\.(mp4|mov|webm)$/i.test(f.file.name)
    );

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
    onAfterSend();  // Input leeren
    // DocFiles als "uploading" markieren (bleiben sichtbar bis Upload fertig)
    if (docFiles.length > 0) {
      onFilesChange(docFiles.map(f => ({ ...f, status: "uploading" as const })));
    }
    setLoading(true);
    setSpeaking(true);

    try {
      const imagesPayload = await Promise.all(
        imageFiles.map(async af => ({
          data: await fileToBase64(af.file),
          media_type: af.file.type,
        }))
      );

      for (const vf of videoFiles) {
        const frames = await extractVideoFrames(vf.file, 4);
        for (const frame of frames) {
          imagesPayload.push({ data: frame, media_type: "image/jpeg" });
        }
      }

      // Dokumente hochladen und document_ids sammeln
      const documentIds: string[] = [];
      const uploadedStatuses = new Map<string, "done" | "error">();
      for (const df of docFiles) {
        // Blob-URL vor dem Upload erstellen (File-Objekt ist danach noch gültig)
        const blobUrl = URL.createObjectURL(df.file);
        const ext = df.file.name.split(".").pop()?.toLowerCase() ?? "";
        try {
          const formData = new FormData();
          formData.append("file", df.file);
          const uploadRes = await apiFetchForm(`${BACKEND_URL}/v1/chat/upload-attachment`, formData);
          if (uploadRes.ok) {
            const uploaded = await uploadRes.json();
            documentIds.push(uploaded.document_id);
            uploadedStatuses.set(df.id, "done");
            // Fenster öffnen
            onFileUploaded?.({ filename: df.file.name, blobUrl, fileType: ext });
          } else {
            uploadedStatuses.set(df.id, "error");
            URL.revokeObjectURL(blobUrl);
          }
        } catch {
          uploadedStatuses.set(df.id, "error");
          URL.revokeObjectURL(blobUrl);
        }
      }
      // Status kurz als "done"/"error" anzeigen, dann Files leeren
      if (docFiles.length > 0) {
        onFilesChange(docFiles.map(f => ({ ...f, status: uploadedStatuses.get(f.id) ?? "error" })));
        setTimeout(() => onFilesChange([]), 1200);
      }

      const fullMessage = [
        text,
        videoFiles.length > 0
          ? `[Video analysieren: ${videoFiles.map(f => f.file.name).join(", ")} — ${videoFiles.length * 4} Frames extrahiert]`
          : "",
      ].filter(Boolean).join("\n");

      const body: Record<string, unknown> = { message: fullMessage };
      if (imagesPayload.length > 0) body.images = imagesPayload;
      if (documentIds.length > 0) body.document_ids = documentIds;

      const res = await apiFetch(`${BACKEND_URL}/v1/chat/message`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      // 401 → apiFetch leitet zu /login weiter, kein Fehler anzeigen
      if (res.status === 401) return;

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unbekannter Fehler" }));
        if (res.status === 402) {
          setMessages(prev => [
            ...prev,
            {
              id: `quota-${Date.now()}`,
              role: "assistant" as const,
              content: "__QUOTA_EXCEEDED__",
              structuredData: { message: err.detail } as QuotaExceededData,
              created_at: new Date().toISOString(),
            },
          ]);
          return;
        }
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
      setMessages(prev => [...prev, assistantMsg]);
      if (data.ui_update) onUiUpdate(data.ui_update);
      if (onEmotion) onEmotion(data.emotion ?? null);
      speak(stripMarkdown(data.response));

      return data.provider as string | undefined;
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
      // Auf Mobile kein Auto-Focus — verhindert ungewolltes Öffnen der Tastatur
      if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        focusTextarea();
      }
    }
  }

  return { messages, setMessages, loading, historyLoaded, loadHistory, sendMessage };
}
