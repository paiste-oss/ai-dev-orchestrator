"use client";

import { BaddiNotification } from "@/lib/useBaddiEvents";

const SOURCE_ICONS: Record<string, string> = {
  email: "✉️",
  calendar: "📅",
  news: "📰",
  weather: "🌤️",
  government: "🏛️",
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "border-red-500 bg-red-50 text-red-900",
  high: "border-orange-400 bg-orange-50 text-orange-900",
  medium: "border-yellow-400 bg-yellow-50 text-yellow-900",
  low: "border-gray-300 bg-gray-50 text-gray-800",
};

interface Props {
  notification: BaddiNotification;
  onDismiss: (id: string) => void;
}

export default function BaddiEventBanner({ notification, onDismiss }: Props) {
  const icon = SOURCE_ICONS[notification.source] ?? "🔔";
  const style = PRIORITY_STYLES[notification.priority] ?? PRIORITY_STYLES.low;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border-l-4 p-3 shadow-sm ${style} animate-fade-in`}
      role="alert"
    >
      <span className="text-xl leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-0.5">
          {notification.title} · {notification.buddy_name}
        </p>
        <p className="text-sm leading-snug">{notification.message}</p>
      </div>
      <button
        onClick={() => onDismiss(notification.event_id)}
        className="ml-2 text-lg leading-none opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Schliessen"
      >
        ×
      </button>
    </div>
  );
}

interface BannerListProps {
  notifications: BaddiNotification[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

export function BaddiEventBannerList({
  notifications,
  onDismiss,
  onDismissAll,
}: BannerListProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-3">
      {notifications.length > 1 && (
        <button
          onClick={onDismissAll}
          className="self-end text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Alle schliessen
        </button>
      )}
      {notifications.map((n) => (
        <BaddiEventBanner key={n.event_id} notification={n} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
