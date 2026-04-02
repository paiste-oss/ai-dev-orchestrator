"use client";

import { useRef, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { TeapotGeometry } from "three-stdlib";

const EMOTION_COLORS: Record<string, string> = {
  freudig:      "#a855f7",
  nachdenklich: "#6366f1",
  traurig:      "#64748b",
  überrascht:   "#ec4899",
  ruhig:        "#8b5cf6",
  aufmunternd:  "#f97316",
  neugierig:    "#7c3aed",
  empathisch:   "#e879f9",
};

interface Props {
  emotion?: string | null;
  speaking?: boolean;
}

function TeapotScene({ emotion, speaking }: Props) {
  const bodyRef  = useRef<THREE.Mesh>(null);
  const lidRef   = useRef<THREE.Mesh>(null);
  const matRef   = useRef<THREE.MeshStandardMaterial>(null);
  const lidMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // Separate Geometrien: Körper ohne Deckel, Deckel separat
  const bodyGeo = useMemo(() => {
    const g = new TeapotGeometry(0.55, 12, true, false, true, false, 1);
    return g;
  }, []);

  const lidGeo = useMemo(() => {
    const g = new TeapotGeometry(0.55, 12, false, true, false, true, 1);
    return g;
  }, []);

  useEffect(() => {
    return () => { bodyGeo.dispose(); lidGeo.dispose(); };
  }, [bodyGeo, lidGeo]);

  // Farbe je Emotion
  useEffect(() => {
    const hex = EMOTION_COLORS[emotion ?? "ruhig"] ?? EMOTION_COLORS.ruhig;
    const col = new THREE.Color(hex);
    if (matRef.current)    matRef.current.color.set(col);
    if (lidMatRef.current) lidMatRef.current.color.set(col.clone().multiplyScalar(0.85));
  }, [emotion]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    if (bodyRef.current) {
      // Langsame Eigenrotation
      bodyRef.current.rotation.y += speaking ? 0.025 : 0.004;
      // Sprechen: Körper wackelt
      bodyRef.current.rotation.z = speaking
        ? Math.sin(t * 14) * 0.06
        : bodyRef.current.rotation.z * 0.92;
    }

    if (lidRef.current) {
      // Deckel springt beim Sprechen hoch
      lidRef.current.position.y = speaking
        ? Math.abs(Math.sin(t * 10)) * 0.14
        : THREE.MathUtils.lerp(lidRef.current.position.y, 0, 0.1);
      // Deckelrotation synchron mit Körper
      if (bodyRef.current) lidRef.current.rotation.y = bodyRef.current.rotation.y;
    }
  });

  return (
    <group position={[0, -0.2, 0]}>
      {/* Körper */}
      <mesh ref={bodyRef} geometry={bodyGeo}>
        <meshStandardMaterial
          ref={matRef}
          color={EMOTION_COLORS[emotion ?? "ruhig"]}
          metalness={0.25}
          roughness={0.45}
        />
      </mesh>

      {/* Deckel */}
      <mesh ref={lidRef} geometry={lidGeo}>
        <meshStandardMaterial
          ref={lidMatRef}
          color={new THREE.Color(EMOTION_COLORS[emotion ?? "ruhig"]).multiplyScalar(0.85)}
          metalness={0.25}
          roughness={0.45}
        />
      </mesh>

      {/* Augen — kleine Kugeln auf der Vorderseite */}
      <mesh position={[-0.15, 0.1, 0.52]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <mesh position={[0.15, 0.1, 0.52]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <mesh position={[-0.13, 0.1, 0.565]}>
        <sphereGeometry args={[0.025, 10, 10]} />
        <meshBasicMaterial color="#1a0045" />
      </mesh>
      <mesh position={[0.17, 0.1, 0.565]}>
        <sphereGeometry args={[0.025, 10, 10]} />
        <meshBasicMaterial color="#1a0045" />
      </mesh>
    </group>
  );
}

export default function TeekanneAvatar({ emotion, speaking }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 2.5], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 3]} intensity={1.1} />
      <pointLight position={[-2, 1, 2]} intensity={0.5} color="#c084fc" />
      <TeapotScene emotion={emotion} speaking={speaking} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 1.5}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
