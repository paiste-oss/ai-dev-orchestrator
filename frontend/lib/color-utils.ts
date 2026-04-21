/**
 * Farb-Utilities für das dynamische Farbsystem.
 * Wird von useUiPrefs genutzt um CSS-Variablen zu berechnen.
 */

/** Wandelt Hex-String (#rrggbb) in [r, g, b] um. */
export function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [99, 102, 241]; // indigo fallback
  return [r, g, b];
}

/** Relativer Luminanzwert nach WCAG 2.1. */
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Gibt '#ffffff' oder '#111111' zurück — je nachdem welche Farbe
 * auf dem gegebenen Hintergrund den besseren Kontrast hat (WCAG AA).
 */
export function getContrastColor(hex: string): string {
  try {
    const [r, g, b] = hexToRgb(hex);
    return relativeLuminance(r, g, b) > 0.179 ? "#111111" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

/** Hex + Alpha → rgba()-String. */
export function hexToRgba(hex: string, alpha: number): string {
  try {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch {
    return `rgba(99,102,241,${alpha})`;
  }
}

/**
 * Setzt alle Farb-CSS-Variablen auf document.documentElement.
 * Wird von useUiPrefs aufgerufen wenn sich accentColor oder background ändern.
 */
export function applyColorVars(accentHex: string, bgHex: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const [ar, ag, ab] = hexToRgb(accentHex);
  const [br, bg_, bb] = hexToRgb(bgHex);

  // Akzentfarbe
  root.style.setProperty("--accent",      accentHex);
  root.style.setProperty("--accent-rgb",  `${ar},${ag},${ab}`);
  root.style.setProperty("--accent-text", getContrastColor(accentHex));
  root.style.setProperty("--accent-5",    hexToRgba(accentHex, 0.05));
  root.style.setProperty("--accent-10",   hexToRgba(accentHex, 0.10));
  root.style.setProperty("--accent-15",   hexToRgba(accentHex, 0.15));
  root.style.setProperty("--accent-20",   hexToRgba(accentHex, 0.20));
  root.style.setProperty("--accent-30",   hexToRgba(accentHex, 0.30));
  root.style.setProperty("--accent-40",   hexToRgba(accentHex, 0.40));
  root.style.setProperty("--accent-50",   hexToRgba(accentHex, 0.50));
  root.style.setProperty("--accent-80",   hexToRgba(accentHex, 0.80));

  // Hintergrundfarbe & Oberflächen (60/30/10-Regel)
  root.style.setProperty("--bg",          bgHex);
  root.style.setProperty("--bg-rgb",      `${br},${bg_},${bb}`);
  root.style.setProperty("--bg-text",     getContrastColor(bgHex));

  // Sekundärfarbe (30%) — leicht heller als der Hintergrund
  // Für sehr dunkle Hintergründe: mix mit weiss; für helle: mix mit schwarz
  const bgLum = relativeLuminance(br, bg_, bb);
  const surfaceMixRatio = bgLum < 0.05 ? 0.12 : 0.08; // dunkler BG → stärkere Aufhellung
  const sr = Math.round(Math.min(255, br + 255 * surfaceMixRatio));
  const sg = Math.round(Math.min(255, bg_ + 255 * surfaceMixRatio));
  const sb = Math.round(Math.min(255, bb + 255 * surfaceMixRatio));
  root.style.setProperty("--surface",     `rgb(${sr},${sg},${sb})`);
  root.style.setProperty("--surface-2",   `rgb(${Math.round(Math.min(255, sr + 12))},${Math.round(Math.min(255, sg + 12))},${Math.round(Math.min(255, sb + 12))})`);
  root.style.setProperty("--surface-text", getContrastColor(`#${sr.toString(16).padStart(2,"0")}${sg.toString(16).padStart(2,"0")}${sb.toString(16).padStart(2,"0")}`));
}
