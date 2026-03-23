import React from "react";
import { ActionButtonsData } from "@/lib/chat-types";

export default function ActionButtonsCard({ data }: { data: ActionButtonsData }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {data.buttons.map((btn, i) => (
        <a
          key={i}
          href={btn.url}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-md shadow-indigo-900/30"
        >
          {btn.label} →
        </a>
      ))}
    </div>
  );
}
