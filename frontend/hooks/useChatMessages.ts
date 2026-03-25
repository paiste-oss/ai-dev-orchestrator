"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Message, UiPrefs } from "@/lib/chat-types";
import { AttachedFile } from "@/components/FileDropZone";
import { fileToBase64, extractVideoFrames } from "@/lib/chat-utils";

interface SendMessageOptions {
  input: string;
  attachedFiles: AttachedFile[];
  onUiUpdate: (update: Partial<UiPrefs>) => void;
  speak: (text: string) => void;
  stripMarkdown: (text: string) => string;
  onAfterSend: () => void;
  setSpeaking: (v: boolean) => void;
  focusTextarea: () => void;
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
    onAfterSend, setSpeaking, focusTextarea,
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
    onAfterSend();
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
      for (const df of docFiles) {
        try {
          const formData = new FormData();
          formData.append("file", df.file);
          const token = typeof window !== "undefined" ? localStorage.getItem("aibuddy_token") : null;
          const uploadRes = await fetch(`${BACKEND_URL}/v1/chat/upload-attachment`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });
          if (uploadRes.ok) {
            const uploaded = await uploadRes.json();
            documentIds.push(uploaded.document_id);
          }
        } catch { /* ignore */ }
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

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unbekannter Fehler" }));
        if (res.status === 402) {
          setMessages(prev => [
            ...prev,
            {
              id: `quota-${Date.now()}`,
              role: "assistant" as const,
              content: "__QUOTA_EXCEEDED__",
              structuredData: { message: err.detail } as unknown as Message["structuredData"],
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
      focusTextarea();
    }
  }

  return { messages, setMessages, loading, historyLoaded, loadHistory, sendMessage };
}
