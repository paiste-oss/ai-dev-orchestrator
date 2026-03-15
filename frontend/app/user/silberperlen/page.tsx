"use client";
import BaddiChat from "@/components/BaddiChat";
import { getUseCase } from "@/lib/usecases";

export default function SilberperlenPage() {
  const uc = getUseCase("silberperlen")!;
  return <BaddiChat useCase={uc} />;
}
