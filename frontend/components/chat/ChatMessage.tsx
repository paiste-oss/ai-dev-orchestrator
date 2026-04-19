"use client";

import React from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import StockCard from "@/components/chat/StockCard";
import StockHistoryCard from "@/components/chat/StockHistoryCard";
import ImageGalleryCard from "@/components/chat/ImageGalleryCard";
import ActionButtonsCard from "@/components/chat/ActionButtonsCard";
import BrowserViewCard from "@/components/chat/BrowserViewCard";
import TransportBoardCard from "@/components/chat/TransportBoardCard";
import {
  Message, UiPrefs,
  StockData, StockHistoryData, ImageGalleryData,
  TransportBoardData, ActionButtonsData, BrowserViewData,
  OpenWindowData, ARTIFACT_RESPONSE_TYPES, ARTIFACT_META,
} from "@/lib/chat-types";
import { FONT_SIZES, FONT_FAMILIES, LINE_SPACINGS, ACCENT_COLORS, CHAT_WIDTHS, FONT_COLORS } from "@/hooks/useUiPrefs";

interface ChatMessageProps {
  msg: Message;
  uiPrefs: UiPrefs;
  copied: string | null;
  onCopy: (id: string, content: string) => void;
  hideRichContent?: boolean;
  onRemoveGeneratedImage?: (msgId: string) => void;
}

export default function ChatMessage({ msg, uiPrefs, copied, onCopy, hideRichContent = false, onRemoveGeneratedImage }: ChatMessageProps) {
  const [savedId, setSavedId]     = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [sharedId, setSharedId]   = React.useState<string | null>(null);

  async function handleSave(id: string, content: string) {
    setSaveError(null);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `Chat-Notiz ${date}.md`;
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/documents/save-from-chat`, {
        method: "POST",
        body: JSON.stringify({ content, filename }),
      });
      if (!res.ok) throw new Error();
      setSavedId(id);
      setTimeout(() => setSavedId(null), 3000);
    } catch {
      setSaveError(id);
      setTimeout(() => setSaveError(null), 3000);
    }
  }

  async function handleShare(id: string, content: string) {
    try {
      if (navigator.share) {
        await navigator.share({ text: content });
      } else {
        await navigator.clipboard.writeText(content);
      }
      setSharedId(id);
      setTimeout(() => setSharedId(null), 2500);
    } catch {
      // Nutzer hat Teilen abgebrochen
    }
  }

  const fontSize   = FONT_SIZES[uiPrefs.fontSize]     ?? "15px";
  const fontFamily = FONT_FAMILIES[uiPrefs.fontFamily] ?? FONT_FAMILIES.system;
  const lineHeight = LINE_SPACINGS[uiPrefs.lineSpacing] ?? "1.625";
  const accentBg   = ACCENT_COLORS[uiPrefs.accentColor] ?? "#6366f1";
  const fontColor  = FONT_COLORS[uiPrefs.fontColor]     ?? "#ffffff";
  const maxWidth   = CHAT_WIDTHS[uiPrefs.chatWidth]    ?? "75%";
  const ts = uiPrefs.showTimestamps ?? "hover";
  const tsClass = ts === "always" ? "opacity-100" : ts === "never" ? "hidden" : "opacity-0 group-hover:opacity-100 transition-opacity";

  return (
    <div className={`group flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>

      {msg.role === "user" ? (
        /* ── USER BUBBLE ── */
        <div className="flex flex-col items-end gap-1" style={{ maxWidth }}>
          {msg.images && msg.images.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              {msg.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="Anhang" className="rounded-2xl max-w-[200px] max-h-[200px] object-cover shadow-md" />
              ))}
            </div>
          )}
          {msg.content && (
            <div
              style={{ fontSize, fontFamily, lineHeight, background: accentBg }}
              className="text-white rounded-3xl px-4 py-2.5 whitespace-pre-wrap"
            >
              {msg.content}
            </div>
          )}
        </div>
      ) : (
        /* ── ASSISTANT MESSAGE ── */
        <div className="flex-1 min-w-0">
          {/* Name + timestamp */}
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-400">{uiPrefs.buddyName}</span>
            <span className={`text-xs text-gray-600 ${tsClass}`}>
              {new Date(msg.created_at).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Message content */}
          <div style={{ fontSize, fontFamily, lineHeight, color: fontColor }}>
            {msg.content === "__QUOTA_EXCEEDED__" ? (
              <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/8 px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⚠️</span>
                  <span className="font-bold text-base text-yellow-400">Guthaben aufgebraucht</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {(msg.structuredData as { message?: string })?.message ?? "Dein Kontingent und dein Wallet-Guthaben sind erschöpft."}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href="/user/billing"
                    className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-gray-900 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                  >
                    💳 Wallet aufladen
                  </a>
                  <a
                    href="/user/billing"
                    className="inline-flex items-center gap-2 bg-white/8 hover:bg-white/15 border border-white/15 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                  >
                    📋 Abo wechseln
                  </a>
                </div>
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={(url) => url}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-3 rounded-xl border border-white/10">
                      <table className="w-full text-sm border-collapse">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-white/6 border-b border-white/10">{children}</thead>
                  ),
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  tr: ({ children }) => (
                    <tr className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 text-gray-200 align-middle">{children}</td>
                  ),
                  p: ({ children }) => <p className="mb-2 last:mb-0" style={{ fontFamily, fontSize, lineHeight }}>{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold" style={{ color: fontColor }}>{children}</strong>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1" style={{ fontFamily, fontSize, lineHeight }}>{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1" style={{ fontFamily, fontSize, lineHeight }}>{children}</ol>,
                  li: ({ children }) => <li style={{ fontFamily, fontSize, lineHeight, color: fontColor }}>{children}</li>,
                  h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0" style={{ color: fontColor }}>{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold mb-1.5 mt-3 first:mt-0" style={{ color: fontColor }}>{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0" style={{ color: fontColor }}>{children}</h3>,
                  code: ({ children, className }) => {
                    const isBlock = className?.includes("language-");
                    if (isBlock) return <code className={className}>{children}</code>;
                    return <code className="bg-white/10 rounded px-1.5 py-0.5 text-[0.85em] font-mono text-indigo-200">{children}</code>;
                  },
                  pre: ({ children }) => {
                    const codeEl = (children as React.ReactElement<{ className?: string; children?: React.ReactNode }>)?.props;
                    const lang = codeEl?.className?.replace("language-", "") ?? "";
                    const codeText = codeEl?.children ?? "";
                    return (
                      <div className="my-3 rounded-xl overflow-hidden border border-white/10 bg-gray-950">
                        <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/8">
                          <span className="text-xs text-gray-500 font-mono">{lang || "code"}</span>
                          <button
                            onClick={() => { navigator.clipboard.writeText(String(codeText)); }}
                            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            Kopieren
                          </button>
                        </div>
                        <pre className="px-4 py-3 overflow-x-auto text-sm font-mono text-gray-300 leading-relaxed">
                          {children}
                        </pre>
                      </div>
                    );
                  },
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-indigo-500/50 pl-4 my-2 text-gray-400 italic">{children}</blockquote>
                  ),
                  a: ({ href, children }) => {
                    const url = href
                      ? href.startsWith("http") ? href : `https://${href}`
                      : null;
                    return (
                      <a
                        href={url ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors cursor-pointer"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (url) {
                            e.preventDefault();
                            window.open(url, "_blank", "noopener,noreferrer");
                          }
                        }}
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            )}
          </div>

          {/* DALL-E generated images — nur anzeigen wenn kein Artifact-Panel offen */}
          {!hideRichContent && msg.generatedImages && msg.generatedImages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {msg.generatedImages.map((src, i) => (
                <div key={i} className="relative group/genimg">
                  {onRemoveGeneratedImage && (
                    <button
                      onClick={() => onRemoveGeneratedImage(msg.id)}
                      title="Bild aus Chat entfernen"
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 border border-white/20 text-white flex items-center justify-center opacity-0 group-hover/genimg:opacity-100 transition-opacity text-sm z-10 cursor-pointer leading-none hover:bg-black/90"
                    >×</button>
                  )}
                  <a href={src} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt="Generiertes Bild"
                      className="rounded-2xl max-w-[280px] max-h-[280px] object-cover shadow-lg hover:scale-105 transition-transform cursor-pointer block"
                    />
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* Structured cards — nur anzeigen wenn kein Canvas-Fenster */}
          {!hideRichContent && msg.responseType === "stock_card" && msg.structuredData && (
            <StockCard data={msg.structuredData as StockData} />
          )}
          {!hideRichContent && msg.responseType === "stock_history" && msg.structuredData && (
            <StockHistoryCard data={msg.structuredData as StockHistoryData} />
          )}
          {!hideRichContent && msg.responseType === "image_gallery" && msg.structuredData && (
            <ImageGalleryCard data={msg.structuredData as ImageGalleryData} />
          )}
          {!hideRichContent && msg.responseType === "transport_board" && msg.structuredData && (
            <TransportBoardCard data={msg.structuredData as TransportBoardData} />
          )}
          {/* action_buttons immer anzeigen — auch auf Canvas */}
          {msg.responseType === "action_buttons" && msg.structuredData && (
            <ActionButtonsCard data={msg.structuredData as ActionButtonsData} />
          )}
          {!hideRichContent && msg.responseType === "browser_view" && msg.structuredData && (
            <BrowserViewCard data={msg.structuredData as BrowserViewData} />
          )}

          {/* Artifact badge — zeigt an, wenn Inhalt im Artifact-Panel ist */}
          {msg.role === "assistant" && msg.responseType && ARTIFACT_RESPONSE_TYPES.has(msg.responseType) && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500 bg-white/4 border border-white/8 rounded-lg px-2.5 py-1.5">
              <span>
                {msg.responseType === "open_window" && msg.structuredData
                  ? (ARTIFACT_META[(msg.structuredData as OpenWindowData).canvasType]?.icon ?? "🪟")
                  : (ARTIFACT_META[msg.responseType]?.icon ?? "🪟")}
              </span>
              <span>
                {msg.responseType === "open_window" && msg.structuredData
                  ? (ARTIFACT_META[(msg.structuredData as OpenWindowData).canvasType]?.label ?? "Fenster")
                  : (ARTIFACT_META[msg.responseType]?.label ?? "Artifact")}
              </span>
              <span className="text-gray-600">· im Artifact-Panel</span>
            </div>
          )}

          {/* Hover-Aktionen: Kopieren · Speichern · Teilen */}
          {msg.content !== "__QUOTA_EXCEEDED__" && (
            <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-3">

              {/* Kopieren */}
              <button
                onClick={() => onCopy(msg.id, msg.content)}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
              >
                {copied === msg.id ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-emerald-500">Kopiert</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Kopieren
                  </>
                )}
              </button>

              <span className="text-gray-800">·</span>

              {/* Speichern */}
              <button
                onClick={() => handleSave(msg.id, msg.content)}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
              >
                {savedId === msg.id ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-emerald-500">In Dokumente gespeichert</span>
                  </>
                ) : saveError === msg.id ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span className="text-red-400">Fehler</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Speichern
                  </>
                )}
              </button>

              <span className="text-gray-800">·</span>

              {/* Teilen */}
              <button
                onClick={() => handleShare(msg.id, msg.content)}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
              >
                {sharedId === msg.id ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-emerald-500">Geteilt</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                    Teilen
                  </>
                )}
              </button>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
