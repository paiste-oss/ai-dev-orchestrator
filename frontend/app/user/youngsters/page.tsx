"use client";
import BaddiChat from "@/components/BaddiChat";
import { getUseCase } from "@/lib/usecases";

export default function YoungtersPage() {
  const uc = getUseCase("youngsters")!;
  return <BaddiChat useCase={uc} />;
}
