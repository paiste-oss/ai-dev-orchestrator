"use client";

/**
 * InvoiceModal — Admin-only: PDF-Rechnung hochladen, KI-Extraktion prüfen, in Dolibarr buchen.
 * Schritte: Upload → Extrahieren → Review → Buchen → Ergebnis
 */

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { apiFetch, apiFetchForm } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  desc: string;
  qty: number;
  unit_price: number;
  vat_rate: number;
}

interface ExtractedInvoice {
  supplier_name: string;
  supplier_address: string;
  supplier_zip: string;
  supplier_town: string;
  ref_supplier: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  vat_amount: number;
  currency: string;
  iban: string;
  note: string;
  lines: InvoiceLine[];
}

interface ExtractResponse {
  doc_id: string;
  extracted: ExtractedInvoice;
  raw_text_preview: string;
}

interface BookResponse {
  dolibarr_invoice_id: number;
  dolibarr_url: string;
  folder_id: string;
  supplier_socid: number;
}

type Step = "idle" | "uploading" | "extracting" | "review" | "booking" | "done" | "error";

interface Props {
  onClose: () => void;
}

// ── Field row helper ──────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--accent)]"
      />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoiceModal({ onClose }: Props) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [docId, setDocId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<ExtractedInvoice | null>(null);
  const [bookResult, setBookResult] = useState<BookResponse | null>(null);

  // ── Upload PDF → get doc_id ──────────────────────────────────────────────

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg(t("invoice.pdf_only"));
      return;
    }
    setStep("uploading");
    setErrorMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetchForm(`${BACKEND_URL}/v1/chat/upload-attachment`, fd);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { document_id: string };
      const id = data.document_id;
      setDocId(id);
      await runExtract(id);
    } catch (e) {
      setErrorMsg(`Upload fehlgeschlagen: ${e}`);
      setStep("error");
    }
  }

  // ── Extract ───────────────────────────────────────────────────────────────

  async function runExtract(id: string) {
    setStep("extracting");
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/invoices/extract`, {
        method: "POST",
        body: JSON.stringify({ doc_id: id }),
      });
      if (!res.ok) {
        const err = await res.json() as { detail?: string };
        throw new Error(err.detail ?? "Unbekannter Fehler");
      }
      const data = await res.json() as ExtractResponse;
      setInvoice(data.extracted);
      setStep("review");
    } catch (e) {
      setErrorMsg(`KI-Extraktion fehlgeschlagen: ${e}`);
      setStep("error");
    }
  }

  // ── Book ─────────────────────────────────────────────────────────────────

  async function handleBook() {
    if (!docId || !invoice) return;
    setStep("booking");
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/invoices/book`, {
        method: "POST",
        body: JSON.stringify({ doc_id: docId, invoice }),
      });
      if (!res.ok) {
        const err = await res.json() as { detail?: string };
        throw new Error(err.detail ?? "Unbekannter Fehler");
      }
      const data = await res.json() as BookResponse;
      setBookResult(data);
      setStep("done");
    } catch (e) {
      setErrorMsg(`Buchung fehlgeschlagen: ${e}`);
      setStep("error");
    }
  }

  function updateInv<K extends keyof ExtractedInvoice>(key: K, value: ExtractedInvoice[K]) {
    setInvoice((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-gray-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">{t("invoice.title")}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── IDLE: Drop / Select ──────────────────────────────────────── */}
          {step === "idle" && (
            <div
              className="border-2 border-dashed border-white/20 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-[var(--accent-50)] transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <span className="text-3xl">📄</span>
              <p className="text-sm text-gray-400 text-center">{t("invoice.drop_hint")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* ── LOADING states ───────────────────────────────────────────── */}
          {(step === "uploading" || step === "extracting" || step === "booking") && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">
                {step === "uploading" && t("invoice.uploading")}
                {step === "extracting" && t("invoice.extracting")}
                {step === "booking" && t("invoice.booking_state")}
              </p>
            </div>
          )}

          {/* ── REVIEW ───────────────────────────────────────────────────── */}
          {step === "review" && invoice && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--accent-light)] bg-[var(--accent-10)] border border-[var(--accent-20)] rounded-lg px-3 py-2">
                {t("invoice.review_hint")}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Field label={t("invoice.field_supplier")} value={invoice.supplier_name} onChange={(v) => updateInv("supplier_name", v)} />
                </div>
                <Field label={t("invoice.field_address")} value={invoice.supplier_address} onChange={(v) => updateInv("supplier_address", v)} />
                <Field label={t("invoice.field_zip")} value={invoice.supplier_zip} onChange={(v) => updateInv("supplier_zip", v)} />
                <Field label={t("invoice.field_city")} value={invoice.supplier_town} onChange={(v) => updateInv("supplier_town", v)} />
                <Field label={t("invoice.field_ref")} value={invoice.ref_supplier} onChange={(v) => updateInv("ref_supplier", v)} />
                <Field label={t("invoice.field_date")} value={invoice.invoice_date} onChange={(v) => updateInv("invoice_date", v)} />
                <Field label={t("invoice.field_due")} value={invoice.due_date ?? ""} onChange={(v) => updateInv("due_date", v || null)} />
                <Field label={t("invoice.field_amount")} value={String(invoice.total_amount)} onChange={(v) => updateInv("total_amount", parseFloat(v) || 0)} />
                <Field label={t("invoice.field_vat")} value={String(invoice.vat_amount)} onChange={(v) => updateInv("vat_amount", parseFloat(v) || 0)} />
                <div className="col-span-2">
                  <Field label={t("invoice.field_iban")} value={invoice.iban} onChange={(v) => updateInv("iban", v)} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">{t("invoice.field_note")}</label>
                  <textarea
                    value={invoice.note}
                    onChange={(e) => updateInv("note", e.target.value)}
                    rows={2}
                    className="w-full mt-0.5 bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--accent)] resize-none"
                  />
                </div>
              </div>

              {invoice.lines.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t("invoice.positions", { n: String(invoice.lines.length) })}</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {invoice.lines.map((ln, i) => (
                      <div key={i} className="text-xs text-gray-400 bg-gray-800/50 rounded-lg px-3 py-1.5 flex justify-between gap-2">
                        <span className="flex-1 truncate">{ln.desc}</span>
                        <span className="shrink-0">CHF {ln.unit_price.toFixed(2)} × {ln.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── DONE ─────────────────────────────────────────────────────── */}
          {step === "done" && bookResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-400">
                <span className="text-xl">✓</span>
                <p className="text-sm font-semibold">{t("invoice.success")}</p>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-300">
                  <span className="text-gray-500">{t("invoice.dolibarr_id")}</span>
                  <span>#{bookResult.dolibarr_invoice_id}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span className="text-gray-500">{t("invoice.supplier_id")}</span>
                  <span>#{bookResult.supplier_socid}</span>
                </div>
              </div>
              <a
                href={bookResult.dolibarr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center py-2.5 rounded-xl text-sm font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors"
              >
                {t("invoice.open_dolibarr")}
              </a>
              <p className="text-xs text-gray-500 text-center">{t("invoice.filed_in")}</p>
            </div>
          )}

          {/* ── ERROR ────────────────────────────────────────────────────── */}
          {step === "error" && (
            <div className="space-y-3">
              <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 text-sm text-red-400">
                {errorMsg}
              </div>
              <button
                onClick={() => { setStep("idle"); setErrorMsg(""); setDocId(null); setInvoice(null); }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                {t("invoice.retry")}
              </button>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {step === "review" && (
          <div className="px-5 py-4 border-t border-white/10 flex gap-3">
            <button
              onClick={() => { setStep("idle"); setDocId(null); setInvoice(null); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            >
              {t("invoice.cancel")}
            </button>
            <button
              onClick={handleBook}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors"
            >
              {t("invoice.book")}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="px-5 py-4 border-t border-white/10">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            >
              {t("invoice.close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
