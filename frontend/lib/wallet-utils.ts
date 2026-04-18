export function chf(n: number): string {
  if (Number.isInteger(n)) return `CHF ${n}.-`;
  return `CHF ${n.toFixed(2).replace(/\.00$/, ".-")}`;
}

export { fmtBytes, formatDate } from "@/lib/format";
