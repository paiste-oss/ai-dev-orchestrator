"use client";
import BuddyChat from "@/components/BuddyChat";
import { getUseCase } from "@/lib/usecases";

export default function SilberperlenPage() {
  const uc = getUseCase("silberperlen")!;
  return <BuddyChat useCase={uc} />;
}
