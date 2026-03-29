"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FinanzenRoot() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/customers/abo-modell"); }, []);
  return null;
}
