"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

export default function ChatIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getSession();
    if (!user) { router.replace("/login"); return; }

    // Kunden-Baddi laden und direkt weiterleiten (1:1)
    apiFetch(`${BACKEND_URL}/v1/buddies/me`)
      .then(async (res) => {
        if (!res.ok) { router.replace("/login"); return; }
        const data = await res.json();
        if (data.length > 0) {
          router.replace(`/chat/${data[0].id}`);
        } else {
          router.replace("/login");
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  // Splash während Redirect
  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl shadow-xl animate-pulse">
          🤖
        </div>
        <p className="text-gray-400 text-sm">Verbinde mit deinem Baddi…</p>
      </div>
    </main>
  );
}
