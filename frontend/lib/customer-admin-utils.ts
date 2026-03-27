"use client";

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface CustomerDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  memory_consent: boolean;
  created_at: string;
  birth_year: number | null;
  primary_usecase_id: string | null;
  phone: string | null;
  phone_secondary: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  address_country: string | null;
  language: string | null;
}

export interface CustomerStats {
  threads: number;
  messages: number;
  total_tokens: number;
  by_model: Record<string, { messages: number; tokens: number }>;
}

export interface ServiceField {
  key: string;
  label: string;
  placeholder: string;
  type: string;
}

export interface ServiceSchema {
  label: string;
  icon: string;
  fields: ServiceField[];
}

export interface WalletStatus {
  balance_chf: number;
  monthly_limit_chf: number;
  per_tx_limit_chf: number;
  monthly_spent_chf: number;
  monthly_remaining_chf: number;
  auto_topup_enabled: boolean;
  auto_topup_threshold_chf: number;
  auto_topup_amount_chf: number;
  has_saved_card: boolean;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_extra_bytes: number;
}

export interface ModelUsage {
  messages: number;
  tokens: number;
  cost_chf: number;
  type: "api" | "lokal";
  rate_per_1k: number;
}

export interface CustomerUsage {
  tokens: {
    total: number;
    this_period: number;
    by_model: Record<string, ModelUsage>;
    cost_chf_total: number;
  };
  messages: { total: number; threads: number };
  storage: {
    used_bytes: number;
    limit_bytes: number;
    plan_bytes: number;
    extra_bytes: number;
    documents: number;
  };
  memory: { entries: number };
  compute: { note: string; local_tokens: number; api_tokens: number };
}

export interface CustomerNote {
  id: string;
  text: string;
  created_at: string;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

export const LANGUAGE_OPTIONS = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
];

export const MODEL_DISPLAY: Record<string, string> = {
  "claude-sonnet-4-6":         "Claude Sonnet 4.6",
  "claude-opus-4-6":           "Claude Opus 4.6",
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
  "claude-haiku-4-5":          "Claude Haiku 4.5",
  "gemini-2.0-flash":          "Gemini 2.0 Flash",
  "gemini-1.5-flash":          "Gemini 1.5 Flash",
  "gemini-1.5-pro":            "Gemini 1.5 Pro",
  "gpt-4o":                    "GPT-4o",
  "gpt-4o-mini":               "GPT-4o Mini",
  "gemma3:12b":                "Gemma 3 12B (lokal)",
  "gemma3:4b":                 "Gemma 3 4B (lokal)",
  "mistral":                   "Mistral (lokal)",
  "llama3":                    "Llama 3 (lokal)",
  "unbekannt":                 "Unbekannt",
};

export { formatDate, fmtBytes } from "@/lib/format";

export const inputCls = "w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition-colors";
export const readCls = "bg-gray-700/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300";
