"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const MODEL_URL =
  "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

const ANIM_MAP: Record<string, string> = {
  freudig:      "Wave",
  nachdenklich: "Idle",
  traurig:      "Sitting",
  überrascht:   "Jump",
  ruhig:        "Idle",
  aufmunternd:  "ThumbsUp",
  neugierig:    "Survey",
  empathisch:   "Yes",
};

function RobotModel({ emotion }: { emotion?: string | null }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_URL);
  const { actions } = useAnimations(animations, group);
  const currentRef = useRef<string>("Idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Idle beim Start
  useEffect(() => {
    const idle = actions["Idle"];
    if (idle) { idle.reset().fadeIn(0.4).play(); }
  }, [actions]);

  useEffect(() => {
    if (!emotion) return;
    const target = ANIM_MAP[emotion] ?? "Idle";
    if (target === currentRef.current) return;

    actions[currentRef.current]?.fadeOut(0.3);
    actions[target]?.reset().fadeIn(0.3).play();
    currentRef.current = target;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      actions[currentRef.current]?.fadeOut(0.3);
      actions["Idle"]?.reset().fadeIn(0.3).play();
      currentRef.current = "Idle";
    }, 3000);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [emotion, actions]);

  return <primitive ref={group} object={scene} position={[0, -1, 0]} />;
}

export default function RobotAvatar({ emotion }: { emotion?: string | null }) {
  return (
    <Canvas
      camera={{ position: [0, 0.8, 2.8], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 3]} intensity={1.2} castShadow />
      <directionalLight position={[-2, 2, -2]} intensity={0.3} color="#a78bfa" />
      <Suspense fallback={null}>
        <RobotModel emotion={emotion} />
      </Suspense>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 1.6}
        target={[0, 0.3, 0]}
        autoRotate={false}
      />
    </Canvas>
  );
}

useGLTF.preload(MODEL_URL);
