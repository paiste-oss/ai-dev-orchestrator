"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { ChatAppearanceSection } from "@/components/user/settings/ChatAppearanceSection";
import { ProfileSection } from "@/components/user/settings/ProfileSection";
import { PasswordSection } from "@/components/user/settings/PasswordSection";
import { MemorySection } from "@/components/user/settings/MemorySection";

interface Me {
  id: string; name: string; email: string; role: string;
  memory_consent: boolean; language: string; phone: string | null;
  address_street: string | null; address_zip: string | null;
  address_city: string | null; address_country: string | null;
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

        <ChatAppearanceSection />
        <ProfileSection me={me} />
        <PasswordSection />
        <MemorySection
          memoryConsent={me.memory_consent}
          onConsentChange={val => setMe(m => m ? { ...m, memory_consent: val } : m)}
        />

      </div>
    </div>
  );
}
