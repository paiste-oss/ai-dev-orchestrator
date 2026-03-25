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
  status: "active" | "beta" | "coming_soon";
  canvasType: string; // type-String für CardData
}

export const WINDOW_MODULES: WindowModuleDefinition[] = [
  {
    id: "browser",
    label: "Browser",
    icon: "🌐",
    description: "Webseiten öffnen, klicken, scrollen und mit Baddi steuern.",
    defaultWidth: 600,
    defaultHeight: 480,
    status: "active",
    canvasType: "browser_window",
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
    description: "Bilder anzeigen, zoomen und schwenken. Unterstützt URLs und Datei-Upload.",
    defaultWidth: 560,
    defaultHeight: 440,
    status: "active",
    canvasType: "image_viewer",
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
