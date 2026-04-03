"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { getWhisperPrompt } from "@/lib/whisperPrompts";
import { AUDIO_CONSTRAINTS, convertToWav } from "@/lib/audioUtils";

type Step = "idle" | "recording" | "review";

interface Dictation {
  id: string;
  title: string;
  transcript: string;
  duration_seconds: number;
  created_at: string;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function DictationWindow({ language }: { language?: string }) {
  const [step, setStep] = useState<Step>("idle");
  const [dictations, setDictations] = useState<Dictation[]>([]);
  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const audioRef    = useRef<Blob | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef  = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await apiFetch(`${BACKEND_URL}/v1/dictations/mine`);
    if (res.ok) setDictations(await res.json());
  }

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (!chunksRef.current.length) { setStep("idle"); return; }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        audioRef.current = blob;
        setTitle(`Diktat ${new Date().toLocaleDateString("de-CH")}`);
        setStep("review");
      };
      rec.start(200);
      recorderRef.current = rec;
      setElapsed(0);
      setStep("recording");
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch { setError("Mikrofon-Zugriff verweigert."); }
  }, []);

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  function cancelReview() {
    setStep("idle"); setTranscript(""); setTitle(""); setError(null);
    audioRef.current = null;
  }

  async function saveDictation() {
    if (!audioRef.current) return;
    setSaving(true);
    try {
      const blob = audioRef.current;
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `aufnahme.${ext}`);
      fd.append("transcript", transcript);
      fd.append("title", title || "Diktat");
      fd.append("duration_seconds", String(elapsed));
      const res = await apiFetchForm(`${BACKEND_URL}/v1/dictations/`, fd);
      if (!res.ok) throw new Error();
      audioRef.current = null;
      setStep("idle"); setTranscript(""); setTitle("");
      await load();
    } catch { setError("Speichern fehlgeschlagen."); }
    finally { setSaving(false); }
  }

  async function transcribeDictation(id: string) {
    setTranscribing(id);
    setError(null);
    try {
      // Audio laden
      const audioRes = await apiFetch(`${BACKEND_URL}/v1/dictations/${id}/audio`);
      if (!audioRes.ok) throw new Error();
      const rawBlob = await audioRes.blob();
      let blob: Blob;
      let filename: string;
      try {
        blob = await convertToWav(rawBlob);
        filename = "aufnahme.wav";
      } catch {
        blob = rawBlob;
        // Dateiname passend zum tatsächlichen Format
        const t = rawBlob.type.toLowerCase();
        filename = t.includes("mp4") || t.includes("m4a") ? "aufnahme.mp4"
                 : t.includes("ogg") ? "aufnahme.ogg"
                 : t.includes("wav") ? "aufnahme.wav"
                 : "aufnahme.webm";
      }
      // An Whisper schicken
      const fd = new FormData();
      fd.append("audio", blob, filename);
      fd.append("lang", language ?? "de");
      fd.append("prompt", getWhisperPrompt(language, "dictation"));
      const transRes = await apiFetchForm(`${BACKEND_URL}/v1/transcribe`, fd);
      if (!transRes.ok) throw new Error("Whisper nicht verfügbar");
      const { text } = await transRes.json();
      if (!text?.trim()) throw new Error("Kein Text erkannt");
      // Transkript speichern
      const saveFd = new FormData();
      saveFd.append("transcript", text.trim());
      await apiFetchForm(`${BACKEND_URL}/v1/dictations/${id}/transcript`, saveFd);
      setDictations(prev => prev.map(d => d.id === id ? { ...d, transcript: text.trim() } : d));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transkription fehlgeschlagen");
    } finally { setTranscribing(null); }
  }

  async function deleteDictation(id: string) {
    setDeleting(id);
    await apiFetch(`${BACKEND_URL}/v1/dictations/${id}`, { method: "DELETE" });
    setDictations(prev => prev.filter(d => d.id !== id));
    setDeleting(null);
  }

  async function playDictation(id: string) {
    if (playingId === id) {
      audioElRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current = null; }
    setPlayingId(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/dictations/${id}/audio`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioElRef.current = audio;
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      audio.play();
    } catch { setPlayingId(null); }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-white">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/5 shrink-0 flex items-center justify-between">
        <p className="text-xs text-gray-500">Sprachaufnahmen aufnehmen &amp; transkribieren</p>
        {step === "idle" && (
          <span className="text-[10px] text-gray-600">{dictations.length} Diktat{dictations.length !== 1 ? "e" : ""}</span>
        )}
      </div>

      {/* Recorder */}
      <div className="shrink-0 px-4 py-4 border-b border-white/5">
        {step === "idle" && (
          <button
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium"
          >
            <span className="text-lg">🎤</span> Aufnahme starten
          </button>
        )}

        {step === "recording" && (
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-red-400 font-mono text-sm tabular-nums">{formatDuration(elapsed)}</span>
            <span className="text-gray-500 text-xs flex-1">Aufnahme läuft…</span>
            <button
              onClick={stopRecording}
              className="px-4 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/30 transition-all"
            >
              Stopp
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <span>🎤</span>
              <span>Aufnahme bereit · {formatDuration(elapsed)}</span>
            </div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Titel"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/25"
            />
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              rows={3}
              placeholder="Notiz (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/25 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={saveDictation} disabled={saving}
                className="flex-1 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs hover:bg-emerald-500/25 transition-all disabled:opacity-40"
              >
                {saving ? "Speichert…" : "Speichern"}
              </button>
              <button
                onClick={cancelReview}
                className="px-4 py-1.5 rounded-lg border border-white/8 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-all"
              >
                Verwerfen
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {dictations.length === 0 && step === "idle" && (
          <p className="text-center text-gray-600 text-sm pt-8">Noch keine Diktate gespeichert.</p>
        )}
        {dictations.map(d => (
          <div key={d.id} className="group rounded-xl border border-white/6 bg-white/3 p-3 space-y-1.5 hover:border-white/12 transition-all">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-white truncate">{d.title}</p>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => playDictation(d.id)}
                  title={playingId === d.id ? "Pause" : "Abspielen"}
                  className={`p-1 rounded text-xs transition-all ${playingId === d.id ? "text-emerald-400" : "text-gray-500 hover:text-emerald-400"}`}
                >
                  {playingId === d.id ? "⏸" : "▶"}
                </button>
                <button
                  onClick={() => transcribeDictation(d.id)}
                  disabled={transcribing === d.id}
                  title="Transkribieren"
                  className={`p-1 rounded text-xs transition-all ${transcribing === d.id ? "text-blue-400 animate-pulse" : "text-gray-500 hover:text-blue-400"}`}
                >
                  {transcribing === d.id ? "⏳" : "📝"}
                </button>
                <button
                  onClick={() => deleteDictation(d.id)} disabled={deleting === d.id}
                  className="p-1 rounded text-gray-600 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-30"
                  title="Löschen"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                  </svg>
                </button>
              </div>
            </div>
            {d.transcript && (
              <p className="text-xs text-gray-400 line-clamp-2">{d.transcript}</p>
            )}
            <div className="flex items-center gap-2 text-[10px] text-gray-600">
              <span>{formatDate(d.created_at)}</span>
              {d.duration_seconds > 0 && <span>· {formatDuration(d.duration_seconds)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
