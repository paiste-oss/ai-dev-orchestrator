"use client";

import { useState, useRef } from "react";

interface Step {
  label: string;
  detail?: string;
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
        { label: "Sprache wählen", detail: "Wähle Deutsch oben rechts auf der Seite." },
        { label: "«Anmelden» klicken", detail: "Klicke auf den blauen Button «Anmelden» oder «Registrieren»." },
        { label: "Name eingeben", detail: "Gib deinen Vor- und Nachnamen ein, genau so wie im Ausweis." },
        { label: "AHV-Nummer eingeben", detail: "Die 13-stellige Nummer findest du auf deiner Versichertenkarte." },
        { label: "Geburtsdatum eingeben", detail: "Format: TT.MM.JJJJ — z.B. 15.03.1952" },
        { label: "Formular absenden", detail: "Prüfe alle Angaben und klicke auf «Weiter» oder «Absenden»." },
      ],
    },
  },
  {
    match: "sbb.ch",
    guide: {
      title: "SBB Konto erstellen",
      steps: [
        { label: "«Registrieren» klicken", detail: "Oben rechts auf der SBB-Seite, neben «Anmelden»." },
        { label: "E-Mail-Adresse eingeben", detail: "Gib deine E-Mail-Adresse ein — diese wird dein Benutzername." },
        { label: "Passwort wählen", detail: "Mindestens 8 Zeichen, ein Grossbuchstabe und eine Zahl." },
        { label: "Vor- und Nachname eingeben", detail: "Genau so wie auf deinem Ausweis." },
        { label: "Bestätigungs-E-Mail öffnen", detail: "SBB schickt dir eine E-Mail — klicke darin auf «Bestätigen»." },
      ],
    },
  },
  {
    match: "post.ch",
    guide: {
      title: "Post-Konto erstellen",
      steps: [
        { label: "«Registrieren» klicken", detail: "Oben rechts auf post.ch." },
        { label: "E-Mail-Adresse eingeben", detail: "Deine persönliche E-Mail-Adresse." },
        { label: "Persönliche Daten ausfüllen", detail: "Name, Adresse und Geburtsdatum." },
        { label: "Passwort festlegen", detail: "Mindestens 8 Zeichen." },
        { label: "E-Mail bestätigen", detail: "Öffne die E-Mail von der Post und klicke auf den Link." },
      ],
    },
  },
  {
    match: "ch.ch",
    guide: {
      title: "ch.ch — Behördenanmeldung",
      steps: [
        { label: "Thema suchen", detail: "Gib oben in die Suchleiste ein, worum es geht — z.B. «Umzug melden»." },
        { label: "Kanton wählen", detail: "Wähle deinen Wohnkanton aus der Liste." },
        { label: "Formular öffnen", detail: "Klicke auf den Link zum Formular." },
        { label: "Angaben ausfüllen", detail: "Fülle alle markierten Pflichtfelder aus." },
        { label: "Absenden", detail: "Prüfe die Angaben und klicke auf «Einreichen» oder «Absenden»." },
      ],
    },
  },
];

const GENERIC_GUIDE: Guide = {
  title: "Schritt-für-Schritt-Hilfe",
  steps: [
    { label: "Seite laden", detail: "Warte bis die Seite vollständig geladen ist." },
    { label: "Anmelden oder Registrieren suchen", detail: "Schau oben rechts — dort ist meistens ein «Anmelden»- oder «Konto erstellen»-Button." },
    { label: "Formular ausfüllen", detail: "Fülle alle Felder mit einem * (Sternchen) aus — diese sind Pflichtfelder." },
    { label: "Passwort merken", detail: "Notiere dir dein Passwort an einem sicheren Ort." },
    { label: "Absenden", detail: "Klicke am Ende auf «Weiter», «Bestätigen» oder «Absenden»." },
    { label: "Bestätigungs-E-Mail prüfen", detail: "Oft kommt eine E-Mail zur Bestätigung — schau auch im Spam-Ordner." },
  ],
};

function getGuide(url: string): Guide {
  const lower = url.toLowerCase();
  const found = KNOWN_GUIDES.find(g => lower.includes(g.match));
  return found ? found.guide : GENERIC_GUIDE;
}

export default function AssistenzWindow() {
  const [url, setUrl] = useState("");
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [frameError, setFrameError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const guide = loadedUrl ? getGuide(loadedUrl) : null;

  function handleLoad() {
    const raw = url.trim();
    if (!raw) return;
    const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
    setLoadedUrl(normalized);
    setActiveStep(0);
    setFrameError(false);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-white">

      {/* URL-Eingabe */}
      <div className="shrink-0 px-3 py-2.5 border-b border-white/5 flex gap-2">
        <input
          ref={inputRef}
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

      {!loadedUrl && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="text-4xl">🧭</span>
          <p className="text-sm text-gray-400 font-medium">Assistenz-Modus</p>
          <p className="text-xs text-gray-600">Gib die Webseite ein, auf der du Hilfe brauchst.<br />Baddi führt dich Schritt für Schritt durch die Anmeldung.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {KNOWN_GUIDES.map(g => (
              <button
                key={g.match}
                onClick={() => { setUrl(g.match); setTimeout(handleLoad, 50); }}
                className="px-3 py-1.5 rounded-full text-xs text-gray-400 bg-white/5 border border-white/8 hover:bg-white/10 hover:text-white transition-all"
              >
                {g.guide.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {loadedUrl && (
        <div className="flex-1 flex overflow-hidden">

          {/* iframe */}
          <div className="flex-1 relative overflow-hidden">
            {frameError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 px-6 text-center">
                <span className="text-3xl">🚫</span>
                <p className="text-sm text-gray-300 font-medium">Diese Seite lässt sich nicht einbetten.</p>
                <p className="text-xs text-gray-500">Viele Behördenwebseiten blockieren das Einbetten.<br />Öffne die Seite im Browser und folge der Anleitung rechts.</p>
                <a
                  href={loadedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 px-4 py-2 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs hover:bg-indigo-500/30 transition-all"
                >
                  Seite in neuem Tab öffnen ↗
                </a>
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
          </div>

          {/* Anleitung */}
          {guide && (
            <div className="w-52 shrink-0 border-l border-white/5 flex flex-col overflow-hidden">
              <div className="px-3 py-2.5 border-b border-white/5 shrink-0">
                <p className="text-xs font-semibold text-white">{guide.title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Schritt {activeStep + 1} von {guide.steps.length}</p>
              </div>

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
                      <span className={`text-xs font-medium ${i === activeStep ? "text-white" : "text-gray-400"}`}>
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
              <div className="shrink-0 px-2 py-2 border-t border-white/5 flex gap-1.5">
                <button
                  onClick={() => setActiveStep(s => Math.max(0, s - 1))}
                  disabled={activeStep === 0}
                  className="flex-1 py-1.5 rounded-lg text-xs text-gray-400 bg-white/5 border border-white/8 hover:bg-white/10 disabled:opacity-30 transition-all"
                >
                  ← Zurück
                </button>
                <button
                  onClick={() => setActiveStep(s => Math.min(guide.steps.length - 1, s + 1))}
                  disabled={activeStep === guide.steps.length - 1}
                  className="flex-1 py-1.5 rounded-lg text-xs text-indigo-400 bg-indigo-500/15 border border-indigo-500/25 hover:bg-indigo-500/25 disabled:opacity-30 transition-all"
                >
                  Weiter →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
