"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * Gemeinsames User-Layout.
 * Stellt bereit: Auth-Guard für alle /user/** Seiten.
 * Kein eigener Shell (jede User-Seite hat ihr eigenes Layout).
 */
export default function UserLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!getSession()) {
      router.replace("/login");
    }
  }, [router]);

  return <>{children}</>;
}
