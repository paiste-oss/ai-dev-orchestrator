"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

export interface PdfMatchDetail {
  filename: string;
  status: "matched" | "already_has_pdf" | "unmatched";
  match_method: "doi" | "filename" | "title_text" | null;
  matched_title: string | null;
  entry_id: string | null;
}

export interface BulkPdfResult {
  matched: number;
  already_had_pdf: number;
  unmatched: number;
  details: PdfMatchDetail[];
}

export interface ZipProgress {
  phase: "uploading" | "processing";
  sent: number;
  total: number;
}

export interface ImportMessage {
  type: "ok" | "err";
  text: string;
}

interface Ctx {
  // ZIP Upload
  importingZip: boolean;
  zipProgress: ZipProgress | null;
  zipResult: BulkPdfResult | null;
  showZipDetails: boolean;
  setShowZipDetails: (v: boolean) => void;
  dismissZipResult: () => void;
  startZipImport: (file: File, translations: { network: string; generic: string }) => Promise<void>;

  // XML / RIS Import
  importingXml: boolean;
  startXmlImport: (file: File, translations: { network: string; generic: string }) => Promise<void>;

  // Import message (shared)
  importMsg: ImportMessage | null;
  setImportMsg: (m: ImportMessage | null) => void;

  // Reload key — Panels inkrementieren bei Mount und bekommen neue Werte
  reloadKey: number;
}

const LiteratureUploadContext = createContext<Ctx | null>(null);

const CHUNK_SIZE = 90 * 1024 * 1024;

export function LiteratureUploadProvider({ children }: { children: React.ReactNode }) {
  const [importingZip, setImportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null);
  const [zipResult, setZipResult] = useState<BulkPdfResult | null>(null);
  const [showZipDetails, setShowZipDetails] = useState(false);
  const [importingXml, setImportingXml] = useState(false);
  const [importMsg, setImportMsg] = useState<ImportMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Schutz gegen parallele Uploads
  const runningRef = useRef(false);

  const dismissZipResult = useCallback(() => {
    setZipResult(null);
    setShowZipDetails(false);
  }, []);

  const startZipImport = useCallback(async (file: File, t: { network: string; generic: string }) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setImportingZip(true);
    setZipResult(null);
    setImportMsg(null);

    try {
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const uploadId = crypto.randomUUID().replace(/-/g, "");

      setZipProgress({ phase: "uploading", sent: 0, total: totalChunks });

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));

        const fd = new FormData();
        fd.append("upload_id", uploadId);
        fd.append("chunk_index", String(i));
        fd.append("total_chunks", String(totalChunks));
        fd.append("chunk", chunk, "chunk.bin");

        const res = await apiFetchForm(`${BACKEND_URL}/v1/literature/import-pdfs/upload-chunk`, fd);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: t.generic })) as { detail?: string };
          throw new Error(err.detail || t.generic);
        }

        const chunkResult = await res.json() as { status: string };
        setZipProgress({ phase: "uploading", sent: i + 1, total: totalChunks });

        if (chunkResult.status === "processing") break;
      }

      setZipProgress({ phase: "processing", sent: totalChunks, total: totalChunks });

      const deadline = Date.now() + 45 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise<void>(resolve => setTimeout(resolve, 5000));

        const statusRes = await apiFetch(`${BACKEND_URL}/v1/literature/import-pdfs/status/${uploadId}`);
        if (!statusRes.ok) continue;

        const statusData = await statusRes.json() as { status: string; result?: BulkPdfResult; error?: string };

        if (statusData.status === "done" && statusData.result) {
          setZipResult(statusData.result);
          setShowZipDetails(true);
          setReloadKey(k => k + 1);
          return;
        }
        if (statusData.status === "error") {
          throw new Error(statusData.error || t.generic);
        }
      }
      throw new Error(t.generic);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setImportMsg({ type: "err", text: msg === "ERR_NETWORK" ? t.network : msg || t.generic });
    } finally {
      setImportingZip(false);
      setZipProgress(null);
      runningRef.current = false;
    }
  }, []);

  const startXmlImport = useCallback(async (file: File, t: { network: string; generic: string }) => {
    setImportingXml(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetchForm(`${BACKEND_URL}/v1/literature/import`, fd);
      const data = await res.json();
      if (res.ok) {
        setImportMsg({
          type: "ok",
          text: `${data.imported} Einträge importiert${data.skipped ? `, ${data.skipped} übersprungen` : ""}.`,
        });
        setReloadKey(k => k + 1);
      } else {
        setImportMsg({ type: "err", text: data.detail || t.generic });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setImportMsg({ type: "err", text: msg === "ERR_NETWORK" ? t.network : msg || t.generic });
    } finally {
      setImportingXml(false);
    }
  }, []);

  return (
    <LiteratureUploadContext.Provider
      value={{
        importingZip, zipProgress, zipResult, showZipDetails, setShowZipDetails,
        dismissZipResult, startZipImport,
        importingXml, startXmlImport,
        importMsg, setImportMsg,
        reloadKey,
      }}
    >
      {children}
    </LiteratureUploadContext.Provider>
  );
}

export function useLiteratureUpload(): Ctx {
  const ctx = useContext(LiteratureUploadContext);
  if (!ctx) throw new Error("useLiteratureUpload must be used within LiteratureUploadProvider");
  return ctx;
}
