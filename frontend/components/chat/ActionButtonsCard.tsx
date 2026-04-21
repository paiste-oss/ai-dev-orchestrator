import React from "react";
import { ActionButtonsData } from "@/lib/chat-types";

export default function ActionButtonsCard({ data }: { data: ActionButtonsData }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {data.buttons.map((btn, i) => (
        <a
          key={i}
          href={btn.url}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] text-sm font-medium transition-colors shadow-md shadow-black/30"
        >
          {btn.label} →
        </a>
      ))}
    </div>
  );
}
