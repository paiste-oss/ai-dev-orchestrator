"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseVoiceInputOptions {
  lang?: string;
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
}

export type VoiceError = "not-allowed" | "not-supported" | "no-speech" | "network" | null;

export function useVoiceInput({ lang = "de-CH", onResult, onInterim }: UseVoiceInputOptions) {
  // Startet als false — wird nach Mount gesetzt um Hydration-Fehler zu vermeiden
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceError>(null);
  const recognitionRef = useRef<any>(null);

  // Support-Check nach Mount (client-only)
  useEffect(() => {
    const has = !!(
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    );
    setSupported(has);
  }, []);

  const start = useCallback(() => {
    setError(null);
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
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
      // Fehler nach 3s ausblenden
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

  return { listening, supported, error, toggle, start, stop };
}
