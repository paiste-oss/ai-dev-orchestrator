"use client";

import { chf } from "@/components/admin/finanzen/types";
import type { LiveUsage } from "@/components/admin/finanzen/types";

interface Props {
  usage: LiveUsage | null;
}

export default function LiveUsageBanner({ usage }: Props) {
  if (!usage?.openai) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
          OpenAI Verbrauch {usage.openai.period}
        </p>
        <p className="text-lg font-bold text-green-400">
          ${usage.openai.total_usd.toFixed(4)}
          <span className="text-sm text-gray-500 font-normal ml-2">≈ {chf(usage.openai.total_chf)}</span>
        </p>
      </div>
      <div className="flex gap-3 text-xs">
        <a
          href="https://platform.openai.com/settings/organization/billing/overview"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg bg-blue-950/50 border border-blue-800/50 text-blue-400 hover:bg-blue-900/50 transition-colors"
        >
          OpenAI ↗
        </a>
        <a
          href="https://console.anthropic.com/settings/billing"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg bg-orange-950/50 border border-orange-800/50 text-orange-400 hover:bg-orange-900/50 transition-colors"
        >
          Anthropic ↗
        </a>
        <a
          href="https://console.cloud.google.com/billing"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg bg-blue-950/50 border border-blue-800/50 text-blue-400 hover:bg-blue-900/50 transition-colors"
        >
          Google ↗
        </a>
      </div>
    </div>
  );
}
