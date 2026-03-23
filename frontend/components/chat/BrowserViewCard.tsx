import React from "react";
import { BrowserViewData } from "@/lib/chat-types";

export default function BrowserViewCard({ data }: { data: BrowserViewData }) {
  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-gray-900/60">
      {/* URL-Leiste */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/80 border-b border-white/5">
        <div className="flex gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="flex-1 text-[11px] text-gray-400 font-mono truncate bg-gray-900/40 rounded px-2 py-0.5">
          {data.url || "…"}
        </span>
      </div>
      {/* Screenshot */}
      {data.error ? (
        <div className="px-4 py-6 text-sm text-red-400 text-center">{data.error}</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/jpeg;base64,${data.screenshot_b64}`}
          alt={`Screenshot von ${data.url}`}
          className="w-full block"
          style={{ maxHeight: 420, objectFit: "cover", objectPosition: "top" }}
        />
      )}
    </div>
  );
}
