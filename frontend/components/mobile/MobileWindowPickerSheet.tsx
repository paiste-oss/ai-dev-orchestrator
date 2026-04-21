"use client";

import { useEffect } from "react";
import { WINDOW_MODULES } from "@/lib/window-registry";
import { useT } from "@/lib/i18n";

interface MobileWindowPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (canvasType: string) => void;
}

export default function MobileWindowPickerSheet({ open, onClose, onSelect }: MobileWindowPickerSheetProps) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const available = WINDOW_MODULES.filter(m => m.status !== "coming_soon" && m.status !== "hidden");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9990]"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-[9991] rounded-t-2xl border-t border-white/10"
        style={{ background: "rgba(10,14,28,0.98)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2">
          {t("chat.add_window")}
        </p>

        <div className="grid grid-cols-3 gap-2.5 px-4 pb-4">
          {available.map(mod => (
            <button
              key={mod.id}
              onClick={() => { onSelect(mod.canvasType); onClose(); }}
              className="flex flex-col items-center gap-2 p-3.5 rounded-xl bg-white/5 active:bg-white/10 border border-white/8 transition-colors"
            >
              <span className="text-2xl leading-none">{mod.icon}</span>
              <span className="text-[11px] text-gray-300 text-center leading-tight">
                {(() => { const k = `window.${mod.canvasType}.label`; const v = t(k); return v !== k ? v : mod.label; })()}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
