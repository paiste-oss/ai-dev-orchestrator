"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import WindowFrame from "./WindowFrame";

interface Props {
  url: string;
  filename: string;
  fileType?: string;
  mimeType?: string;
  literatureEntryId?: string;
  literatureTitle?: string;
  documentEntryId?: string;
}

interface Tab {
  key: string;
  url: string;
  filename: string;
  fileType?: string;
  mimeType?: string;
  literatureEntryId?: string;
  documentEntryId?: string;
}

const IMAGE_TYPES = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
const AUDIO_TYPES = ["mp3", "m4a", "webm", "ogg", "wav", "aac", "opus"];
const TEXT_TYPES  = ["txt", "md", "log", "csv", "json", "xml", "html"];

function fileIcon(ext: string, mimeType: string | undefined): string {
  if (IMAGE_TYPES.includes(ext)) return "🖼";
  if (ext === "pdf") return "📄";
  if (AUDIO_TYPES.includes(ext) || (mimeType ?? "").startsWith("audio/")) return "🎙";
  if (TEXT_TYPES.includes(ext)) return "📝";
  return "📎";
}

export default function FileViewerWindow({ url, filename, fileType, mimeType, literatureEntryId, documentEntryId }: Props) {
  const t = useT();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Wenn neue Datei via Props ankommt: zu Tabs hinzufügen oder vorhandenen Tab updaten
  useEffect(() => {
    if (!url) return;
    const key = literatureEntryId || documentEntryId || url;
    setTabs(prev => {
      const idx = prev.findIndex(t => t.key === key);
      if (idx >= 0) {
        // Bestehender Eintrag — URL aktualisieren (z.B. neue Blob-URL)
        const next = [...prev];
        next[idx] = { ...next[idx], url, filename, fileType, mimeType, literatureEntryId, documentEntryId };
        return next;
      }
      return [...prev, { key, url, filename, fileType, mimeType, literatureEntryId, documentEntryId }];
    });
    setActiveKey(key);
  }, [url, filename, fileType, mimeType, literatureEntryId, documentEntryId]);

  const closeTab = useCallback((key: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.key === key);
      if (idx < 0) return prev;
      const closed = prev[idx];
      // Blob-URL freigeben
      if (closed.url.startsWith("blob:")) {
        try { URL.revokeObjectURL(closed.url); } catch { /* ignore */ }
      }
      const next = prev.filter(t => t.key !== key);
      // Wenn aktiver Tab geschlossen → auf Nachbar wechseln
      setActiveKey(currentActive => {
        if (currentActive !== key) return currentActive;
        return next[idx]?.key ?? next[idx - 1]?.key ?? next[0]?.key ?? null;
      });
      return next;
    });
  }, []);

  const active = tabs.find(t => t.key === activeKey) ?? tabs[0] ?? null;

  return (
    <WindowFrame noBackground>
      {tabs.length > 1 && (
        <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b window-border-soft overflow-x-auto scrollbar-hide bg-black/30">
          {tabs.map(tab => {
            const isActive = tab.key === activeKey;
            const ext = (tab.fileType ?? tab.filename.split(".").pop() ?? "").toLowerCase();
            return (
              <div key={tab.key}
                onClick={() => setActiveKey(tab.key)}
                className={`group shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md cursor-pointer text-xs select-none transition-colors ${
                  isActive ? "bg-white/15 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                title={tab.filename}>
                <span className="text-sm leading-none">{fileIcon(ext, tab.mimeType)}</span>
                <span className="truncate max-w-[140px]">{tab.filename}</span>
                <button onClick={e => { e.stopPropagation(); closeTab(tab.key); }}
                  className={`ml-1 w-3.5 h-3.5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 transition-all ${isActive ? "opacity-70" : "opacity-0 group-hover:opacity-70"}`}
                  title="Tab schliessen">×</button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden bg-gray-950">
        {active ? <FileContent tab={active} t={t} /> : (
          <div className="flex items-center justify-center h-full window-text-subtle text-xs">
            Keine Datei geöffnet
          </div>
        )}
      </div>
    </WindowFrame>
  );
}

function FileContent({ tab, t }: { tab: Tab; t: (key: string, vars?: Record<string, string>) => string }) {
  const ext = (tab.fileType ?? tab.filename.split(".").pop() ?? "").toLowerCase();
  const isImage = IMAGE_TYPES.includes(ext);
  const isPdf   = ext === "pdf";
  const isAudio = AUDIO_TYPES.includes(ext) || (tab.mimeType ?? "").startsWith("audio/");
  const isText  = TEXT_TYPES.includes(ext);

  if (isImage) {
    return (
      <div className="relative h-full w-full flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tab.url} alt={tab.filename} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }

  if (isPdf) {
    const pdfSrc = tab.url.includes("#") ? tab.url : `${tab.url}#view=FitH`;
    return <iframe src={pdfSrc} title={tab.filename} className="w-full h-full border-none" style={{ display: "block" }} />;
  }

  if (isAudio) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <span className="text-5xl">🎙</span>
        <p className="text-white text-sm font-medium text-center">{tab.filename}</p>
        <audio controls src={tab.url} className="w-full max-w-sm" style={{ accentColor: "#6366f1" }}>
          {t("fileview.no_audio")}
        </audio>
      </div>
    );
  }

  if (isText) {
    return (
      <iframe src={tab.url} title={tab.filename} className="w-full h-full border-none bg-white" style={{ display: "block" }} />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <span className="text-5xl opacity-30">📎</span>
      <p className="text-white text-sm font-medium">{tab.filename}</p>
      <p className="text-gray-400 text-xs">
        {t("fileview.no_preview", { ext: ext.toUpperCase() })}<br />
        {t("fileview.given_to_baddi")}
      </p>
      <a href={tab.url} download={tab.filename}
        className="text-xs text-[var(--accent-light)] hover:text-[var(--accent-hover)] underline underline-offset-2">
        {t("fileview.download")}
      </a>
    </div>
  );
}
