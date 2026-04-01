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

// TypeScript-Deklaration für model-viewer Custom Element
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        "animation-name"?: string;
        autoplay?: string;
        "camera-orbit"?: string;
        "field-of-view"?: string;
        "camera-target"?: string;
        "shadow-intensity"?: string;
        "disable-zoom"?: string;
        "disable-pan"?: string;
        "interaction-prompt"?: string;
      };
    }
  }
}

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
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => mv.setAttribute("animation-name", "Idle"),
      3000
    );
    return () => clearTimeout(timerRef.current);
  }, [emotion]);

  return (
    <model-viewer
      id={mvId.current}
      src="https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb"
      animation-name="Idle"
      autoplay=""
      camera-orbit="0deg 85deg 4.5m"
      field-of-view="55deg"
      camera-target="0m 0.9m 0m"
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
