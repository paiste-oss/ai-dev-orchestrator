"use client";
import BaddiChat from "@/components/BaddiChat";
import { getUseCase } from "@/lib/usecases";

export default function BestagerPage() {
  const uc = getUseCase("bestager")!;
  return <BaddiChat useCase={uc} />;
}
