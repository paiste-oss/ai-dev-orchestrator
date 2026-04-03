"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function BackButtonInner({ label }: { label: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleBack = () => {
    // ?from=/user/settings o.ä. — expliziter Rücksprung-Pfad
    const from = searchParams.get("from");
    if (from) {
      router.push(from);
      return;
    }
    // Neuer Tab via window.open (ohne noopener) → Tab schliessen
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

export default function BackButton({ label = "← Zurück zu Baddi" }: { label?: string }) {
  return (
    <Suspense fallback={null}>
      <BackButtonInner label={label} />
    </Suspense>
  );
}
