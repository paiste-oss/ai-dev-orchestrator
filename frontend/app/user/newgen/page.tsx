"use client";
import BaddiChat from "@/components/BaddiChat";
import { getUseCase } from "@/lib/usecases";

export default function NewgenPage() {
  const uc = getUseCase("newgen")!;
  return <BaddiChat useCase={uc} />;
}
