"use client";

import React from "react";
import { Avatar } from "@readyplayerme/visage";

// Standardmässiger RPM Demo-Avatar (kann später durch Nutzer-Avatar ersetzt werden)
const MODEL_SRC = "https://readyplayerme.github.io/visage/male.glb";

// Mapping: Deutsche Emotion → ARKit Blendshape-Werte
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

interface Props {
  emotion?: string | null;
  speaking?: boolean;
}

export default function BaddiAvatarCanvas({ emotion, speaking }: Props) {
  const emotionBlendshapes = emotion ? EMOTION_MAP[emotion] : undefined;

  return (
    <div className="relative w-full h-full">
      <Avatar
        modelSrc={MODEL_SRC}
        halfBody
        emotion={emotionBlendshapes}
        idleRotation={false}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      />
      {speaking && (
        <span className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_2px_rgba(52,211,153,0.5)]" />
      )}
    </div>
  );
}
