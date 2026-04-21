"use client";

import { useState, useRef, useEffect } from "react";
import { useChatMessages } from "@/hooks/useChatMessages";
import ChatMessage from "@/components/chat/ChatMessage";
import AvatarCircle from "@/components/chat/AvatarCircle";
import { UiPrefs } from "@/lib/chat-types";
import { useT } from "@/lib/i18n";

interface Props {
  buddyName: string;
  buddyInitial: string;
  uiPrefs: UiPrefs;
  // called when a rich card response comes in (browser, stock, etc.)
  onRichContent?: (responseType: string, structuredData: unknown, msgId: string) => void;
}

export default function ChatCardContent({ buddyName, buddyInitial, uiPrefs, onRichContent }: Props) {
  const t = useT();
  const [localInput, setLocalInput] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, loading, sendMessage } = useChatMessages();

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Detect rich responses → propagate to canvas
  useEffect(() => {
    if (!onRichContent) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.structuredData) return;
    if (!last.responseType || last.responseType === "text") return;
    onRichContent(last.responseType, last.structuredData, last.id);
  }, [messages, onRichContent]);

  async function handleSend() {
    if (!localInput.trim() || loading) return;
    await sendMessage({
      input: localInput,
      attachedFiles: [],
      onUiUpdate: () => {},
      speak: () => {},
      stripMarkdown: (t) => t,
      onAfterSend: () => setLocalInput(""),
      onFilesChange: () => {},
      setSpeaking: () => {},
      focusTextarea: () => inputRef.current?.focus(),
    });
  }

  function handleCopy(id: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[70%] gap-3 text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, color-mix(in srgb, var(--accent) 60%, white), var(--accent))` }}>
              <span className="text-white font-bold text-sm">{buddyInitial}</span>
            </div>
            <p className="text-gray-500 text-xs">{t("chat.new_conversation")}</p>
          </div>
        )}
        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            msg={msg}
            uiPrefs={uiPrefs}
            copied={copied}
            onCopy={handleCopy}
          />
        ))}
        {loading && (
          <div className="flex gap-2 items-center">
            <AvatarCircle speaking={true} initial={buddyInitial} />
            <div className="flex gap-1 py-2">
              <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-white/5 p-2 flex gap-1.5">
        <input
          ref={inputRef}
          value={localInput}
          onChange={e => setLocalInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          className="flex-1 bg-white/5 border border-white/8 rounded-xl px-3 py-1.5 text-sm text-white outline-none focus:border-[var(--accent-40)] placeholder-gray-600"
          placeholder={t("chat.ask_placeholder", { name: buddyName })}
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !localInput.trim()}
          className="px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] text-sm font-medium disabled:opacity-40 transition-colors shrink-0"
        >
          →
        </button>
      </div>
    </div>
  );
}
