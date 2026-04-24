"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import WindowFrame from "./WindowFrame";

interface Props {
  mode?: "timer" | "stopwatch";
  durationSeconds?: number;
  autostart?: boolean;
}

function fmt(totalMs: number): string {
  const s = Math.max(0, Math.floor(totalMs / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ms = Math.floor((Math.max(0, totalMs) % 1000) / 10);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const beep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    beep(880, 0, 0.2);
    beep(660, 0.25, 0.2);
    beep(880, 0.5, 0.3);
    setTimeout(() => ctx.close(), 1500);
  } catch { /* audio context unavailable */ }
}

export default function TimerWindow({ mode: propMode = "timer", durationSeconds = 60, autostart = false }: Props) {
  const [mode, setMode] = useState<"timer" | "stopwatch">(propMode);
  const isTimer = mode === "timer";
  const totalMs = Math.max(1, Math.floor(durationSeconds * 1000));

  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finished, setFinished] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);

  // Custom duration input (only for timer mode, when not autostarted)
  const [inputH, setInputH] = useState(Math.floor(durationSeconds / 3600).toString());
  const [inputM, setInputM] = useState(Math.floor((durationSeconds % 3600) / 60).toString());
  const [inputS, setInputS] = useState(Math.floor(durationSeconds % 60).toString());
  const [customTotalMs, setCustomTotalMs] = useState(totalMs);

  const startRef = useRef<number | null>(null);
  const baseElapsedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const now = performance.now();
    const delta = now - startRef.current;
    const total = baseElapsedRef.current + delta;
    setElapsedMs(total);
    if (isTimer && total >= customTotalMs) {
      setElapsedMs(customTotalMs);
      setRunning(false);
      setFinished(true);
      playBeep();
      startRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [isTimer, customTotalMs]);

  const start = useCallback(() => {
    if (running || finished) return;
    startRef.current = performance.now();
    setRunning(true);
    setFinished(false);
    rafRef.current = requestAnimationFrame(tick);
  }, [running, finished, tick]);

  const pause = useCallback(() => {
    if (!running) return;
    if (startRef.current !== null) {
      baseElapsedRef.current += performance.now() - startRef.current;
      startRef.current = null;
    }
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setRunning(false);
  }, [running]);

  const reset = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    baseElapsedRef.current = 0;
    setElapsedMs(0);
    setRunning(false);
    setFinished(false);
    setLaps([]);
  }, []);

  const addLap = useCallback(() => {
    setLaps(prev => [elapsedMs, ...prev]);
  }, [elapsedMs]);

  // Manueller Wechsel zwischen Timer und Stoppuhr (Toggle im Fenster)
  const switchMode = useCallback((next: "timer" | "stopwatch") => {
    if (next === mode) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    baseElapsedRef.current = 0;
    setElapsedMs(0);
    setRunning(false);
    setFinished(false);
    setLaps([]);
    setMode(next);
  }, [mode]);

  // Autostart on mount
  useEffect(() => {
    if (autostart) start();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reagiert auf Baddi-Updates (Singleton-Fenster bekommt neue Props)
  const lastPropsRef = useRef({ mode: propMode, durationSeconds });
  useEffect(() => {
    const prev = lastPropsRef.current;
    const modeChanged = prev.mode !== propMode;
    const durationChanged = prev.durationSeconds !== durationSeconds;
    if (!modeChanged && !durationChanged) return;
    lastPropsRef.current = { mode: propMode, durationSeconds };

    // Vollständiger Reset auf die neuen Werte
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    baseElapsedRef.current = 0;
    setElapsedMs(0);
    setFinished(false);
    setLaps([]);
    setMode(propMode);
    if (propMode === "timer") {
      const newTotal = Math.max(1, Math.floor(durationSeconds * 1000));
      setCustomTotalMs(newTotal);
      setInputH(Math.floor(durationSeconds / 3600).toString());
      setInputM(Math.floor((durationSeconds % 3600) / 60).toString());
      setInputS(Math.floor(durationSeconds % 60).toString());
    }
    // Auto-start bei Baddi-Update
    if (autostart) {
      startRef.current = performance.now();
      setRunning(true);
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propMode, durationSeconds]);

  // Update custom duration from inputs
  function applyCustomDuration() {
    const h = Math.max(0, parseInt(inputH) || 0);
    const m = Math.max(0, parseInt(inputM) || 0);
    const s = Math.max(0, parseInt(inputS) || 0);
    const total = (h * 3600 + m * 60 + s) * 1000;
    if (total > 0) {
      setCustomTotalMs(total);
      setElapsedMs(0);
      baseElapsedRef.current = 0;
      setFinished(false);
    }
  }

  const displayMs = isTimer ? Math.max(0, customTotalMs - elapsedMs) : elapsedMs;
  const progress = isTimer ? Math.min(1, elapsedMs / customTotalMs) : 0;

  // Ring geometry
  const size = 240;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = isTimer ? circumference * (1 - progress) : 0;

  return (
    <WindowFrame noBackground className="bg-gradient-to-b from-[#0a0b12] to-[#050811]">
      {/* Header mit Mode-Toggle */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 shrink-0">
        <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-0.5">
          <button
            onClick={() => switchMode("timer")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              isTimer ? "bg-indigo-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}>
            <span>⏲</span>Timer
          </button>
          <button
            onClick={() => switchMode("stopwatch")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              !isTimer ? "bg-indigo-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}>
            <span>⏱</span>Stoppuhr
          </button>
        </div>
        {finished && <span className="ml-auto text-xs text-emerald-400 animate-pulse">Zeit abgelaufen!</span>}
      </div>

      {/* Main Display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 overflow-auto">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none"
            />
            {isTimer && (
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                stroke={finished ? "#10b981" : "#6366f1"}
                strokeWidth={stroke} fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: running ? "none" : "stroke-dashoffset 0.3s ease" }}
              />
            )}
            {!isTimer && running && (
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                stroke="#6366f1"
                strokeWidth={stroke} fill="none"
                strokeLinecap="round"
                strokeDasharray={`${circumference * 0.15} ${circumference}`}
                strokeDashoffset={-(elapsedMs / 20) % circumference}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`font-mono font-light tabular-nums tracking-tight ${finished ? "text-emerald-400" : "text-white"}`}
              style={{ fontSize: displayMs >= 3600000 ? 36 : 48 }}
            >
              {fmt(displayMs)}
            </span>
          </div>
        </div>

        {/* Custom duration inputs — only for timer, when stopped and no elapsed time */}
        {isTimer && !running && elapsedMs === 0 && !finished && (
          <div className="flex items-center gap-1.5 text-xs">
            <input type="number" min={0} max={99} value={inputH}
              onChange={e => setInputH(e.target.value)} onBlur={applyCustomDuration}
              className="w-10 bg-white/5 border border-white/10 rounded px-2 py-1 text-center text-white outline-none focus:border-[var(--accent)]/60" />
            <span className="text-gray-600">h</span>
            <input type="number" min={0} max={59} value={inputM}
              onChange={e => setInputM(e.target.value)} onBlur={applyCustomDuration}
              className="w-10 bg-white/5 border border-white/10 rounded px-2 py-1 text-center text-white outline-none focus:border-[var(--accent)]/60" />
            <span className="text-gray-600">m</span>
            <input type="number" min={0} max={59} value={inputS}
              onChange={e => setInputS(e.target.value)} onBlur={applyCustomDuration}
              className="w-10 bg-white/5 border border-white/10 rounded px-2 py-1 text-center text-white outline-none focus:border-[var(--accent)]/60" />
            <span className="text-gray-600">s</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          {!running && !finished && (
            <button onClick={start}
              className="px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-lg shadow-indigo-600/30">
              {elapsedMs > 0 ? "Weiter" : "Starten"}
            </button>
          )}
          {running && (
            <button onClick={pause}
              className="px-6 py-2.5 rounded-full bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors shadow-lg shadow-amber-600/30">
              Pause
            </button>
          )}
          {!isTimer && running && (
            <button onClick={addLap}
              className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium transition-colors">
              Runde
            </button>
          )}
          {(elapsedMs > 0 || finished) && (
            <button onClick={reset}
              className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium transition-colors">
              Zurücksetzen
            </button>
          )}
        </div>

        {/* Laps (stopwatch only) */}
        {!isTimer && laps.length > 0 && (
          <div className="w-full max-w-xs mt-2">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 px-2">Runden</p>
            <div className="max-h-32 overflow-auto rounded-lg bg-white/3 border border-white/5">
              {laps.map((lap, i) => {
                const lapNum = laps.length - i;
                const prev = i < laps.length - 1 ? laps[i + 1] : 0;
                const diff = lap - prev;
                return (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-white/4 last:border-0 text-xs">
                    <span className="text-gray-500">#{lapNum}</span>
                    <span className="text-gray-400 font-mono tabular-nums">+{fmt(diff)}</span>
                    <span className="text-white font-mono tabular-nums">{fmt(lap)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </WindowFrame>
  );
}
