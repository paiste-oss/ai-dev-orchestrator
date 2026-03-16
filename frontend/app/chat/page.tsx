"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { getUseCase } from "@/lib/usecases";

interface Buddy {
  id: string;
  name: string;
  usecase_id: string | null;
  segment: string;
}

export default function ChatIndexPage() {
  const router = useRouter();
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getSession();
    if (!user) { router.replace("/login"); return; }

    apiFetch(`${BACKEND_URL}/v1/buddies/me`)
      .then(async (res) => {
        if (!res.ok) { setError("Baddis konnten nicht geladen werden."); return; }
        const data: Buddy[] = await res.json();
        if (data.length === 1) {
          router.replace(`/chat/${data[0].id}`);
        } else {
          setBuddies(data);
          setLoading(false);
        }
      })
      .catch(() => { setError("Server nicht erreichbar."); setLoading(false); });
  }, [router]);

  if (loading && !error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-pulse">🤖</div>
          <p className="text-gray-400">Lade deinen Baddi…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-red-400">{error}</p>
          <button onClick={() => router.push("/")} className="text-gray-400 hover:text-white text-sm">← Zurück zur Startseite</button>
        </div>
      </main>
    );
  }

  if (buddies.length === 0) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">🤖</div>
          <h2 className="text-xl font-bold">Noch kein Baddi zugewiesen</h2>
          <p className="text-gray-400 text-sm">Dein Konto hat noch keinen AI-Baddi. Bitte wende dich an den Support.</p>
          <button onClick={() => router.push("/")} className="text-gray-400 hover:text-white text-sm">← Zurück</button>
        </div>
      </main>
    );
  }

  // Multiple buddies → selection screen
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Deine Baddis</h1>
          <p className="text-gray-400 text-sm">Wähle mit wem du chatten möchtest</p>
        </div>

        <div className="space-y-3">
          {buddies.map((buddy) => {
            const uc = buddy.usecase_id ? getUseCase(buddy.usecase_id) : null;
            return (
              <button
                key={buddy.id}
                onClick={() => router.push(`/chat/${buddy.id}`)}
                className="w-full flex items-center gap-4 bg-gray-900 border border-gray-700 hover:border-yellow-500 rounded-2xl p-4 transition-colors text-left group"
              >
                <div className="text-4xl shrink-0">{uc?.icon ?? "🤖"}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white">{buddy.name}</p>
                  {uc && <p className="text-sm text-gray-400 truncate">{uc.tagline}</p>}
                  <p className="text-xs text-gray-600 mt-0.5 capitalize">{buddy.segment}</p>
                </div>
                <span className="text-gray-600 group-hover:text-yellow-400 text-xl transition-colors">→</span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
