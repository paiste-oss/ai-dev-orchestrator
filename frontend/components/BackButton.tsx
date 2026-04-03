"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ label = "← Zurück zu Baddi" }: { label?: string }) {
  const router = useRouter();

  const handleBack = () => {
    // Wenn Seite in neuem Tab geöffnet wurde (window.open), Tab schliessen → Opener bleibt offen
    if (window.opener) {
      window.close();
      return;
    }
    // Direkt navigiert mit Browser-History → zurück
    if (window.history.length > 1) {
      router.back();
      return;
    }
    // Fallback: Startseite
    router.push("/");
  };

  return (
    <button
      onClick={handleBack}
      className="text-indigo-400 hover:text-indigo-300 text-sm mb-6 inline-block transition-colors"
    >
      {label}
    </button>
  );
}
