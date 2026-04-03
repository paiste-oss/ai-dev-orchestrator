"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const FROM_LABELS: Record<string, string> = {
  "/login":        "← Zurück zum Login",
  "/register":     "← Zurück zur Registrierung",
  "/user/settings":"← Zurück zu den Einstellungen",
};

function BackButtonInner({ label }: { label: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from");
  const displayLabel = from ? (FROM_LABELS[from] ?? "← Zurück") : label;

  const handleBack = () => {
    if (from) { router.push(from); return; }
    if (window.history.length > 1) { router.back(); return; }
    router.push("/");
  };

  return (
    <button
      onClick={handleBack}
      className="text-indigo-400 hover:text-indigo-300 text-sm mb-6 inline-block transition-colors"
    >
      {displayLabel}
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
