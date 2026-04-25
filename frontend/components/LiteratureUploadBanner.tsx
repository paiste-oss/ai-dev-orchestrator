"use client";

import { useLiteratureUpload } from "@/lib/literature-upload-context";

/**
 * Schwebendes Banner oben rechts — zeigt den Fortschritt eines laufenden
 * Literatur-ZIP-Uploads auch dann, wenn das Literatur-Fenster gar nicht
 * aktiv ist. Verschwindet automatisch wenn kein Upload läuft.
 */
export default function LiteratureUploadBanner() {
  const { importingZip, zipProgress } = useLiteratureUpload();

  if (!importingZip || !zipProgress) return null;

  const progress = zipProgress.phase === "uploading"
    ? Math.round((zipProgress.sent / Math.max(1, zipProgress.total)) * 100)
    : null;
  const label = zipProgress.phase === "uploading"
    ? `PDFs werden hochgeladen — ${progress}%`
    : "PDFs werden verarbeitet…";

  return (
    <div className="fixed top-16 right-4 z-40 bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl px-4 py-2.5 flex items-center gap-3 min-w-[220px] pointer-events-none">
      <div className="flex items-center gap-1 shrink-0">
        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
        <span className="text-lg">📚</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white font-medium truncate">{label}</div>
        {progress !== null && (
          <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {zipProgress.phase === "processing" && (
          <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-indigo-500 animate-pulse" style={{ marginLeft: "33%" }} />
          </div>
        )}
      </div>
    </div>
  );
}
