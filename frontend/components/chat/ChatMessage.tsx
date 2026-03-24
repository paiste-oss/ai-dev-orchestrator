"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import AvatarCircle from "@/components/chat/AvatarCircle";
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
} from "@/lib/chat-types";

const FONT_SIZES: Record<string, string> = {
  small: "13px", normal: "15px", large: "18px", xlarge: "21px",
};
const FONT_FAMILIES: Record<string, string> = {
  system:  '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
  mono:    '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  rounded: '"Nunito", "Varela Round", "Quicksand", sans-serif',
  serif:   'Georgia, "Times New Roman", serif',
};
const LINE_SPACINGS: Record<string, string> = {
  compact: "1.4", normal: "1.625", wide: "2",
};
const ACCENT_COLORS: Record<string, string> = {
  indigo: "#6366f1", purple: "#a855f7", green: "#22c55e", orange: "#f97316", pink: "#ec4899",
};

interface ChatMessageProps {
  msg: Message;
  uiPrefs: UiPrefs;
  copied: string | null;
  onCopy: (id: string, content: string) => void;
  buddyInitial: string;
  hideRichContent?: boolean;
}

export default function ChatMessage({ msg, uiPrefs, copied, onCopy, buddyInitial, hideRichContent = false }: ChatMessageProps) {
  const fontSize   = FONT_SIZES[uiPrefs.fontSize]     ?? "15px";
  const fontFamily = FONT_FAMILIES[uiPrefs.fontFamily] ?? FONT_FAMILIES.system;
  const lineHeight = LINE_SPACINGS[uiPrefs.lineSpacing] ?? "1.625";
  const accentBg   = ACCENT_COLORS[uiPrefs.accentColor] ?? "#6366f1";

  return (
    <div className={`group flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      {/* Assistant avatar */}
      {msg.role === "assistant" && (
        <div className="shrink-0 mt-0.5">
          <AvatarCircle speaking={false} initial={buddyInitial} />
        </div>
      )}

      {msg.role === "user" ? (
        /* ── USER BUBBLE ── */
        <div className="flex flex-col items-end gap-1 max-w-[75%]">
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
            <span className="text-xs text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
              {new Date(msg.created_at).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Message content */}
          <div style={{ fontSize, fontFamily, lineHeight }} className="text-gray-100">
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
                    href="/user/wallet"
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
                urlTransform={(url) => url}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="text-gray-200">{children}</li>,
                  h1: ({ children }) => <h1 className="text-lg font-bold text-white mb-2 mt-4 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold text-white mb-1.5 mt-3 first:mt-0">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-white mb-1 mt-2 first:mt-0">{children}</h3>,
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

          {/* DALL-E generated images — nur anzeigen wenn kein Canvas-Fenster */}
          {!hideRichContent && msg.generatedImages && msg.generatedImages.length > 0 && !msg.structuredData && (
            <div className="mt-3 flex flex-wrap gap-3">
              {msg.generatedImages.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt="Generiertes Bild"
                    className="rounded-2xl max-w-[280px] max-h-[280px] object-cover shadow-lg hover:scale-105 transition-transform cursor-pointer"
                  />
                </a>
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

          {/* Copy button (appears on group-hover) */}
          {msg.content !== "__QUOTA_EXCEEDED__" && (
            <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
