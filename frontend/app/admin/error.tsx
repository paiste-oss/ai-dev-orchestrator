"use client";

/**
 * Error Boundary für das /admin/**-Segment.
 * Fängt unkontrollierte Fehler (throw, unhandled Promise rejection) ab,
 * die aus Admin-Seiten-Komponenten propagieren.
 * Gestaltete API-Fehler (setError(...)) werden weiterhin lokal behandelt.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto px-4 pt-24 pb-12 text-center space-y-6">
      <div className="text-5xl">⚠</div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white">Etwas ist schiefgelaufen</h2>
        <p className="text-sm text-gray-400">
          {error.message || "Ein unerwarteter Fehler ist aufgetreten."}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-700 font-mono">ID: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="px-5 py-2.5 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/25 text-yellow-400 text-sm font-medium transition-colors"
      >
        Nochmals versuchen
      </button>
    </div>
  );
}
