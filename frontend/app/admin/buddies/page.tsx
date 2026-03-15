"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function BuddiesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/buddies/menschen"); }, []);
  return null;
}
