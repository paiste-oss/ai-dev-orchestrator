import { useEffect, useState } from "react";
import { Avatar } from "@readyplayerme/visage";

// Standard-Avatar (wird später durch Kunden-Avatar ersetzt)
const MODEL_SRC = "https://readyplayerme.github.io/visage/male.glb";

// Idle-Animation — Avatar atmet und bewegt sich leicht
const IDLE_ANIMATION = "https://readyplayerme.github.io/visage/animations/idle.glb";

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

// Erlaubte Quell-Origins für postMessage
const ALLOWED_ORIGINS = [
  "https://www.baddi.ch",
  "https://baddi.ch",
  "http://localhost:3000",
  "http://localhost:3001",
];

export default function App() {
  const [emotion, setEmotion] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ALLOWED_ORIGINS.includes(e.origin)) return;
      if (e.data?.type !== "baddi_emotion") return;
      setEmotion(e.data.emotion ?? null);
      setSpeaking(e.data.speaking ?? false);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const emotionBlendshapes = emotion ? EMOTION_MAP[emotion] : undefined;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "transparent", position: "relative" }}>
      <Avatar
        modelSrc={MODEL_SRC}
        animationSrc={IDLE_ANIMATION}
        halfBody
        emotion={emotionBlendshapes}
        idleRotation={false}
        headMovement
        style={{ width: "100%", height: "100%", background: "transparent" }}
      />

      {/* Speaking-Indikator */}
      {speaking && (
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          width: 12, height: 12, borderRadius: "50%",
          background: "#34d399",
          boxShadow: "0 0 8px 3px rgba(52,211,153,0.6)",
          animation: "pulse 1s ease-in-out infinite",
        }} />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
