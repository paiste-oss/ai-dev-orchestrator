"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { useT } from "@/lib/i18n";

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

const QUICK_LINKS = [
  { label: "AHV / IV",     url: "https://www.ahv-iv.ch" },
  { label: "SBB",          url: "https://www.sbb.ch" },
  { label: "Post",         url: "https://www.post.ch" },
  { label: "Swisscom",     url: "https://www.swisscom.ch" },
  { label: "Krankenkasse", url: "https://www.santesuisse.ch" },
  { label: "RAV",          url: "https://www.arbeit.swiss" },
];

export default function AssistenzWindow({ initialUrl, initialGoal }: { initialUrl?: string; initialGoal?: string }) {
  const t = useT();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [frameError, setFrameError] = useState(false);

  const [baddibetrieb, setBaddibetrieb] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const didAutoLoad = useRef(false);

  const [dynCoords, setDynCoords] = useState<{ x: number; y: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);

  const [guide, setGuide] = useState<Guide | null>(null);
  const [generatingGuide, setGeneratingGuide] = useState(false);

  const userLang = typeof navigator !== "undefined" ? navigator.language : "de-CH";
  const acceptLang = `${userLang},${userLang.split("-")[0]};q=0.9`;

  useEffect(() => {
    if (initialUrl && !didAutoLoad.current && !loadedUrl) {
      didAutoLoad.current = true;
      const normalized = initialUrl.startsWith("http") ? initialUrl : `https://${initialUrl}`;
      setLoadedUrl(normalized);
      setActiveStep(0);
      setFrameError(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentStep = guide?.steps[activeStep] ?? null;

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
          setGuide({ title: data.title ?? t("assistenz.guide_default"), steps: data.steps.map(s => ({ label: s.label, detail: s.detail ?? "" })) });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setGeneratingGuide(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedUrl]);

  useEffect(() => {
    if (!loadedUrl || !currentStep) { setDynCoords(null); setLocateFailed(false); return; }
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

  const doAction = useCallback(async (action: Record<string, unknown>) => {
    setLoading(true);
    const navLang = typeof navigator !== "undefined" ? navigator.language : "de-CH";
    const al = `${navLang},${navLang.split("-")[0]};q=0.9`;
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/browser`, {
        method: "POST",
        body: JSON.stringify({ action, lang: al }),
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
      if (guide && activeStep < guide.steps.length - 1) {
        setActiveStep(s => s + 1);
      }
    } else {
      setStepError(t("assistenz.step_error"));
    }

    setAutoRunning(false);
  }

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
          placeholder={t("assistenz.placeholder")}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/25"
        />
        <button
          onClick={handleLoad}
          className="px-3 py-1.5 rounded-lg bg-[var(--accent-20)] border border-[var(--accent-30)] text-[var(--accent-light)] text-sm hover:bg-[var(--accent-30)] transition-all shrink-0"
        >
          {t("assistenz.open")}
        </button>
      </div>

      {/* Startseite */}
      {!loadedUrl && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="text-4xl">🧭</span>
          <p className="text-sm text-gray-400 font-medium">{t("assistenz.title")}</p>
          <p className="text-xs text-gray-600 leading-relaxed">{t("assistenz.desc")}<br />{t("assistenz.desc2")}</p>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {QUICK_LINKS.map(s => (
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

          {/* Linke Seite */}
          <div className="flex-1 relative overflow-hidden bg-black/20">

            {/* iframe-Modus */}
            {!baddibetrieb && (
              <>
                {frameError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 px-6 text-center z-10">
                    <span className="text-3xl">🚫</span>
                    <p className="text-sm text-gray-300 font-medium">{t("assistenz.frame_error")}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{t("assistenz.frame_error_hint")}</p>
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

                {!frameError && currentStep && (
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
                    {locating && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 text-[11px] text-[var(--accent-light)]">
                        <span className="w-2.5 h-2.5 border border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                        {t("assistenz.locating")}
                      </div>
                    )}
                    {locateFailed && !dynCoords && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-[var(--accent)] text-[11px] text-[var(--accent-text)] font-medium shadow-lg">
                        ↑ {currentStep.label}
                      </div>
                    )}
                    {dynCoords && (
                      <div className="absolute" style={{ left: `${(dynCoords.x / 1280) * 100}%`, top: `${(dynCoords.y / 720) * 100}%` }}>
                        <svg width="44" height="52" viewBox="0 0 44 52"
                          style={{ position: "absolute", left: -2, top: -2, filter: "drop-shadow(0 2px 6px rgba(99,102,241,0.7))" }}>
                          <path d="M2 2 L2 38 L10 30 L17 46 L22 44 L15 28 L26 28 Z" fill="white" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
                          <path d="M4 5 L4 34 L11 27 L18 43 L21 42 L14 26 L24 26 Z" fill="#6366f1" opacity="0.9" />
                        </svg>
                        <div className="absolute rounded-full border-2 border-[var(--accent-40)] animate-ping" style={{ width: 10, height: 10, left: -5, top: -5 }} />
                        {currentStep?.label && (
                          <span className="absolute whitespace-nowrap px-2 py-0.5 rounded-md bg-[var(--accent)] text-[var(--accent-text)] text-[11px] font-semibold shadow-lg" style={{ left: 44, top: 28 }}>
                            {currentStep.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Browserless-Modus */}
            {baddibetrieb && (
              <div className="absolute inset-0 flex flex-col">
                {loading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-[var(--accent-light)]">{autoRunning ? t("assistenz.clicking") : t("assistenz.loading")}</p>
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
                    {dynCoords && (
                      <div className="absolute pointer-events-none"
                        style={{ left: `${(dynCoords.x / 1280) * 100}%`, top: `${(dynCoords.y / 720) * 100}%`, zIndex: 10 }}>
                        <svg width="44" height="52" viewBox="0 0 44 52"
                          style={{ position: "absolute", left: -2, top: -2, filter: "drop-shadow(0 2px 8px rgba(99,102,241,0.9))" }}>
                          <path d="M2 2 L2 38 L10 30 L17 46 L22 44 L15 28 L26 28 Z" fill="white" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
                          <path d="M4 5 L4 34 L11 27 L18 43 L21 42 L14 26 L24 26 Z" fill="#6366f1" opacity="0.9" />
                        </svg>
                        <div className="absolute rounded-full border-2 border-[var(--accent-40)] animate-ping" style={{ width: 10, height: 10, left: -5, top: -5 }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                    {t("assistenz.connecting")}
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

              {generatingGuide && !guide && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
                  <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  <p className="text-[11px] text-[var(--accent-light)]">{t("assistenz.generating")}</p>
                  <p className="text-[10px] text-gray-500">{t("assistenz.generating_detail")}</p>
                </div>
              )}

              {guide && <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-white/5 space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium px-1">{guide.title}</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setBaddibetrieb(false); setFrameError(false); }}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                      !baddibetrieb ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-white/8 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {t("assistenz.i_do_it")}
                  </button>
                  <button
                    onClick={activateBaddibetrieb}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                      baddibetrieb ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-text)]" : "bg-transparent border-white/8 text-gray-500 hover:text-[var(--accent-light)] hover:border-[var(--accent-40)]"
                    }`}
                  >
                    {t("assistenz.baddi_does")}
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 px-1 leading-relaxed">
                  {baddibetrieb ? t("assistenz.mode_baddi") : t("assistenz.mode_manual")}
                </p>
              </div>}

              {guide && <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {guide.steps.map((step, i) => (
                  <button key={i} onClick={() => setActiveStep(i)}
                    className={`w-full text-left rounded-lg p-2 transition-all ${
                      i === activeStep ? "bg-[var(--accent-20)] border border-[var(--accent-20)]" :
                      i < activeStep ? "opacity-40" : "hover:bg-white/5"
                    }`}>
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5 ${
                        i < activeStep ? "bg-green-500/30 text-green-400" :
                        i === activeStep ? "bg-[var(--accent-50)] text-[var(--accent-light)]" :
                        "bg-white/8 text-gray-500"
                      }`}>
                        {i < activeStep ? "✓" : i + 1}
                      </span>
                      <span className={`text-xs font-medium leading-snug ${i === activeStep ? "text-white" : "text-gray-400"}`}>
                        {step.label}
                      </span>
                    </div>
                    {i === activeStep && step.detail && (
                      <p className="text-[11px] text-[var(--accent-light)]/80 mt-1.5 ml-6 leading-relaxed">{step.detail}</p>
                    )}
                  </button>
                ))}
              </div>}

              {/* Navigation */}
              <div className="shrink-0 px-2 py-2 border-t border-white/5 space-y-1.5">
                {baddibetrieb && currentStep && (
                  <>
                    <button
                      onClick={autoRunStep}
                      disabled={autoRunning || loading}
                      className="w-full py-1.5 rounded-lg text-xs text-white bg-[var(--accent)] border border-[var(--accent-50)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                    >
                      {autoRunning ? (
                        <>
                          <span className="w-3 h-3 border border-white/50 border-t-transparent rounded-full animate-spin" />
                          {t("assistenz.running")}
                        </>
                      ) : (
                        <>{t("assistenz.run_step")}</>
                      )}
                    </button>
                    {stepError && (
                      <p className="text-[10px] text-amber-400 leading-snug px-1">{stepError}</p>
                    )}
                  </>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setActiveStep(s => Math.max(0, s - 1))}
                    disabled={activeStep === 0}
                    className="flex-1 py-1.5 rounded-lg text-xs text-gray-400 bg-white/5 border border-white/8 hover:bg-white/10 disabled:opacity-30 transition-all"
                  >
                    {t("assistenz.back")}
                  </button>
                  <button
                    onClick={() => setActiveStep(s => Math.min((guide?.steps.length ?? 1) - 1, s + 1))}
                    disabled={activeStep === (guide?.steps.length ?? 1) - 1}
                    className="flex-1 py-1.5 rounded-lg text-xs text-[var(--accent-light)] bg-[var(--accent-15)] border border-[var(--accent-20)] hover:bg-[var(--accent-20)] disabled:opacity-30 transition-all"
                  >
                    {t("assistenz.next")}
                  </button>
                </div>
                {frameError && !baddibetrieb && (
                  <a
                    href={loadedUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center py-1.5 rounded-lg text-[11px] text-gray-400 bg-white/5 border border-white/8 hover:text-white transition-all"
                  >
                    {t("assistenz.open_browser")}
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
