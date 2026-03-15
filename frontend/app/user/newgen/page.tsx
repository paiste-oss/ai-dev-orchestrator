"use client";
import BuddyChat from "@/components/BuddyChat";
import { getUseCase } from "@/lib/usecases";

export default function NewgenPage() {
  const uc = getUseCase("newgen")!;
  return <BuddyChat useCase={uc} />;
}
