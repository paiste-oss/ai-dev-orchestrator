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
 * Setzt die CSS Custom Properties --page-bg und --auto-text-color auf :root.
 * Diese werden vom globalen CSS verwendet — `color-contrast()` bevorzugt,
 * sonst YIQ-Wert.
 */
export function applyAutoTextColor(bgHex: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--page-bg", bgHex);
  root.style.setProperty("--auto-text-color", yiqTextColor(bgHex));
}
