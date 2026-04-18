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
  },
  {
    id: "design",
    label: "Design",
    icon: "🎨",
    description: "Chat-Erscheinungsbild anpassen: Farben, Schriften, Layout und mehr.",
    defaultWidth: 340,
    defaultHeight: 560,
    status: "active",
    canvasType: "design",
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
  },
];

export function getModule(canvasType: string): WindowModuleDefinition | undefined {
  return WINDOW_MODULES.find(m => m.canvasType === canvasType);
}
