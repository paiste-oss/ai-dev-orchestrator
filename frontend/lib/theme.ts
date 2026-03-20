export type ThemeId = "nacht" | "indigo" | "aurora" | "rose" | "slate";

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  // Vorschau-Farben für die Design-Seite
  preview: {
    bg: string;
    sidebar: string;
    surface: string;
    accent: string;
    accentText: string;
    text: string;
    subtext: string;
    border: string;
  };
}

export const THEMES: Theme[] = [
  {
    id: "nacht",
    name: "Nacht",
    description: "Dunkel & warm — das Standard-Layout mit gelbem Akzent",
    preview: {
      bg:          "#030712",
      sidebar:     "#111827",
      surface:     "#111827",
      accent:      "#eab308",
      accentText:  "#facc15",
      text:        "#f9fafb",
      subtext:     "#6b7280",
      border:      "rgba(255,255,255,0.06)",
    },
  },
  {
    id: "indigo",
    name: "Indigo",
    description: "Kühl & professionell — Blau-violetter Akzent",
    preview: {
      bg:          "#0a0a1a",
      sidebar:     "#0f0f2e",
      surface:     "#13132b",
      accent:      "#6366f1",
      accentText:  "#818cf8",
      text:        "#f1f5f9",
      subtext:     "#64748b",
      border:      "rgba(99,102,241,0.12)",
    },
  },
  {
    id: "aurora",
    name: "Aurora",
    description: "Frisch & klar — Türkis-grüner Akzent",
    preview: {
      bg:          "#020f0e",
      sidebar:     "#071a17",
      surface:     "#0c2320",
      accent:      "#14b8a6",
      accentText:  "#2dd4bf",
      text:        "#ecfdf5",
      subtext:     "#6b7280",
      border:      "rgba(20,184,166,0.12)",
    },
  },
  {
    id: "rose",
    name: "Rose",
    description: "Warm & lebendig — Rosa-roter Akzent",
    preview: {
      bg:          "#0f0a0c",
      sidebar:     "#1a0d12",
      surface:     "#1f1017",
      accent:      "#f43f5e",
      accentText:  "#fb7185",
      text:        "#fff1f2",
      subtext:     "#9f7c84",
      border:      "rgba(244,63,94,0.12)",
    },
  },
  {
    id: "slate",
    name: "Slate",
    description: "Minimalistisch & neutral — Grauer Silber-Akzent",
    preview: {
      bg:          "#080c10",
      sidebar:     "#0f1419",
      surface:     "#141c25",
      accent:      "#94a3b8",
      accentText:  "#cbd5e1",
      text:        "#f8fafc",
      subtext:     "#64748b",
      border:      "rgba(148,163,184,0.1)",
    },
  },
];

export const THEME_STORAGE_KEY = "baddi-admin-theme";

export function getSavedTheme(): ThemeId {
  if (typeof window === "undefined") return "nacht";
  return (localStorage.getItem(THEME_STORAGE_KEY) as ThemeId) ?? "nacht";
}

export function saveTheme(id: ThemeId): void {
  localStorage.setItem(THEME_STORAGE_KEY, id);
  document.documentElement.setAttribute("data-theme", id);
}
