"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_ROUTES } from "./config";
import { getToken } from "./auth";

export interface BaddiNotification {
  event_id: string;
  source: "email" | "calendar" | "news" | "weather" | "government";
  priority: "low" | "medium" | "high" | "urgent";
  title: string;
  message: string;
  action: string | null;
  buddy_name: string;
  created_at: string;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export function useBaddiEvents(customerId: string | null) {
  const [notifications, setNotifications] = useState<BaddiNotification[]>([]);
  const [connected, setConnected] = useState(false);

  // Ref-Flags so the cleanup closure can signal the reconnect loop to stop
  const activeRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  const dismiss = useCallback((eventId: string) => {
    setNotifications((prev) => prev.filter((n) => n.event_id !== eventId));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (!customerId) return;

    activeRef.current = true;
    let attempt = 0;

    const connect = async () => {
      const token = getToken();
      if (!token) return;

      const url = API_ROUTES.agentEventsWs(token);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        attempt = 0;
      };

      ws.onmessage = (e: MessageEvent<string>) => {
        try {
          const data: unknown = JSON.parse(e.data);
          if (
            typeof data === "object" &&
            data !== null &&
            "type" in data &&
            (data as Record<string, unknown>).type === "ping"
          ) {
            return;
          }
          setNotifications((prev) =>
            [data as BaddiNotification, ...prev].slice(0, 20)
          );
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!activeRef.current) return;

        // Exponential backoff reconnect
        const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
        attempt += 1;
        setTimeout(() => {
          if (activeRef.current) connect();
        }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      activeRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [customerId]);

  return { notifications, connected, dismiss, dismissAll };
}
