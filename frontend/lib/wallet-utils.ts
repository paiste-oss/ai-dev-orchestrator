export function chf(n: number): string {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(n);
}

export function fmtBytes(b: number): string {
  if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH");
}
