"use client";

import { useEffect, useRef } from "react";

const ANIM: Record<string, string> = {
  freudig:      "Wave",
  nachdenklich: "Idle",
  traurig:      "Sitting",
  überrascht:   "Jump",
  ruhig:        "Idle",
  aufmunternd:  "ThumbsUp",
  neugierig:    "Idle",
  empathisch:   "Yes",
};

// model-viewer ist ein Web Component — als generisches Element rendern
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MV = "model-viewer" as any;

export default function RobotAvatar({ emotion }: { emotion?: string | null }) {
  const mvId = useRef(`mv-${Math.random().toString(36).slice(2)}`);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // model-viewer Script einmalig laden
  useEffect(() => {
    if (document.querySelector('script[data-model-viewer]')) return;
    const s = document.createElement("script");
    s.type = "module";
    s.dataset.modelViewer = "1";
    s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!emotion) return;
    const mv = document.getElementById(mvId.current);
    if (!mv) return;
    mv.setAttribute("animation-name", ANIM[emotion] ?? "Idle");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => mv.setAttribute("animation-name", "Idle"),
      3000
    );
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [emotion]);

  return (
    <MV
      id={mvId.current}
      src="https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb"
      animation-name="Idle"
      autoplay=""
      camera-orbit="0deg 70deg 6m"
      field-of-view="40deg"
      camera-target="0m 1m 0m"
      shadow-intensity="0"
      disable-zoom=""
      disable-pan=""
      interaction-prompt="none"
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "transparent",
        ["--progress-bar-color" as string]: "transparent",
        ["--progress-mask" as string]: "transparent",
      }}
    />
  );
}
