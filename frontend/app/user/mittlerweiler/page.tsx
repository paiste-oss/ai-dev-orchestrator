"use client";
import BaddiChat from "@/components/BaddiChat";
import { getUseCase } from "@/lib/usecases";

export default function MittlerweilerPage() {
  const uc = getUseCase("mittlerweiler")!;
  return <BaddiChat useCase={uc} />;
}
