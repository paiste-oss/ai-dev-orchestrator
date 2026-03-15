"use client";
import BuddyChat from "@/components/BuddyChat";
import { getUseCase } from "@/lib/usecases";

export default function BestagerPage() {
  const uc = getUseCase("bestager")!;
  return <BuddyChat useCase={uc} />;
}
