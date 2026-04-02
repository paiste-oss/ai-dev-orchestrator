"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const EMOTION_HSL: Record<string, [number, number, number]> = {
  freudig:      [45,  0.92, 0.65],
  nachdenklich: [220, 0.72, 0.60],
  traurig:      [232, 0.32, 0.48],
  überrascht:   [282, 0.85, 0.70],
  ruhig:        [178, 0.58, 0.55],
  aufmunternd:  [28,  0.96, 0.62],
  neugierig:    [268, 0.65, 0.64],
  empathisch:   [328, 0.72, 0.65],
};

function hsl(emotion?: string | null): THREE.Color {
  const [h, s, l] = EMOTION_HSL[emotion ?? "ruhig"] ?? EMOTION_HSL.ruhig;
  return new THREE.Color().setHSL(h / 360, s, l);
}

interface Props {
  emotion?: string | null;
  speaking?: boolean;
}

function Particles({ emotion, speaking }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  const innerRef  = useRef<THREE.Mesh>(null);
  const glowRef   = useRef<THREE.Mesh>(null);
  const matRef    = useRef<THREE.PointsMaterial>(null);

  const { geometry } = useMemo(() => {
    const N = 900;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 0.55 + Math.random() * 0.45;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry: geo };
  }, []);

  useFrame(({ clock }) => {
    const t   = clock.elapsedTime;
    const col = hsl(emotion);
    const spd = speaking ? 3 : 1;

    if (pointsRef.current) {
      pointsRef.current.rotation.y += 0.003 * spd;
      pointsRef.current.rotation.x = Math.sin(t * 0.4) * 0.12;
      const pulse = 1 + Math.sin(t * (speaking ? 5 : 1.8)) * 0.08;
      pointsRef.current.scale.setScalar(pulse);
    }
    if (matRef.current) {
      matRef.current.color.set(col);
      matRef.current.size = speaking
        ? 0.028 + Math.abs(Math.sin(t * 8)) * 0.008
        : 0.02;
    }
    if (innerRef.current) {
      const s = 0.28 + Math.sin(t * (speaking ? 6 : 2)) * 0.06;
      innerRef.current.scale.setScalar(s);
      (innerRef.current.material as THREE.MeshBasicMaterial).color.set(col);
    }
    if (glowRef.current) {
      const s = 0.55 + Math.sin(t * (speaking ? 4 : 1.2)) * 0.08;
      glowRef.current.scale.setScalar(s);
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.color.set(col);
      mat.opacity = 0.12 + Math.sin(t * 1.5) * 0.04;
    }
  });

  return (
    <group>
      {/* Partikel-Hülle */}
      <points ref={pointsRef} geometry={geometry}>
        <pointsMaterial
          ref={matRef}
          color={hsl(emotion)}
          size={0.02}
          transparent
          opacity={0.85}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      {/* Äusserer Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color={hsl(emotion)} transparent opacity={0.12} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Leuchtender Kern */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color={hsl(emotion)} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

export default function LichtgestaltAvatar({ emotion, speaking }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 2.5], fov: 50 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <Particles emotion={emotion} speaking={speaking} />
    </Canvas>
  );
}
