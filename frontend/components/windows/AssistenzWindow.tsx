"use client";

import { useState, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

// Koordinaten in % des iframe-Viewports (left, top)
interface Highlight { x: number; y: number; label?: string }
interface AutoAction {
  type: "navigate" | "click" | "type" | "scroll";
  url?: string;
  x?: number; y?: number;        // Pixel auf 1280×720 Viewport
  text?: string; submit?: boolean;
  direction?: "down" | "up";
}

interface Step {
  label: string;
  detail?: string;
  highlight?: Highlight;         // visuelles Overlay auf iframe (%)
  autoAction?: AutoAction;       // was Baddi automatisch tut
}

interface Guide {
  title: string;
  steps: Step[];
}

const KNOWN_GUIDES: { match: string; guide: Guide }[] = [
  {
    match: "ahv-iv.ch",
    guide: {
      title: "AHV-Anmeldung",
      steps: [
        {
          label: "Sprache wählen",
          detail: "Wähle «Deutsch» oben rechts auf der Seite.",
          highlight: { x: 88, y: 4, label: "Sprache" },
          autoAction: { type: "click", x: 1200, y: 28 },
        },
        {
          label: "«Anmelden» klicken",
          detail: "Klicke auf den blauen Button «Anmelden».",
          highlight: { x: 80, y: 12, label: "Anmelden" },
          autoAction: { type: "click", x: 1050, y: 85 },
        },
        {
          label: "Name eingeben",
          detail: "Gib Vor- und Nachnamen ein — genau so wie im Ausweis.",
          highlight: { x: 35, y: 35, label: "Name" },
        },
        {
          label: "AHV-Nummer eingeben",
          detail: "Die 13-stellige Nummer steht auf deiner Versichertenkarte.",
          highlight: { x: 35, y: 50, label: "AHV-Nr." },
        },
        {
          label: "Geburtsdatum eingeben",
          detail: "Format: TT.MM.JJJJ — z.B. 15.03.1952",
          highlight: { x: 35, y: 65, label: "Datum" },
        },
        {
          label: "Formular absenden",
          detail: "Prüfe alle Angaben und klicke auf «Weiter» oder «Absenden».",
          highlight: { x: 55, y: 85, label: "Absenden" },
          autoAction: { type: "click", x: 720, y: 615 },
        },
      ],
    },
  },
  {
    match: "sbb.ch",
    guide: {
      title: "SBB Konto erstellen",
      steps: [
        {
          label: "«Registrieren» klicken",
          detail: "Oben rechts, neben «Anmelden».",
          highlight: { x: 88, y: 5, label: "Registrieren" },
          autoAction: { type: "click", x: 1180, y: 36 },
        },
        {
          label: "E-Mail-Adresse eingeben",
          detail: "Diese wird dein Benutzername.",
          highlight: { x: 50, y: 35, label: "E-Mail" },
        },
        {
          label: "Passwort wählen",
          detail: "Mindestens 8 Zeichen, ein Grossbuchstabe und eine Zahl.",
          highlight: { x: 50, y: 48, label: "Passwort" },
        },
        {
          label: "Vor- und Nachname eingeben",
          detail: "Genau so wie auf deinem Ausweis.",
          highlight: { x: 50, y: 60, label: "Name" },
        },
        {
          label: "Bestätigungs-E-Mail öffnen",
          detail: "SBB schickt dir eine E-Mail — klicke darin auf «Bestätigen».",
          highlight: { x: 50, y: 40, label: "E-Mail prüfen" },
        },
      ],
    },
  },
  {
    match: "post.ch",
    guide: {
      title: "Post-Konto erstellen",
      steps: [
        {
          label: "«Registrieren» klicken",
          detail: "Oben rechts auf post.ch.",
          highlight: { x: 85, y: 4, label: "Registrieren" },
          autoAction: { type: "click", x: 1100, y: 28 },
        },
        {
          label: "E-Mail-Adresse eingeben",
          detail: "Deine persönliche E-Mail-Adresse.",
          highlight: { x: 50, y: 35, label: "E-Mail" },
        },
        {
          label: "Persönliche Daten ausfüllen",
          detail: "Name, Adresse und Geburtsdatum.",
          highlight: { x: 50, y: 50, label: "Daten" },
        },
        {
          label: "Passwort festlegen",
          detail: "Mindestens 8 Zeichen.",
          highlight: { x: 50, y: 63, label: "Passwort" },
        },
        {
          label: "E-Mail bestätigen",
          detail: "Öffne die E-Mail von der Post und klicke auf den Link.",
          highlight: { x: 50, y: 40, label: "E-Mail" },
        },
      ],
    },
  },
  {
    match: "ch.ch",
    guide: {
      title: "ch.ch Behörden-Portal",
      steps: [
        {
          label: "Thema suchen",
          detail: "Gib oben in die Suchleiste ein, worum es geht — z.B. «Umzug melden».",
          highlight: { x: 50, y: 18, label: "Suche" },
          autoAction: { type: "click", x: 640, y: 130 },
        },
        {
          label: "Kanton wählen",
          detail: "Wähle deinen Wohnkanton aus der Liste.",
          highlight: { x: 50, y: 45, label: "Kanton" },
        },
        {
          label: "Formular öffnen",
          detail: "Klicke auf den Link zum Formular.",
          highlight: { x: 50, y: 60, label: "Formular" },
        },
        {
          label: "Angaben ausfüllen",
          detail: "Fülle alle markierten Pflichtfelder aus.",
          highlight: { x: 50, y: 55, label: "Felder" },
        },
        {
          label: "Absenden",
          detail: "Prüfe die Angaben und klicke auf «Einreichen».",
          highlight: { x: 55, y: 82, label: "Absenden" },
        },
      ],
    },
  },
];

const GENERIC_GUIDE: Guide = {
  title: "Schritt-für-Schritt",
  steps: [
    { label: "Seite lädt", detail: "Warte bis die Seite vollständig geladen ist.", highlight: { x: 50, y: 50, label: "Laden…" } },
    { label: "Anmelden suchen", detail: "Schau oben rechts — dort ist meistens ein «Anmelden»-Button.", highlight: { x: 85, y: 5, label: "Anmelden" } },
    { label: "Formular ausfüllen", detail: "Alle Felder mit * sind Pflichtfelder.", highlight: { x: 50, y: 45, label: "Formular" } },
    { label: "Passwort notieren", detail: "Schreib dein Passwort auf — an einem sicheren Ort.", highlight: { x: 50, y: 58, label: "Passwort" } },
    { label: "Absenden", detail: "Klicke auf «Weiter», «Bestätigen» oder «Absenden».", highlight: { x: 55, y: 80, label: "Absenden" } },
    { label: "E-Mail bestätigen", detail: "Schau in dein E-Mail-Postfach — auch im Spam-Ordner.", highlight: { x: 50, y: 50, label: "E-Mail" } },
  ],
};

function getGuide(url: string): Guide {
  const lower = url.toLowerCase();
  return KNOWN_GUIDES.find(g => lower.includes(g.match))?.guide ?? GENERIC_GUIDE;
}

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

export default function AssistenzWindow() {
  const [url, setUrl] = useState("");
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

  const guide = loadedUrl ? getGuide(loadedUrl) : null;
  const currentStep = guide?.steps[activeStep];

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
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/browser`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.screenshot_b64) setScreenshot(data.screenshot_b64);
      if (data.url) setBrowserUrl(data.url);
    } finally {
      setLoading(false);
    }
  }, []);

  async function activateBaddibetrieb() {
    if (!loadedUrl) return;
    setBaddibetrieb(true);
    setLoading(true);
    await doAction({ type: "navigate", url: loadedUrl });
  }

  async function autoRunStep() {
    if (!currentStep?.autoAction || autoRunning) return;
    setAutoRunning(true);
    const a = currentStep.autoAction;
    await doAction(a as Record<string, unknown>);
    setAutoRunning(false);
    // Weiter zum nächsten Schritt
    if (guide && activeStep < guide.steps.length - 1) {
      setActiveStep(s => s + 1);
    }
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
            {KNOWN_GUIDES.map(g => (
              <button
                key={g.match}
                onClick={() => { setUrl(`https://${g.match}`); setTimeout(handleLoad, 50); }}
                className="px-3 py-1.5 rounded-full text-xs text-gray-400 bg-white/5 border border-white/8 hover:bg-white/10 hover:text-white transition-all"
              >
                {g.guide.title}
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

                {/* Visuelles Overlay */}
                {currentStep?.highlight && !frameError && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ zIndex: 20 }}
                  >
                    {/* Verdunklung mit Ausschnitt */}
                    <svg className="absolute inset-0 w-full h-full" style={{ mixBlendMode: "multiply" }}>
                      <defs>
                        <radialGradient id="spotlight" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="transparent" />
                          <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
                        </radialGradient>
                      </defs>
                    </svg>

                    {/* Pulsierender Kreis */}
                    <div
                      className="absolute"
                      style={{
                        left: `${currentStep.highlight.x}%`,
                        top: `${currentStep.highlight.y}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      {/* Äusserer Pulsring */}
                      <div className="absolute inset-0 -m-4 rounded-full border-2 border-indigo-400/60 animate-ping" style={{ width: 48, height: 48, margin: "-8px" }} />
                      {/* Innerer Kreis */}
                      <div className="w-8 h-8 rounded-full border-2 border-indigo-400 bg-indigo-500/20 flex items-center justify-center shadow-lg shadow-indigo-500/50">
                        <div className="w-2 h-2 rounded-full bg-indigo-400" />
                      </div>
                      {/* Label */}
                      {currentStep.highlight.label && (
                        <div
                          className="absolute left-10 top-1/2 -translate-y-1/2 whitespace-nowrap"
                          style={{ transform: "translateY(-50%)" }}
                        >
                          <span className="px-2 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-semibold shadow-lg">
                            {currentStep.highlight.label}
                          </span>
                        </div>
                      )}
                    </div>
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
                  <img
                    ref={imgRef}
                    src={`data:image/jpeg;base64,${screenshot}`}
                    alt="Browser"
                    className="w-full h-full object-contain cursor-crosshair select-none"
                    onClick={handleImgClick}
                    draggable={false}
                  />
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
          {guide && (
            <div className="w-52 shrink-0 border-l border-white/5 flex flex-col overflow-hidden">

              {/* Modus-Umschalter */}
              <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-white/5 space-y-1.5">
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
              </div>

              {/* Schritt-Liste */}
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
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
              </div>

              {/* Navigation */}
              <div className="shrink-0 px-2 py-2 border-t border-white/5 space-y-1.5">
                {/* Baddi-Auto-Schritt */}
                {baddibetrieb && currentStep?.autoAction && (
                  <button
                    onClick={autoRunStep}
                    disabled={autoRunning || loading}
                    className="w-full py-1.5 rounded-lg text-xs text-white bg-indigo-600/80 border border-indigo-500/50 hover:bg-indigo-600 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                  >
                    {autoRunning ? (
                      <>
                        <span className="w-3 h-3 border border-white/50 border-t-transparent rounded-full animate-spin" />
                        Baddi klickt…
                      </>
                    ) : (
                      <>🤖 Schritt ausführen</>
                    )}
                  </button>
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
