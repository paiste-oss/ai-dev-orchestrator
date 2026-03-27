export function chf(n: number): string {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(n);
}

export { fmtBytes, formatDate } from "@/lib/format";
