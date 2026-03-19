"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FunktionenRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/buddies/menschen"); }, []);
  return null;
}
