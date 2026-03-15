"use client";
import BuddyChat from "@/components/BuddyChat";
import { getUseCase } from "@/lib/usecases";

export default function YoungtersPage() {
  const uc = getUseCase("youngsters")!;
  return <BuddyChat useCase={uc} />;
}
