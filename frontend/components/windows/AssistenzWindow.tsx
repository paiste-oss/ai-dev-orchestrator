"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface Step {
  label: string;
  detail?: string;
}

interface Guide {
  title: string;
  steps: Step[];
}

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

export default function AssistenzWindow({ initialUrl, initialGoal }: { initialUrl?: string; initialGoal?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [frameError, setFrameError] = useState(false);

  // Browserless-Modus
  const [baddibetrieb, setBaddibetrieb] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const didAutoLoad = useRef(false);

  // Dynamische Koordinaten — vom Backend via Claude Vision ermittelt
  const [dynCoords, setDynCoords] = useState<{ x: number; y: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);

  // Dynamisch generierter Guide — basiert auf dem echten Seiteninhalt
  const [guide, setGuide] = useState<Guide | null>(null);
  const [generatingGuide, setGeneratingGuide] = useState(false);

  const userLang = typeof navigator !== "undefined" ? navigator.language : "de-CH";
  const acceptLang = `${userLang},${userLang.split("-")[0]};q=0.9`;

  // Auto-laden wenn initialUrl gesetzt
  if (initialUrl && !didAutoLoad.current && !loadedUrl) {
    didAutoLoad.current = true;
    const normalized = initialUrl.startsWith("http") ? initialUrl : `https://${initialUrl}`;
    setTimeout(() => { setLoadedUrl(normalized); setActiveStep(0); setFrameError(false); }, 0);
  }

  const currentStep = guide?.steps[activeStep] ?? null;

  // URL geladen → Guide dynamisch generieren
  useEffect(() => {
    if (!loadedUrl) { setGuide(null); return; }
    let cancelled = false;
    setGuide(null);
    setGeneratingGuide(true);
    setActiveStep(0);
    setDynCoords(null);

    apiFetch(`${BACKEND_URL}/v1/assistenz/generate-guide`, {
      method: "POST",
      body: JSON.stringify({ url: loadedUrl, goal: initialGoal ?? "", lang: acceptLang }),
    })
      .then(r => r.json())
      .then((data: { title?: string; steps?: { label: string; detail?: string }[]; error?: string }) => {
        if (cancelled) return;
        if (data.steps && data.steps.length > 0) {
          setGuide({ title: data.title ?? "Anleitung", steps: data.steps.map(s => ({ label: s.label, detail: s.detail ?? "" })) });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setGeneratingGuide(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedUrl]);

  // Wenn Schritt oder URL wechselt → Element-Position suchen
  useEffect(() => {
    if (!loadedUrl || !currentStep) { setDynCoords(null); setLocateFailed(false); return; }
    // Alle Schritte brauchen Koordinaten (DOM-Suche funktioniert für alle)
    const needsCoords = true;
    if (!needsCoords) { setDynCoords(null); setLocateFailed(false); return; }

    let cancelled = false;
    setDynCoords(null);
    setLocateFailed(false);
    setLocating(true);

    apiFetch(`${BACKEND_URL}/v1/assistenz/locate`, {
      method: "POST",
      body: JSON.stringify({
        url: loadedUrl,
        label: currentStep.label,
        detail: currentStep.detail ?? "",
        lang: acceptLang,
      }),
    })
      .then(r => r.json())
      .then((data: { x?: number | null; y?: number | null; screenshot_b64?: string; error?: string }) => {
        if (cancelled) return;
        if (data.x != null && data.y != null) {
          setDynCoords({ x: data.x, y: data.y });
        } else {
          setLocateFailed(true);
        }
        if (data.screenshot_b64 && baddibetrieb) setScreenshot(data.screenshot_b64);
      })
      .catch(() => { if (!cancelled) setLocateFailed(true); })
      .finally(() => { if (!cancelled) setLocating(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedUrl, activeStep]);

  function handleLoad() {
    const raw = url.trim();
    if (!raw) return;
    const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
    setLoadedUrl(normalized);
    setActiveStep(0);
    setFrameError(false);
    setScreenshot(null);
    setBaddibetrieb(false);
  }

  // ── Browserless ───────────────────────────────────────────────────────────────
  const doAction = useCallback(async (action: Record<string, unknown>) => {
    setLoading(true);
    const navLang = typeof navigator !== "undefined" ? navigator.language : "de-CH";
    const acceptLang = `${navLang},${navLang.split("-")[0]};q=0.9`;
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/browser`, {
        method: "POST",
        body: JSON.stringify({ action, lang: acceptLang }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.screenshot_b64) setScreenshot(data.screenshot_b64);
      if (data.url) setBrowserUrl(data.url);
      return data as { element_x?: number | null; element_y?: number | null };
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  async function activateBaddibetrieb() {
    if (!loadedUrl) return;
    setBaddibetrieb(true);
    setLoading(true);
    await doAction({ type: "navigate", url: loadedUrl });
    // Tree im Hintergrund extrahieren (für präzises Klicken)
    apiFetch(`${BACKEND_URL}/v1/assistenz/extract-tree`, {
      method: "POST",
      body: JSON.stringify({ url: loadedUrl, lang: acceptLang }),
    }).catch(() => {});
  }

  const [stepError, setStepError] = useState<string | null>(null);

  async function autoRunStep() {
    if (autoRunning || !currentStep) return;
    setAutoRunning(true);
    setStepError(null);

    const result = await doAction({
      type: "find_and_click",
      text: currentStep.label,
      maxScrolls: 5,
    });

    if (result?.element_x != null && result.element_y != null) {
      setDynCoords({ x: result.element_x, y: result.element_y });
      // Nur weiterschalten wenn Klick erfolgreich
      if (guide && activeStep < guide.steps.length - 1) {
        setActiveStep(s => s + 1);
      }
    } else {
      setStepError("Element nicht gefunden — bitte manuell klicken oder Schritt überspringen");
    }

    setAutoRunning(false);
  }

  // Klick auf Screenshot → koordinatengenaues Klicken im Browser
  function handleImgClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = VIEWPORT_W / rect.width;
    const scaleY = VIEWPORT_H / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    doAction({ type: "click", x, y });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-white">

      {/* URL-Leiste */}
      <div className="shrink-0 px-3 py-2 border-b border-white/5 flex gap-2 items-center">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLoad()}
          placeholder="z.B. ahv-iv.ch oder sbb.ch"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/25"
        />
        <button
          onClick={handleLoad}
          className="px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 transition-all shrink-0"
        >
          Öffnen
        </button>
      </div>

      {/* Startseite */}
      {!loadedUrl && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="text-4xl">🧭</span>
          <p className="text-sm text-gray-400 font-medium">Assistenz-Modus</p>
          <p className="text-xs text-gray-600 leading-relaxed">Gib die Webseite ein, auf der du Hilfe brauchst.<br />Baddi führt dich Schritt für Schritt — oder übernimmt selbst.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {[
              { label: "AHV / IV", url: "https://www.ahv-iv.ch" },
              { label: "SBB", url: "https://www.sbb.ch" },
              { label: "Post", url: "https://www.post.ch" },
              { label: "Swisscom", url: "https://www.swisscom.ch" },
              { label: "Krankenkasse", url: "https://www.santesuisse.ch" },
              { label: "RAV", url: "https://www.arbeit.swiss" },
            ].map(s => (
              <button
                key={s.url}
                onClick={() => { setUrl(s.url); setTimeout(handleLoad, 50); }}
                className="px-3 py-1.5 rounded-full text-xs text-gray-400 bg-white/5 border border-white/8 hover:bg-white/10 hover:text-white transition-all"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hauptbereich */}
      {loadedUrl && (
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Linke Seite — iframe oder Browserless-Screenshot */}
          <div className="flex-1 relative overflow-hidden bg-black/20">

            {/* ── iframe-Modus ── */}
            {!baddibetrieb && (
              <>
                {frameError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 px-6 text-center z-10">
                    <span className="text-3xl">🚫</span>
                    <p className="text-sm text-gray-300 font-medium">Diese Seite lässt sich nicht einbetten.</p>
                    <p className="text-xs text-gray-500 leading-relaxed">Nutze «Baddi übernimmt» — dann steuert Baddi<br />die Seite direkt und du siehst alles live.</p>
                  </div>
                ) : null}

                <iframe
                  key={loadedUrl}
                  src={loadedUrl}
                  className="w-full h-full border-0"
                  onError={() => setFrameError(true)}
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                  title="Assistenz Browser"
                />

                {/* Visuelles Overlay — Pfeil zeigt auf Ziel, verdeckt es nicht */}
                {!frameError && currentStep && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ zIndex: 20 }}
                  >
                    {/* Ladeanzeige */}
                    {locating && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 text-[11px] text-indigo-300">
                        <span className="w-2.5 h-2.5 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        Suche Button…
                      </div>
                    )}
                    {/* Fallback wenn Browserless nicht verfügbar */}
                    {locateFailed && !dynCoords && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-indigo-600/80 text-[11px] text-white font-medium shadow-lg">
                        ↑ {currentStep.label}
                      </div>
                    )}
                    {/* Pfeil-Spitze liegt genau am Ziel, Körper zeigt von oben-links */}
                    {dynCoords && (
                    <div
                      className="absolute"
                      style={{
                        left: `${(dynCoords.x / 1280) * 100}%`,
                        top: `${(dynCoords.y / 720) * 100}%`,
                        transform: "translate(0, 0)",
                      }}
                    >
                      {/* SVG-Cursor-Pfeil: Spitze bei 0,0 → zeigt genau auf den Button */}
                      <svg
                        width="44" height="52"
                        viewBox="0 0 44 52"
                        style={{
                          position: "absolute",
                          left: -2,
                          top: -2,
                          filter: "drop-shadow(0 2px 6px rgba(99,102,241,0.7))",
                        }}
                      >
                        {/* Pfeil-Umriss (weiss) */}
                        <path
                          d="M2 2 L2 38 L10 30 L17 46 L22 44 L15 28 L26 28 Z"
                          fill="white"
                          stroke="#6366f1"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                        {/* Pfeil-Füllung (indigo) */}
                        <path
                          d="M4 5 L4 34 L11 27 L18 43 L21 42 L14 26 L24 26 Z"
                          fill="#6366f1"
                          opacity="0.9"
                        />
                      </svg>
                      {/* Pulsring direkt am Zielpunkt (klein, nicht verdeckend) */}
                      <div
                        className="absolute rounded-full border-2 border-indigo-400/70 animate-ping"
                        style={{ width: 10, height: 10, left: -5, top: -5 }}
                      />
                      {/* Label-Badge neben dem Pfeil */}
                      {currentStep?.label && (
                        <span
                          className="absolute whitespace-nowrap px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[11px] font-semibold shadow-lg"
                          style={{ left: 44, top: 28 }}
                        >
                          {currentStep.label}
                        </span>
                      )}
                    </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Browserless-Modus ── */}
            {baddibetrieb && (
              <div className="absolute inset-0 flex flex-col">
                {loading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-indigo-300">{autoRunning ? "Baddi klickt…" : "Lädt…"}</p>
                    </div>
                  </div>
                )}
                {screenshot ? (
                  <div className="relative w-full h-full">
                    <img
                      ref={imgRef}
                      src={`data:image/jpeg;base64,${screenshot}`}
                      alt="Browser"
                      className="w-full h-full object-contain cursor-crosshair select-none"
                      onClick={handleImgClick}
                      draggable={false}
                    />
                    {/* Pfeil-Overlay für autoAction-Ziel — nutzt dynamische Koordinaten */}
                    {dynCoords && (
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          left: `${(dynCoords.x / 1280) * 100}%`,
                          top: `${(dynCoords.y / 720) * 100}%`,
                          zIndex: 10,
                        }}
                      >
                        <svg
                          width="44" height="52"
                          viewBox="0 0 44 52"
                          style={{
                            position: "absolute",
                            left: -2,
                            top: -2,
                            filter: "drop-shadow(0 2px 8px rgba(99,102,241,0.9))",
                          }}
                        >
                          <path
                            d="M2 2 L2 38 L10 30 L17 46 L22 44 L15 28 L26 28 Z"
                            fill="white"
                            stroke="#6366f1"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M4 5 L4 34 L11 27 L18 43 L21 42 L14 26 L24 26 Z"
                            fill="#6366f1"
                            opacity="0.9"
                          />
                        </svg>
                        <div
                          className="absolute rounded-full border-2 border-indigo-400/80 animate-ping"
                          style={{ width: 10, height: 10, left: -5, top: -5 }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                    Verbinde mit Browser…
                  </div>
                )}
                {browserUrl && (
                  <div className="shrink-0 px-3 py-1.5 bg-black/60 border-t border-white/5 text-[10px] text-gray-500 truncate">
                    {browserUrl}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rechte Seite — Anleitung */}
          {(guide || generatingGuide) && (
            <div className="w-52 shrink-0 border-l border-white/5 flex flex-col overflow-hidden">

              {/* Guide wird generiert */}
              {generatingGuide && !guide && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
                  <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-[11px] text-indigo-300">Baddi analysiert die Seite…</p>
                  <p className="text-[10px] text-gray-500">Erstelle Anleitung basierend auf dem echten Inhalt</p>
                </div>
              )}

              {/* Modus-Umschalter */}
              {guide && <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-white/5 space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium px-1">{guide.title}</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setBaddibetrieb(false); setFrameError(false); }}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                      !baddibetrieb
                        ? "bg-white/10 border-white/20 text-white"
                        : "bg-transparent border-white/8 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    Ich mache es
                  </button>
                  <button
                    onClick={activateBaddibetrieb}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                      baddibetrieb
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-transparent border-white/8 text-gray-500 hover:text-indigo-400 hover:border-indigo-500/40"
                    }`}
                  >
                    🤖 Baddi
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 px-1 leading-relaxed">
                  {baddibetrieb
                    ? "Baddi steuert den Browser. Klicke selbst oder lass Baddi den nächsten Schritt ausführen."
                    : "Folge der Anleitung. Der Pfeil zeigt wo du klicken musst."}
                </p>
              </div>}

              {/* Schritt-Liste */}
              {guide && <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {guide.steps.map((step, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveStep(i)}
                    className={`w-full text-left rounded-lg p-2 transition-all ${
                      i === activeStep
                        ? "bg-indigo-500/20 border border-indigo-500/25"
                        : i < activeStep
                        ? "opacity-40"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5 ${
                        i < activeStep ? "bg-green-500/30 text-green-400" :
                        i === activeStep ? "bg-indigo-500/50 text-indigo-300" :
                        "bg-white/8 text-gray-500"
                      }`}>
                        {i < activeStep ? "✓" : i + 1}
                      </span>
                      <span className={`text-xs font-medium leading-snug ${i === activeStep ? "text-white" : "text-gray-400"}`}>
                        {step.label}
                      </span>
                    </div>
                    {i === activeStep && step.detail && (
                      <p className="text-[11px] text-indigo-300/80 mt-1.5 ml-6 leading-relaxed">{step.detail}</p>
                    )}
                  </button>
                ))}
              </div>}

              {/* Navigation */}
              <div className="shrink-0 px-2 py-2 border-t border-white/5 space-y-1.5">
                {/* Baddi-Auto-Schritt */}
                {baddibetrieb && currentStep && (
                  <>
                    <button
                      onClick={autoRunStep}
                      disabled={autoRunning || loading}
                      className="w-full py-1.5 rounded-lg text-xs text-white bg-indigo-600/80 border border-indigo-500/50 hover:bg-indigo-600 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                    >
                      {autoRunning ? (
                        <>
                          <span className="w-3 h-3 border border-white/50 border-t-transparent rounded-full animate-spin" />
                          Suche &amp; klicke…
                        </>
                      ) : (
                        <>🤖 Schritt ausführen</>
                      )}
                    </button>
                    {stepError && (
                      <p className="text-[10px] text-amber-400 leading-snug px-1">{stepError}</p>
                    )}
                  </>
                )}
                {/* Vor/Zurück */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setActiveStep(s => Math.max(0, s - 1))}
                    disabled={activeStep === 0}
                    className="flex-1 py-1.5 rounded-lg text-xs text-gray-400 bg-white/5 border border-white/8 hover:bg-white/10 disabled:opacity-30 transition-all"
                  >
                    ← Zurück
                  </button>
                  <button
                    onClick={() => setActiveStep(s => Math.min((guide?.steps.length ?? 1) - 1, s + 1))}
                    disabled={activeStep === (guide?.steps.length ?? 1) - 1}
                    className="flex-1 py-1.5 rounded-lg text-xs text-indigo-400 bg-indigo-500/15 border border-indigo-500/25 hover:bg-indigo-500/25 disabled:opacity-30 transition-all"
                  >
                    Weiter →
                  </button>
                </div>
                {/* Fallback wenn iframe geblockt */}
                {frameError && !baddibetrieb && (
                  <a
                    href={loadedUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center py-1.5 rounded-lg text-[11px] text-gray-400 bg-white/5 border border-white/8 hover:text-white transition-all"
                  >
                    ↗ Seite in Browser öffnen
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes ping-slow {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
