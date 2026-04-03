"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { ProfileSection } from "@/components/user/settings/ProfileSection";
import { PasswordSection } from "@/components/user/settings/PasswordSection";
import { MemorySection } from "@/components/user/settings/MemorySection";
import { TwoFASection } from "@/components/user/settings/TwoFASection";
import { NotificationChannelSection } from "@/components/user/settings/NotificationChannelSection";

interface Me {
  id: string; name: string; email: string; role: string;
  memory_consent: boolean; language: string; phone: string | null;
  address_street: string | null; address_zip: string | null;
  address_city: string | null; address_country: string | null;
  two_fa_enabled: boolean; phone_verified: boolean;
  notification_channel: "sms" | "email";
}

export default function UserSettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    apiFetch(`${BACKEND_URL}/v1/auth/me`).then(r => r.json()).then((d: Me) => setMe(d));
  }, [router]);

  if (!me) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-500 text-sm">Lädt…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-5 py-8 space-y-5">

        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-xl transition-colors">←</button>
          <div>
            <h1 className="text-xl font-bold text-white">Einstellungen</h1>
            <p className="text-xs text-gray-500">{me.email}</p>
          </div>
        </div>

        <ProfileSection me={me} />
        <PasswordSection />
        <NotificationChannelSection
          current={me.notification_channel ?? "sms"}
          onChange={channel => setMe(m => m ? { ...m, notification_channel: channel } : m)}
        />
        <TwoFASection
          twoFaEnabled={me.two_fa_enabled}
          phoneVerified={me.phone_verified}
          phone={me.phone}
          onStatusChange={(enabled, phone) => setMe(m => m ? { ...m, two_fa_enabled: enabled, phone } : m)}
        />
        <MemorySection
          memoryConsent={me.memory_consent}
          onConsentChange={val => setMe(m => m ? { ...m, memory_consent: val } : m)}
        />

        {/* Rechtliches */}
        <div className="bg-gray-900 border border-white/5 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📄</span>
            <h2 className="font-semibold text-white">Rechtliches</h2>
          </div>
          <a href="/agb?from=/user/settings" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between w-full text-sm text-gray-300 hover:text-white transition-colors py-1 border-b border-white/5">
            <span>Allgemeine Geschäftsbedingungen (AGB)</span>
            <span className="text-gray-600">↗</span>
          </a>
          <a href="/datenschutz?from=/user/settings" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between w-full text-sm text-gray-300 hover:text-white transition-colors py-1">
            <span>Datenschutzerklärung</span>
            <span className="text-gray-600">↗</span>
          </a>
        </div>

      </div>
    </div>
  );
}
