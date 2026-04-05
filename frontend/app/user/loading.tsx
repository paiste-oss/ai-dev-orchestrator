/**
 * Wird während der Route-Navigation in /user/** angezeigt.
 */
export default function UserLoading() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
    </div>
  );
}
