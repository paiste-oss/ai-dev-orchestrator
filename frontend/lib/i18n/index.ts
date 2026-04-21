"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { createElement } from "react";
import de from "./de.json";
import en from "./en.json";
import fr from "./fr.json";
import it from "./it.json";
import gsw from "./gsw.json";

type Locale = typeof de;
type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

const LOCALES: Record<string, Locale> = { de, en, fr, it, gsw };

function resolve(obj: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function getT(lang?: string): TranslateFn {
  const locale = LOCALES[lang ?? "de"] ?? de;
  const fallback = de as unknown as Record<string, unknown>;
  const src = locale as unknown as Record<string, unknown>;

  return function t(key: string, vars?: Record<string, string | number>): string {
    const val = resolve(src, key) ?? resolve(fallback, key) ?? key;
    if (!vars) return val;
    return val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
  };
}

const TranslationContext = createContext<TranslateFn>((key) => key);

export function TranslationProvider({ lang, children }: { lang?: string; children: ReactNode }) {
  const t = useMemo(() => getT(lang), [lang]);
  return createElement(TranslationContext.Provider, { value: t }, children);
}

export function useT(): TranslateFn {
  return useContext(TranslationContext);
}
