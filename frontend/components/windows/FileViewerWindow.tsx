"use client";

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
    return <iframe src={url} title={filename} className="w-full h-full border-none" style={{ display: "block" }} />;
  }

  if (isAudio) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <span className="text-5xl">🎙</span>
        <p className="text-white text-sm font-medium text-center">{filename}</p>
        <audio controls src={url} className="w-full max-w-sm" style={{ accentColor: "#6366f1" }}>
          Dein Browser unterstützt kein Audio.
        </audio>
      </div>
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
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <span className="text-5xl opacity-30">📎</span>
      <p className="text-white text-sm font-medium">{filename}</p>
      <p className="text-gray-500 text-xs">
        Vorschau für {ext.toUpperCase()} nicht verfügbar.<br />
        Der Inhalt wurde an Baddi weitergegeben.
      </p>
      <a href={url} download={filename}
        className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
        Herunterladen
      </a>
    </div>
  );
}
