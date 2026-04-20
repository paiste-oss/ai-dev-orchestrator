"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Section } from "@/components/user/settings/Section";
import { useT } from "@/lib/i18n";

type Channel = "sms" | "email";

const CHANNELS: { value: Channel; label: string; description: string; icon: string }[] = [
  {
    value: "sms",
    label: "Mobile (SMS)",
    description: "Benachrichtigungen per SMS auf dein Handy",
    icon: "📱",
  },
  {
    value: "email",
    label: "E-Mail",
    description: "Benachrichtigungen an deine E-Mail-Adresse",
    icon: "✉️",
  },
];

interface Props {
  current: Channel;
  onChange: (channel: Channel) => void;
}

export function NotificationChannelSection({ current, onChange }: Props) {
  const t = useT();
  const [selected, setSelected] = useState<Channel>(current);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const save = async (channel: Channel) => {
    setSelected(channel);
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/me`, {
        method: "PATCH",
        body: JSON.stringify({ notification_channel: channel }),
      });
      if (res.ok) {
        onChange(channel);
        setMsg({ text: t("s.saved_ok"), ok: true });
        setTimeout(() => setMsg(null), 3000);
      } else {
        setSelected(current);
        setMsg({ text: t("s.save_error"), ok: false });
      }
    } finally {
      setSaving(false); }
  };

  const channels = [
    { value: "sms" as Channel,   label: t("s.notif_sms_label"), description: t("s.notif_sms_desc"),   icon: "📱" },
    { value: "email" as Channel, label: t("s.email"),           description: t("s.notif_email_desc"), icon: "✉️" },
  ];

  return (
    <Section title={t("s.notif_title")} icon="🔔">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          {t("s.notif_hint", { buddy: "Baddi" })}
        </p>

        {channels.map(ch => (
          <label
            key={ch.value}
            className={`flex items-center gap-4 cursor-pointer rounded-xl border p-4 transition-colors ${
              selected === ch.value
                ? "border-indigo-500/60 bg-indigo-950/20"
                : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
            } ${saving ? "opacity-60 pointer-events-none" : ""}`}
          >
            <input
              type="radio"
              name="notification_channel"
              value={ch.value}
              checked={selected === ch.value}
              onChange={() => save(ch.value)}
              className="accent-indigo-500 w-4 h-4 shrink-0"
            />
            <span className="text-2xl">{ch.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{ch.label}</p>
              <p className="text-xs text-gray-500">{ch.description}</p>
            </div>
            {selected === ch.value && (
              <span className="text-xs text-indigo-400 font-semibold shrink-0">{t("s.notif_active")}</span>
            )}
          </label>
        ))}

        {/* Platzhalter für zukünftige Kanäle */}
        <div className="flex items-center gap-4 rounded-xl border border-gray-800 border-dashed p-4 opacity-40">
          <span className="text-2xl">💬</span>
          <div>
            <p className="text-sm font-medium text-gray-400">{t("s.notif_wa")}</p>
            <p className="text-xs text-gray-600">{t("s.notif_wa_soon")}</p>
          </div>
        </div>

        {msg && (
          <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
        )}
      </div>
    </Section>
  );
}
