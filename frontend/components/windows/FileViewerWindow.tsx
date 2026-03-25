"use client";

interface Props {
  url: string;
  filename: string;
  fileType?: string;
}

const IMAGE_TYPES = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
const PDF_TYPE = "pdf";

export default function FileViewerWindow({ url, filename, fileType }: Props) {
  const ext = (fileType ?? filename.split(".").pop() ?? "").toLowerCase();
  const isImage = IMAGE_TYPES.includes(ext);
  const isPdf = ext === PDF_TYPE;

  if (isImage) {
    return (
      <div className="relative h-full w-full flex items-center justify-center bg-gray-950 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={filename}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  if (isPdf) {
    return (
      <iframe
        src={url}
        title={filename}
        className="w-full h-full border-none"
        style={{ display: "block" }}
      />
    );
  }

  // Andere Dateitypen — kein direkter Viewer
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <span className="text-5xl opacity-30">📎</span>
      <p className="text-white text-sm font-medium">{filename}</p>
      <p className="text-gray-500 text-xs">
        Vorschau für {ext.toUpperCase()} nicht verfügbar.<br />
        Der Inhalt wurde an Baddi weitergegeben.
      </p>
    </div>
  );
}
