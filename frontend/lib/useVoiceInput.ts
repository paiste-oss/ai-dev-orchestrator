"use client";

import { useState, useRef, useCallback } from "react";
import { AUDIO_CONSTRAINTS, convertToWav } from "@/lib/audioUtils";

interface UseVoiceInputOptions {
  lang?: string;
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  prompt?: string;
}

export type VoiceError = "not-allowed" | "not-supported" | "no-speech" | "network" | null;

/** Erkennt ob der Browser MediaRecorder unterstützt. */
function hasMediaRecorder(): boolean {
  return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function useVoiceInput({ lang = "de-CH", onResult, prompt }: UseVoiceInputOptions) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<VoiceError>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const showError = useCallback((e: VoiceError) => {
    setError(e);
    setTimeout(() => setError(null), 3000);
  }, []);

  // ── MediaRecorder → Whisper Backend (alle Browser) ───────────────────────
  const startMediaRecorder = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
    } catch {
      showError("not-allowed");
      return;
    }

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);

      if (chunksRef.current.length === 0) return;

      const rawBlob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      chunksRef.current = [];

      // Preprocessing: 16kHz Mono WAV
      let audioBlob: Blob;
      try {
        audioBlob = await convertToWav(rawBlob);
      } catch {
        audioBlob = rawBlob; // Fallback: Original senden
      }

      // Ans Backend schicken
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("lang", lang);
      if (prompt) formData.append("prompt", prompt);

      setTranscribing(true);
      try {
        const res = await fetch("/v1/transcribe", {
          method: "POST",
          body: formData,
          headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.text) onResult(data.text);
        else showError("no-speech");
      } catch {
        showError("network");
      } finally {
        setTranscribing(false);
      }
    };

    recorder.start();
    setListening(true);
    setError(null);
  }, [lang, onResult, showError]);

  // ── Öffentliche API ───────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (!hasMediaRecorder()) {
      showError("not-supported");
      return;
    }
    startMediaRecorder();
  }, [startMediaRecorder, showError]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, transcribing, supported: true, error, toggle, start, stop };
}
