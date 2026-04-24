/**
 * Schriftfarbe-Berechnung für Kontrast auf beliebigem Hintergrund.
 *
 * Primärer Ansatz: CSS `color-contrast()` (noch experimentell, nicht in allen
 * Browsern). Fallback: YIQ-Formel in JavaScript.
 *
 * YIQ: Y = (R*299 + G*587 + B*114) / 1000.
 * Wenn Y > 128 → dunkler Hintergrund wirkt hell genug → dunkle Schrift.
 */

export function yiqTextColor(bgHex: string): "#ffffff" | "#111111" {
  const hex = bgHex.replace("#", "").trim();
  if (hex.length !== 3 && hex.length !== 6) return "#ffffff";
  const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  if ([r, g, b].some(v => Number.isNaN(v))) return "#ffffff";
  const y = (r * 299 + g * 587 + b * 114) / 1000;
  return y > 128 ? "#111111" : "#ffffff";
}

/**
 * Setzt die CSS Custom Properties auf :root:
 *   --page-bg           — aktuelle Hintergrundfarbe (für color-contrast())
 *   --auto-text-color   — Haupt-Textfarbe (#ffffff oder #111111, YIQ)
 *   --auto-text-muted   — gedämpfte Textfarbe (rgba mit 70% Alpha)
 *   --auto-text-subtle  — sehr dezent (rgba mit 45% Alpha)
 * Die globalen CSS-Regeln in globals.css überschreiben bei Browser-Support
 * automatisch mit color-contrast().
 */
export function applyAutoTextColor(bgHex: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const primary = yiqTextColor(bgHex);
  const mutedRgb = primary === "#ffffff" ? "255, 255, 255" : "17, 17, 17";
  root.style.setProperty("--page-bg", bgHex);
  root.style.setProperty("--auto-text-color", primary);
  root.style.setProperty("--auto-text-muted", `rgba(${mutedRgb}, 0.70)`);
  root.style.setProperty("--auto-text-subtle", `rgba(${mutedRgb}, 0.45)`);
  // Halb-transparenter Fill für Buttons/Chips die sonst `bg-white/5` nutzen
  root.style.setProperty("--auto-fill-soft", `rgba(${mutedRgb}, 0.06)`);
  root.style.setProperty("--auto-fill-hover", `rgba(${mutedRgb}, 0.12)`);
  root.style.setProperty("--auto-border-soft", `rgba(${mutedRgb}, 0.12)`);
}
