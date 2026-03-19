"use client";

/**
 * AvatarCreatorModal
 * ------------------
 * Öffnet den Ready Player Me Avatar-Editor in einem Iframe.
 * Sobald der User seinen Avatar fertiggestellt hat, sendet RPM eine
 * postMessage mit der .glb-URL. Diese URL wird gespeichert (nicht der Download).
 *
 * Subdomain: demo.readyplayer.me  (für Produktion eigene RPM-App erstellen)
 */

import { useEffect, useRef, useState } from "react";

const RPM_SUBDOMAIN = "demo";
const RPM_URL = `https://${RPM_SUBDOMAIN}.readyplayer.me/avatar?frameApi&bodyType=fullbody`;

interface Props {
  buddyName: string;
  onSave: (avatarUrl: string) => void;
  onClose: () => void;
}

export default function AvatarCreatorModal({ buddyName, onSave, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "done">("loading");

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.source !== "readyplayerme") return;

        if (msg.eventName === "v1.frame.ready") {
          // Iframe ist geladen — Events abonnieren
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ target: "readyplayerme", type: "subscribe", eventName: "v1.avatar.exported" }),
            "*"
          );
          setStatus("ready");
        }

        if (msg.eventName === "v1.avatar.exported") {
          const url: string = msg.data?.url;
          if (url) {
            setStatus("done");
            onSave(url);
          }
        }
      } catch {
        // JSON parse fehler ignorieren
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSave]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col" style={{ height: "min(90vh, 700px)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-white font-semibold text-sm">Avatar erstellen</h2>
            <p className="text-gray-400 text-xs">für {buddyName}</p>
          </div>
          <div className="flex items-center gap-3">
            {status === "loading" && (
              <span className="text-xs text-gray-500">Wird geladen…</span>
            )}
            {status === "ready" && (
              <span className="text-xs text-green-400">Fertig wenn du auf &ldquo;Weiter&rdquo; klickst</span>
            )}
            {status === "done" && (
              <span className="text-xs text-green-400 font-medium">Avatar gespeichert ✓</span>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* RPM Iframe */}
        <iframe
          ref={iframeRef}
          src={RPM_URL}
          className="flex-1 w-full border-0"
          allow="camera *; microphone *; clipboard-write"
          title="Ready Player Me Avatar Creator"
        />
      </div>
    </div>
  );
}
