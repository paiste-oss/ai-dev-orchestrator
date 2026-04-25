"use client";

import { useT } from "@/lib/i18n";
import WindowFrame from "./WindowFrame";

interface Props {
  url: string;
  filename: string;
  fileType?: string;
  mimeType?: string;
}

const IMAGE_TYPES = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
const AUDIO_TYPES = ["mp3", "m4a", "webm", "ogg", "wav", "aac", "opus"];
const TEXT_TYPES  = ["txt", "md", "log", "csv", "json", "xml", "html"];

export default function FileViewerWindow({ url, filename, fileType, mimeType }: Props) {
  const t = useT();
  const ext = (fileType ?? filename.split(".").pop() ?? "").toLowerCase();
  const isImage = IMAGE_TYPES.includes(ext);
  const isPdf   = ext === "pdf";
  const isAudio = AUDIO_TYPES.includes(ext) || (mimeType ?? "").startsWith("audio/");
  const isText  = TEXT_TYPES.includes(ext);

  if (isImage) {
    return (
      <div className="relative h-full w-full flex items-center justify-center bg-gray-950 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={filename} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }

  if (isPdf) {
    // PDF-Open-Parameter: view=FitH passt automatisch an die Fenster-Breite an
    const pdfSrc = url.includes("#") ? url : `${url}#view=FitH`;
    return <iframe src={pdfSrc} title={filename} className="w-full h-full border-none" style={{ display: "block" }} />;
  }

  if (isAudio) {
    return (
      <WindowFrame>
        <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
          <span className="text-5xl">🎙</span>
          <p className="window-text text-sm font-medium text-center">{filename}</p>
          <audio controls src={url} className="w-full max-w-sm" style={{ accentColor: "#6366f1" }}>
            {t("fileview.no_audio")}
          </audio>
        </div>
      </WindowFrame>
    );
  }

  if (isText) {
    return (
      <iframe
        src={url}
        title={filename}
        className="w-full h-full border-none bg-white"
        style={{ display: "block" }}
      />
    );
  }

  return (
    <WindowFrame>
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <span className="text-5xl opacity-30">📎</span>
        <p className="window-text text-sm font-medium">{filename}</p>
        <p className="window-text-muted text-xs">
          {t("fileview.no_preview", { ext: ext.toUpperCase() })}<br />
          {t("fileview.given_to_baddi")}
        </p>
        <a href={url} download={filename}
          className="text-xs text-[var(--accent-light)] hover:text-[var(--accent-hover)] underline underline-offset-2">
          {t("fileview.download")}
        </a>
      </div>
    </WindowFrame>
  );
}
