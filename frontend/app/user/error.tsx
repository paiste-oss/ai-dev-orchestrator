"use client";

/**
 * Error Boundary für das /user/**-Segment.
 */
export default function UserError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="text-4xl">⚠</div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold">Etwas ist schiefgelaufen</h2>
          <p className="text-sm text-gray-400">
            {error.message || "Ein unerwarteter Fehler ist aufgetreten."}
          </p>
        </div>
        <button
          onClick={reset}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          Nochmals versuchen
        </button>
      </div>
    </div>
  );
}
