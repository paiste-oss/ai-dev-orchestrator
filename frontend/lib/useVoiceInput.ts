"use client";

import { useState, useRef, useCallback } from "react";

interface UseVoiceInputOptions {
  lang?: string;
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  prompt?: string;
}

export type VoiceError = "not-allowed" | "not-supported" | "no-speech" | "network" | null;

/** Erkennt ob der Browser die Web Speech API unterstützt. */
function hasSpeechApi(): boolean {
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

/** Erkennt ob der Browser MediaRecorder unterstützt (Fallback). */
function hasMediaRecorder(): boolean {
  return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function useVoiceInput({ lang = "de-CH", onResult, prompt }: UseVoiceInputOptions) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<VoiceError>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const showError = useCallback((e: VoiceError) => {
    setError(e);
    setTimeout(() => setError(null), 3000);
  }, []);

  // ── Web Speech API (Chrome Desktop/Android) ──────────────────────────────
  const startSpeechApi = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => { setListening(true); setError(null); };
    recognition.onend   = () => { setListening(false); recognitionRef.current = null; };

    recognition.onerror = (ev: any) => {
      setListening(false);
      recognitionRef.current = null;
      const code: string = ev?.error ?? "";
      if (code === "not-allowed" || code === "permission-denied") showError("not-allowed");
      else if (code === "no-speech") showError("no-speech");
      else if (code === "network")   showError("network");
    };

    recognition.onresult = (event: any) => {
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
      }
      if (final) onResult(final);
    };

    try { recognition.start(); } catch { setListening(false); }
  }, [lang, onResult, showError]);

  // ── MediaRecorder Fallback (Samsung Internet, Firefox, Safari iOS) ────────
  const startMediaRecorder = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

      const blob = new Blob(chunksRef.current, {
        type: mimeType || "audio/webm",
      });
      chunksRef.current = [];

      // Ans Backend schicken
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
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
    if (!hasMediaRecorder() && !hasSpeechApi()) {
      showError("not-supported");
      return;
    }
    if (hasSpeechApi()) startSpeechApi();
    else startMediaRecorder();
  }, [startSpeechApi, startMediaRecorder, showError]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
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
