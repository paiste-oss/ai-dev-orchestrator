"use client";

export type BillingCycle = "monatlich" | "jährlich" | "einmalig" | "nutzungsbasiert";
export type Currency = "CHF" | "USD" | "EUR";
export type Category = "api" | "abo" | "infrastruktur" | "entwicklung" | "sonstiges";

export type PaymentMethod = "kreditkarte" | "twint" | "rechnung" | "bar";

export interface CostEntry {
  id: string;
  name: string;
  provider: string;
  category: Category;
  billing_cycle: BillingCycle;
  amount_original: number;
  currency: Currency;
  amount_chf_monthly: number;
  url: string | null;
  notes: string | null;
  balance_chf: number | null;
  balance_updated_at: string | null;
  payment_method: PaymentMethod | null;
  card_last4: string | null;
  is_active: boolean;
}

export interface Revenue {
  total_monthly_chf: number;
  total_yearly_chf: number;
  paying_customers: number;
  free_customers: number;
  total_customers: number;
}

export interface LiveUsage {
  openai?: { total_usd: number; total_chf: number; period: string };
}

export const CATEGORIES: {
  key: Category;
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  { key: "api",           label: "APIs",          icon: "🔌", color: "text-blue-300",   bg: "bg-blue-950/40",   border: "border-blue-800/50" },
  { key: "abo",           label: "Abos",          icon: "📋", color: "text-violet-300", bg: "bg-violet-950/40", border: "border-violet-800/50" },
  { key: "infrastruktur", label: "Infrastruktur", icon: "🖥️", color: "text-cyan-300",   bg: "bg-cyan-950/40",   border: "border-cyan-800/50" },
  { key: "entwicklung",   label: "Entwicklung",   icon: "🛠️", color: "text-amber-300",  bg: "bg-amber-950/40",  border: "border-amber-800/50" },
  { key: "sonstiges",     label: "Sonstiges",     icon: "📦", color: "text-gray-300",   bg: "bg-gray-800/40",   border: "border-gray-700/50" },
];

// Richtwerte — Anzeige-Zwecke, keine exakte Buchführung
export const FX: Record<Currency, number> = { CHF: 1, USD: 0.90, EUR: 0.96 };

export function calcChfMonthly(amount: number, currency: Currency, cycle: BillingCycle): number {
  if (cycle === "nutzungsbasiert") return 0;
  const chf = amount * FX[currency];
  if (cycle === "jährlich") return Math.round((chf / 12) * 100) / 100;
  if (cycle === "einmalig") return 0;
  return Math.round(chf * 100) / 100;
}

export const BILLING_URLS: Record<string, string> = {
  "google":     "https://console.cloud.google.com/billing",
  "openai":     "https://platform.openai.com/settings/organization/billing/overview",
  "anthropic":  "https://console.anthropic.com/settings/billing",
  "cloudflare": "https://dash.cloudflare.com/?to=/:account/billing",
  "n8n":        "https://app.n8n.cloud/billing",
  "github":     "https://github.com/settings/billing",
};

export function billingUrl(entry: CostEntry): string | null {
  if (entry.url) return entry.url;
  return BILLING_URLS[entry.provider.toLowerCase()] ?? null;
}

export function chf(n: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 2 }).format(n);
}

export const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "kreditkarte", label: "Kreditkarte" },
  { key: "twint",       label: "Twint" },
  { key: "rechnung",    label: "Rechnung" },
  { key: "bar",         label: "Bar" },
];

export const EMPTY_FORM = (): Omit<CostEntry, "id" | "balance_updated_at"> => ({
  name: "", provider: "", category: "api", billing_cycle: "monatlich",
  amount_original: 0, currency: "CHF", amount_chf_monthly: 0,
  url: "", notes: "", balance_chf: null, payment_method: null, card_last4: null, is_active: true,
});
