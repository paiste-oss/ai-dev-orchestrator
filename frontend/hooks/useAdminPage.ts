"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

interface UseAdminPageResult {
  mounted: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

/**
 * Gemeinsamer Hook für alle Admin-Pages.
 * Kapselt: Auth-Check, mounted-Guard, Sidebar-State.
 *
 * Verwendung:
 *   const { mounted, sidebarOpen, setSidebarOpen } = useAdminPage();
 *   if (!mounted) return null;
 */
export function useAdminPage(): UseAdminPageResult {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = getSession();
    if (!u || u.role !== "admin") {
      router.replace("/login");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mounted, sidebarOpen, setSidebarOpen };
}
