"use client";

import { useEffect, useState, useCallback } from "react";
import { BACKEND_URL } from "./config";

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

export function useBaddiEvents(customerId: string | null) {
  const [notifications, setNotifications] = useState<BaddiNotification[]>([]);
  const [connected, setConnected] = useState(false);

  const dismiss = useCallback((eventId: string) => {
    setNotifications((prev) => prev.filter((n) => n.event_id !== eventId));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (!customerId) return;

    const url = `${BACKEND_URL}/v1/agent/events/stream?customer_id=${customerId}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "ping") return;
        setNotifications((prev) => [data, ...prev].slice(0, 20));
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource reconnects automatically
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [customerId]);

  return { notifications, connected, dismiss, dismissAll };
}
