"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@readyplayerme/visage";

const MODEL_SRC = "https://readyplayerme.github.io/visage/male.glb";

// Deutsche Emotion → ARKit Blendshape-Werte
const EMOTION_MAP: Record<string, Record<string, number>> = {
  freudig:      { mouthSmileLeft: 0.75, mouthSmileRight: 0.75, cheekSquintLeft: 0.35, cheekSquintRight: 0.35 },
  nachdenklich: { browDownLeft: 0.45, browDownRight: 0.45, eyeLookDownLeft: 0.2, eyeLookDownRight: 0.2 },
  traurig:      { browInnerUp: 0.65, mouthFrownLeft: 0.55, mouthFrownRight: 0.55, eyeLookDownLeft: 0.3, eyeLookDownRight: 0.3 },
  überrascht:   { browInnerUp: 0.9, browOuterUpLeft: 0.8, browOuterUpRight: 0.8, jawOpen: 0.4, eyeWideLeft: 0.7, eyeWideRight: 0.7 },
  ruhig:        { mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
  aufmunternd:  { mouthSmileLeft: 0.55, mouthSmileRight: 0.55, cheekSquintLeft: 0.25, cheekSquintRight: 0.25 },
  neugierig:    { browInnerUp: 0.4, browOuterUpLeft: 0.35, browOuterUpRight: 0.35, eyeWideLeft: 0.3, eyeWideRight: 0.3 },
  empathisch:   { browInnerUp: 0.5, mouthSmileLeft: 0.15, mouthSmileRight: 0.15 },
};

export default function AvatarPage() {
  const [emotion, setEmotion] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "baddi_emotion") {
        setEmotion(e.data.emotion ?? null);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const emotionBlendshapes = emotion ? EMOTION_MAP[emotion] : undefined;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "transparent" }}>
      <Avatar
        modelSrc={MODEL_SRC}
        halfBody
        emotion={emotionBlendshapes}
        idleRotation={false}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      />
    </div>
  );
}
