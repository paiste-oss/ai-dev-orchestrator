"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

export interface PdfMatchDetail {
  filename: string;
  status: "matched" | "already_has_pdf" | "unmatched" | "orphan";
  match_method: "doi" | "filename" | "title_text" | "llm_doi" | "llm_title" | "llm_author_year" | null;
  matched_title: string | null;
  entry_id: string | null;
  orphan_id?: string | null;
}

export interface BulkPdfResult {
  matched: number;
  already_had_pdf: number;
  unmatched: number;
  orphans?: number;
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
const PENDING_KEY = "baddi:lit_upload_pending";

// Default-Messages für Recovery (kein t() im Context verfügbar)
const RECOVERY_MESSAGES = {
  network: "Da scheint etwas schiefgelaufen zu sein — bitte prüfe deine Verbindung.",
  generic: "Etwas ist schiefgelaufen — bitte versuche es erneut.",
};

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

  // ── Status-Polling ──────────────────────────────────────────────────────────
  // Pollt den Backend-Status für eine laufende Verarbeitung. Wird sowohl vom
  // normalen Upload-Flow als auch vom Recovery-Flow nach Reload verwendet.
  const pollStatus = useCallback(async (uploadId: string, total: number, t: { network: string; generic: string }) => {
    setImportingZip(true);
    setZipProgress({ phase: "processing", sent: total || 1, total: total || 1 });

    const deadline = Date.now() + 45 * 60 * 1000;
    let consecutive404 = 0;
    try {
      while (Date.now() < deadline) {
        await new Promise<void>(resolve => setTimeout(resolve, 5000));
        const statusRes = await apiFetch(`${BACKEND_URL}/v1/literature/import-pdfs/status/${uploadId}`);

        // 404 = Upload-ID nicht (mehr) bekannt — kann zwei Gründe haben:
        //   a) Backend hatte noch nie diesen Status (sehr früh) → 1-2x normal
        //   b) Redis TTL abgelaufen ODER Background-Task crashte ohne Status zu schreiben
        if (statusRes.status === 404) {
          consecutive404++;
          if (consecutive404 >= 3) {
            // Aufgeben — Einträge neu laden, evtl. ist trotzdem etwas durchgekommen
            try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
            setReloadKey(k => k + 1);
            setImportMsg({
              type: "err",
              text: "Upload-Status nicht mehr abrufbar. Einträge wurden neu geladen — falls PDFs fehlen, bitte ZIP erneut hochladen.",
            });
            return;
          }
          continue;
        }
        consecutive404 = 0;
        if (!statusRes.ok) continue;

        const statusData = await statusRes.json() as { status: string; result?: BulkPdfResult; error?: string };

        if (statusData.status === "done" && statusData.result) {
          setZipResult(statusData.result);
          setShowZipDetails(true);
          setReloadKey(k => k + 1);
          setImportMsg(null);
          try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
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
      try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    }
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
          if (res.status === 429) {
            throw new Error("Upload-Rate zu hoch — bitte warte eine Minute und versuche es erneut.");
          }
          const err = await res.json().catch(() => ({ detail: t.generic })) as { detail?: string };
          throw new Error(err.detail || t.generic);
        }

        const chunkResult = await res.json() as { status: string };
        setZipProgress({ phase: "uploading", sent: i + 1, total: totalChunks });

        if (chunkResult.status === "processing") break;
      }

      // Alle Chunks hochgeladen → Verarbeitung läuft im Hintergrund beim Backend.
      // Ab hier ist Reload-Recovery möglich: upload_id persistieren.
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify({ upload_id: uploadId, total: totalChunks }));
      } catch { /* QuotaExceeded etc. — nicht kritisch */ }

      await pollStatus(uploadId, totalChunks, t);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setImportMsg({ type: "err", text: msg === "ERR_NETWORK" ? t.network : msg || t.generic });
      try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    } finally {
      setImportingZip(false);
      setZipProgress(null);
      runningRef.current = false;
    }
  }, [pollStatus]);

  // ── Reload-Recovery ─────────────────────────────────────────────────────────
  // Beim Mount: prüfe ob ein laufender Upload in der Processing-Phase war.
  // Falls ja → Status-Polling wieder aufnehmen. Der Backend-Job läuft
  // unabhängig weiter, der Chunk-Upload-State ist nicht recover­bar.
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { upload_id?: string; total?: number };
      if (!parsed.upload_id || runningRef.current) return;
      runningRef.current = true;
      setImportMsg({ type: "ok", text: "Upload wird fortgesetzt — Verarbeitung im Hintergrund läuft." });
      (async () => {
        await pollStatus(parsed.upload_id!, parsed.total ?? 0, RECOVERY_MESSAGES);
        if (!cancelled) {
          setImportingZip(false);
          setZipProgress(null);
          runningRef.current = false;
        }
      })();
    } catch {
      try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    }
    return () => { cancelled = true; };
  }, [pollStatus]);

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
  if (!ctx) throw new Error("useLiteratureUpload must be used within LiteraturePanel");
  return ctx;
}
