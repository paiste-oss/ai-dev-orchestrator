"use client";

import { useState, useRef, useCallback } from "react";

interface UseVoiceInputOptions {
  lang?: string;
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
}

export type VoiceError = "not-allowed" | "not-supported" | "no-speech" | "network" | null;

export function useVoiceInput({ lang = "de-CH", onResult, onInterim }: UseVoiceInputOptions) {
  // Immer sichtbar — kein Support-Check. Bei Klick zeigen wir Fehler statt Button zu verstecken.
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceError>(null);
  const recognitionRef = useRef<any>(null);

  const start = useCallback(() => {
    setError(null);
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition;

    if (!SpeechRecognition) {
      setError("not-supported");
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false; // stabiler auf Mobile/iOS
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => { setListening(true); setError(null); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };

    recognition.onerror = (ev: any) => {
      setListening(false);
      recognitionRef.current = null;
      const code: string = ev?.error ?? "";
      if (code === "not-allowed" || code === "permission-denied") {
        setError("not-allowed");
      } else if (code === "no-speech") {
        setError("no-speech");
      } else if (code === "network") {
        setError("network");
      }
      setTimeout(() => setError(null), 3000);
    };

    recognition.onresult = (event: any) => {
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        }
      }
      if (final) onResult(final);
    };

    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }, [lang, onResult, onInterim]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, supported: true, error, toggle, start, stop };
}
