/**
 * Fenster-Registry — definiert alle verfügbaren Window-Module.
 * Wird von der Admin-Seite und vom Chat-Canvas "+" Button verwendet.
 */

export interface WindowModuleDefinition {
  id: string;
  label: string;
  icon: string;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
  status: "active" | "beta" | "coming_soon" | "hidden";
  canvasType: string; // type-String für CardData
  singleton: boolean; // true = nur einmal gleichzeitig offen
}

export const WINDOW_MODULES: WindowModuleDefinition[] = [
  {
    id: "chart",
    label: "Dashboard",
    icon: "📊",
    description: "Aktienkurse und Kursverlauf interaktiv vergleichen. Mehrere Symbole gleichzeitig.",
    defaultWidth: 620,
    defaultHeight: 420,
    status: "active",
    canvasType: "chart",
    singleton: true,
  },
  {
    id: "whiteboard",
    label: "Whiteboard",
    icon: "🗒",
    description: "Freihand zeichnen, Sticker setzen und Notizen anlegen. Wird im Backend gespeichert.",
    defaultWidth: 700,
    defaultHeight: 520,
    status: "active",
    canvasType: "whiteboard",
    singleton: true,
  },
  {
    id: "netzwerk",
    label: "Namensnetz",
    icon: "◉",
    description: "Personen und Netzwerke visualisieren. Daten werden im Backend gespeichert.",
    defaultWidth: 720,
    defaultHeight: 540,
    status: "active",
    canvasType: "netzwerk",
    singleton: true,
  },
  {
    id: "image_viewer",
    label: "Bild-Viewer",
    icon: "🖼",
    description: "Wird automatisch geöffnet beim Doppelklick auf ein Bild im Dokumentenfenster.",
    defaultWidth: 560,
    defaultHeight: 440,
    status: "hidden",
    canvasType: "image_viewer",
    singleton: true,
  },
  {
    id: "file_viewer",
    label: "Datei-Viewer",
    icon: "📄",
    description: "Wird automatisch geöffnet beim Doppelklick auf eine Datei im Dokumentenfenster.",
    defaultWidth: 680,
    defaultHeight: 560,
    status: "hidden",
    canvasType: "file_viewer",
    singleton: false,
  },
  {
    id: "documents",
    label: "Dokumente",
    icon: "📁",
    description: "Hochgeladene Dateien verwalten, löschen und neue Dokumente hochladen.",
    defaultWidth: 620,
    defaultHeight: 520,
    status: "active",
    canvasType: "documents",
    singleton: true,
  },
  {
    id: "diktieren",
    label: "Diktieren",
    icon: "🎙",
    description: "Sprachaufnahmen erstellen, automatisch transkribieren (Whisper) und als Diktat speichern.",
    defaultWidth: 400,
    defaultHeight: 520,
    status: "active",
    canvasType: "diktieren",
    singleton: true,
  },
  {
    id: "memory",
    label: "Gedächtnis",
    icon: "🧠",
    description: "Erinnerungen verwalten — was Baddi über dich weiss.",
    defaultWidth: 360,
    defaultHeight: 480,
    status: "active",
    canvasType: "memory",
    singleton: true,
  },
  {
    id: "geo_map",
    label: "Schweizer Karte",
    icon: "🗺",
    description: "Interaktive swisstopo-Karte für Orte, Adressen, Parzellen und Gemeinden in der Schweiz.",
    defaultWidth: 680,
    defaultHeight: 520,
    status: "active",
    canvasType: "geo_map",
    singleton: true,
  },
  {
    id: "assistenz",
    label: "Assistenz",
    icon: "🧭",
    description: "Baddi führt dich Schritt für Schritt durch eine Anmeldung auf einer Webseite.",
    defaultWidth: 860,
    defaultHeight: 560,
    status: "active",
    canvasType: "assistenz",
    singleton: true,
  },
  {
    id: "flight_board",
    label: "Flugplan",
    icon: "✈",
    description: "Echtzeit-Abflüge und Ankünfte mit Gate, Terminal, Verspätung und Status.",
    defaultWidth: 680,
    defaultHeight: 500,
    status: "active",
    canvasType: "flight_board",
    singleton: true,
  },
  {
    id: "calendar",
    label: "Kalender",
    icon: "📅",
    description: "Persönlicher Kalender mit Monatsansicht, Wochennummern und Terminen. Erstellen, ansehen und löschen.",
    defaultWidth: 660,
    defaultHeight: 560,
    status: "active",
    canvasType: "calendar",
    singleton: true,
  },
  {
    id: "email",
    label: "E-Mail",
    icon: "✉️",
    description: "Eingehende E-Mails lesen, beantworten, vertrauen oder sperren. Zeigt Baddi-Aktionen bei vertrauenswürdigen Absendern.",
    defaultWidth: 600,
    defaultHeight: 520,
    status: "active",
    canvasType: "email",
    singleton: true,
  },
  {
    id: "literature",
    label: "Literatur",
    icon: "📚",
    description: "Persönliche Literaturbibliothek — Paper und Bücher verwalten, RIS/EndNote XML importieren, Baddi durchsucht die Einträge.",
    defaultWidth: 700,
    defaultHeight: 520,
    status: "active",
    canvasType: "literature",
    singleton: true,
  },
  {
    id: "timer",
    label: "Timer",
    icon: "⏲",
    description: "Countdown-Timer oder Stoppuhr — Baddi startet sie per Sprache: 'Starte einen Timer mit 12 Minuten' oder 'Starte eine Stoppuhr'.",
    defaultWidth: 360,
    defaultHeight: 480,
    status: "active",
    canvasType: "timer",
    singleton: false,
  },
  {
    id: "3d_renderer",
    label: "3D-Renderer",
    icon: "🧊",
    description: "3D-Modelle laden und interaktiv betrachten (GLTF/OBJ). Powered by Three.js.",
    defaultWidth: 640,
    defaultHeight: 520,
    status: "coming_soon",
    canvasType: "3d_renderer",
    singleton: true,
  },
];

export function getModule(canvasType: string): WindowModuleDefinition | undefined {
  return WINDOW_MODULES.find(m => m.canvasType === canvasType);
}
