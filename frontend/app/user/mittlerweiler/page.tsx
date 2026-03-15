"use client";
import BuddyChat from "@/components/BuddyChat";
import { getUseCase } from "@/lib/usecases";

export default function MittlerweilerPage() {
  const uc = getUseCase("mittlerweiler")!;
  return <BuddyChat useCase={uc} />;
}
