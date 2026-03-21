"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Alte Route — leitet auf die neue einheitliche Chat-Seite weiter. */
export default function ChatBuddyRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/chat"); }, [router]);
  return null;
}
