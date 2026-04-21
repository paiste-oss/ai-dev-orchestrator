"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  emotion?: string | null;
  speaking?: boolean;
}

// Emotion → Ozeanfarbe (H, S, L)
const OCEAN_HSL: Record<string, [number, number, number]> = {
  freudig:      [195, 0.85, 0.45],
  nachdenklich: [220, 0.70, 0.38],
  traurig:      [232, 0.45, 0.32],
  überrascht:   [270, 0.80, 0.52],
  ruhig:        [185, 0.65, 0.40],
  aufmunternd:  [30,  0.90, 0.50],
  neugierig:    [262, 0.60, 0.48],
  empathisch:   [325, 0.68, 0.48],
};

function oceanColor(emotion?: string | null): THREE.Color {
  const [h, s, l] = OCEAN_HSL[emotion ?? "ruhig"] ?? OCEAN_HSL.ruhig;
  return new THREE.Color().setHSL(h / 360, s, l);
}

// Einfache prozedurale "Kontinent"-Punkte auf Kugeloberfläche
const CONTINENT_SEEDS: [number, number][] = [
  // Europa / Afrika
  [0.20, 0.30], [0.22, 0.45], [0.18, 0.55], [0.24, 0.60],
  [0.20, 0.38], [0.23, 0.50], [0.16, 0.42],
  // Amerika
  [-0.30, 0.25], [-0.28, 0.40], [-0.32, 0.55], [-0.26, 0.45],
  [-0.28, 0.30], [-0.34, 0.48],
  // Asien
  [0.40, 0.30], [0.50, 0.35], [0.45, 0.42], [0.55, 0.28],
  [0.48, 0.38], [0.42, 0.25], [0.58, 0.40],
  // Australien
  [0.50, 0.62], [0.54, 0.65], [0.52, 0.58],
];

function buildLandGeometry(): THREE.BufferGeometry {
  const N = 1400;
  const positions = new Float32Array(N * 3);
  const R = 1.005;
  let idx = 0;
  for (const [lonFrac, latFrac] of CONTINENT_SEEDS) {
    const count = Math.floor(N / CONTINENT_SEEDS.length);
    for (let i = 0; i < count && idx < N; i++) {
      const lon = (lonFrac + (Math.random() - 0.5) * 0.18) * Math.PI * 2;
      const lat = (latFrac - 0.5) * Math.PI;
      positions[idx * 3]     = R * Math.cos(lat) * Math.cos(lon);
      positions[idx * 3 + 1] = R * Math.sin(lat);
      positions[idx * 3 + 2] = R * Math.cos(lat) * Math.sin(lon);
      idx++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions.slice(0, idx * 3), 3));
  return geo;
}

function buildGridGeometry(): THREE.BufferGeometry {
  const segments = 64;
  const positions: number[] = [];

  // Breitenkreise
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = Math.sin((lat * Math.PI) / 180);
    const r = Math.cos((lat * Math.PI) / 180);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(r * Math.cos(a), y, r * Math.sin(a));
    }
  }

  // Längengrade
  for (let lon = 0; lon < 360; lon += 15) {
    const a = (lon * Math.PI) / 180;
    for (let i = 0; i <= segments; i++) {
      const lat = ((i / segments) * 2 - 1) * Math.PI * 0.5;
      positions.push(
        Math.cos(lat) * Math.cos(a),
        Math.sin(lat),
        Math.cos(lat) * Math.sin(a),
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

function Globe({ emotion, speaking }: Props) {
  const groupRef   = useRef<THREE.Group>(null);
  const oceanRef   = useRef<THREE.Mesh>(null);
  const gridRef    = useRef<THREE.LineSegments>(null);
  const landRef    = useRef<THREE.Points>(null);
  const atmosRef   = useRef<THREE.Mesh>(null);
  const glowRef    = useRef<THREE.Mesh>(null);

  const { landGeo, gridGeo } = useMemo(() => ({
    landGeo: buildLandGeometry(),
    gridGeo: buildGridGeometry(),
  }), []);

  useFrame(({ clock }) => {
    const t   = clock.elapsedTime;
    const spd = speaking ? 2.8 : 1;
    const col = oceanColor(emotion);

    if (groupRef.current) {
      groupRef.current.rotation.y += 0.004 * spd;
      groupRef.current.rotation.x = Math.sin(t * 0.3) * 0.06;
    }

    // Ozean-Pulsieren beim Sprechen
    if (oceanRef.current) {
      const mat = oceanRef.current.material as THREE.MeshBasicMaterial;
      const pulse = speaking ? 0.55 + Math.abs(Math.sin(t * 5)) * 0.12 : 0.55;
      mat.opacity = pulse;
      const c = col.clone();
      c.lerp(new THREE.Color(0x001833), 0.45);
      mat.color.set(c);
    }

    // Grid-Farbe
    if (gridRef.current) {
      const mat = gridRef.current.material as THREE.LineBasicMaterial;
      const gridCol = col.clone().lerp(new THREE.Color(0xffffff), 0.35);
      mat.color.set(gridCol);
      mat.opacity = speaking ? 0.55 + Math.sin(t * 4) * 0.1 : 0.38;
    }

    // Land-Punkte
    if (landRef.current) {
      const mat = landRef.current.material as THREE.PointsMaterial;
      const landCol = col.clone().lerp(new THREE.Color(0x88ffaa), 0.6);
      mat.color.set(landCol);
      mat.size = speaking
        ? 0.022 + Math.abs(Math.sin(t * 7)) * 0.008
        : 0.018;
    }

    // Atmosphären-Halo
    if (atmosRef.current) {
      const mat = atmosRef.current.material as THREE.MeshBasicMaterial;
      mat.color.set(col.clone().lerp(new THREE.Color(0x88ddff), 0.5));
      mat.opacity = 0.10 + Math.sin(t * 1.5) * 0.03;
    }

    // Äusserer Glow
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.color.set(col);
      mat.opacity = speaking
        ? 0.12 + Math.abs(Math.sin(t * 3)) * 0.06
        : 0.07 + Math.sin(t * 1.2) * 0.02;
    }
  });

  return (
    <group>
      {/* Rotierender Globus */}
      <group ref={groupRef}>
        {/* Ozean-Kugel */}
        <mesh ref={oceanRef}>
          <sphereGeometry args={[1, 48, 48]} />
          <meshBasicMaterial
            color={oceanColor(emotion).clone().lerp(new THREE.Color(0x001833), 0.45)}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>

        {/* Gitternetz */}
        <lineSegments ref={gridRef} geometry={gridGeo}>
          <lineBasicMaterial
            color={oceanColor(emotion).clone().lerp(new THREE.Color(0xffffff), 0.35)}
            transparent
            opacity={0.38}
            depthWrite={false}
          />
        </lineSegments>

        {/* Kontinent-Punkte */}
        <points ref={landRef} geometry={landGeo}>
          <pointsMaterial
            color={oceanColor(emotion).clone().lerp(new THREE.Color(0x88ffaa), 0.6)}
            size={0.018}
            transparent
            opacity={0.92}
            sizeAttenuation
            depthWrite={false}
          />
        </points>
      </group>

      {/* Atmosphäre (dreht nicht mit) */}
      <mesh ref={atmosRef}>
        <sphereGeometry args={[1.08, 32, 32]} />
        <meshBasicMaterial
          color={new THREE.Color(0x88ddff)}
          transparent
          opacity={0.10}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Äusserer Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.22, 24, 24]} />
        <meshBasicMaterial
          color={oceanColor(emotion)}
          transparent
          opacity={0.07}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export default function WeltkugelAvatar({ emotion, speaking }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 2.6], fov: 48 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <Globe emotion={emotion} speaking={speaking} />
    </Canvas>
  );
}
