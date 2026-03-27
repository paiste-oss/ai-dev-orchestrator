/** Formatiert Bytes als lesbare Größenangabe (B / KB / MB / GB). */
export function fmtBytes(b: number): string {
  if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

/** Formatiert ein ISO-Datum als Schweizer Datumsformat (dd.mm.yyyy). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

/** Formatiert ein ISO-Datum mit Uhrzeit (dd.mm.yyyy, HH:MM). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
