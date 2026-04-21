"use client";

import { useState, useRef, useCallback, DragEvent } from "react";
import { fmtBytes as formatBytes } from "@/lib/format";

// Erlaubte Dateitypen (sync mit Backend)
const ACCEPTED_EXTENSIONS = [
  "pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt",
  "csv", "txt", "md", "json", "xml", "html", "htm", "log",
  "jpg", "jpeg", "png", "gif", "webp",
];

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/csv",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/xml",
  "application/xml",
  "text/html",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const FILE_TYPE_ICONS: Record<string, string> = {
  pdf:  "📄",
  docx: "📝", doc: "📝",
  xlsx: "📊", xls: "📊",
  pptx: "📑", ppt: "📑",
  csv:  "📋",
  txt:  "📃", md: "📃", log: "📃",
  json: "🔧", xml: "🔧",
  html: "🌐", htm: "🌐",
  jpg: "🖼", jpeg: "🖼", png: "🖼", gif: "🖼", webp: "🖼",
};

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function getFileIcon(filename: string): string {
  return FILE_TYPE_ICONS[getExtension(filename)] ?? "📎";
}

function isValidFile(file: File): boolean {
  const ext = getExtension(file.name);
  return ACCEPTED_EXTENSIONS.includes(ext) || ACCEPTED_MIME_TYPES.includes(file.type);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AttachedFile {
  file: File;
  id: string;
  preview?: string;
  status?: "uploading" | "done" | "error";
}

interface FileDropZoneProps {
  files: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
  maxFiles?: number;
  className?: string;
  compact?: boolean; // Kompakte Ansicht für den Chat-Input-Bereich
}

// ─── Komponente ───────────────────────────────────────────────────────────────

export default function FileDropZone({
  files,
  onFilesChange,
  maxFiles = 5,
  className = "",
  compact = false,
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      setError(null);
      const fileArray = Array.from(newFiles);
      const validFiles: AttachedFile[] = [];
      const errors: string[] = [];

      for (const file of fileArray) {
        if (!isValidFile(file)) {
          errors.push(`"${file.name}" ist kein unterstützter Dateityp.`);
          continue;
        }
        if (file.size > 50 * 1024 * 1024) {
          errors.push(`"${file.name}" ist zu groß (max. 50 MB).`);
          continue;
        }
        if (files.length + validFiles.length >= maxFiles) {
          errors.push(`Maximal ${maxFiles} Dateien erlaubt.`);
          break;
        }
        validFiles.push({ file, id: `${Date.now()}-${Math.random()}` });
      }

      if (errors.length > 0) setError(errors[0]);
      if (validFiles.length > 0) onFilesChange([...files, ...validFiles]);
    },
    [files, maxFiles, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const removeFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id));
    setError(null);
  };

  // Kompakte Ansicht: nur Datei-Chips + Drop-Indikator (für Chat-Input)
  if (compact) {
    return (
      <div className={`${className}`}>
        {/* Drag-Overlay für den gesamten umgebenden Bereich */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`transition-all duration-150 ${
            isDragOver
              ? "ring-2 ring-blue-400 ring-inset rounded-xl bg-blue-950/30"
              : ""
          }`}
        >
          {/* Datei-Chips */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-2">
              {files.map((af) => {
                const isImage = af.file.type.startsWith("image/");
                const isUploading = af.status === "uploading";
                const isError = af.status === "error";
                return (
                <div
                  key={af.id}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-white max-w-[200px] border transition-colors ${
                    isError
                      ? "bg-red-500/15 border-red-500/40"
                      : isUploading
                      ? "bg-[var(--accent-15)] border-[var(--accent-30)]"
                      : "bg-white/10 border-white/20"
                  }`}
                >
                  {isUploading ? (
                    <svg className="w-4 h-4 shrink-0 text-[var(--accent-light)] animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                    </svg>
                  ) : isError ? (
                    <span className="text-base leading-none">⚠️</span>
                  ) : isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={URL.createObjectURL(af.file)}
                      alt={af.file.name}
                      className="w-8 h-8 rounded object-cover shrink-0"
                    />
                  ) : (
                    <span className="text-base leading-none">{getFileIcon(af.file.name)}</span>
                  )}
                  <span className="truncate max-w-[120px]">
                    {isUploading ? "Wird hochgeladen…" : isError ? "Fehler" : af.file.name}
                  </span>
                  {!isUploading && (
                    <>
                      {!isError && <span className="text-gray-400 shrink-0">{formatBytes(af.file.size)}</span>}
                      <button
                        onClick={() => removeFile(af.id)}
                        className="text-gray-400 hover:text-red-400 transition-colors ml-1 shrink-0"
                        title="Entfernen"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              )})}
            </div>
          )}

          {/* Drop-Hinweis wenn aktiv */}
          {isDragOver && (
            <div className="text-center text-blue-300 text-xs py-2 pointer-events-none">
              📎 Datei hier ablegen
            </div>
          )}

          {/* Fehler */}
          {error && (
            <p className="text-red-400 text-xs px-3 pt-1">{error}</p>
          )}
        </div>

        {/* Versteckter File-Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>
    );
  }

  // Vollständige Drag-Drop-Zone (für Upload-Seiten)
  return (
    <div className={`space-y-3 ${className}`}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
          transition-all duration-200 select-none
          ${isDragOver
            ? "border-blue-400 bg-blue-950/40 scale-[1.01]"
            : "border-gray-600 hover:border-gray-400 bg-black/20 hover:bg-black/30"
          }
        `}
      >
        <div className="space-y-3 pointer-events-none">
          <div className="text-4xl">
            {isDragOver ? "📂" : "📎"}
          </div>
          <div>
            <p className="text-white font-medium">
              {isDragOver ? "Datei jetzt ablegen!" : "Dateien hier ablegen"}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              oder klicken zum Auswählen
            </p>
          </div>
          <p className="text-gray-500 text-xs">
            PDF, Word, Excel, PowerPoint, CSV, TXT und mehr · max. 50 MB
          </p>
        </div>
      </div>

      {/* Fehler */}
      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-xl px-4 py-2">
          <p className="text-red-300 text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Datei-Liste */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((af) => (
            <div
              key={af.id}
              className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
            >
              <span className="text-2xl shrink-0">{getFileIcon(af.file.name)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{af.file.name}</p>
                <p className="text-gray-400 text-xs">
                  {getExtension(af.file.name).toUpperCase()} · {formatBytes(af.file.size)}
                </p>
              </div>
              <button
                onClick={() => removeFile(af.id)}
                className="text-gray-500 hover:text-red-400 transition-colors text-lg shrink-0 px-1"
                title="Entfernen"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
        onChange={(e) => e.target.files && addFiles(e.target.files)}
      />
    </div>
  );
}

// Exportiere den Typ für andere Komponenten
export type { AttachedFile };
