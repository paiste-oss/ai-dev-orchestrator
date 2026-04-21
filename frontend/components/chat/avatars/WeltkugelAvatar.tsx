"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  emotion?: string | null;
  speaking?: boolean;
}

// Emotion → Ozean-Hex-Farbe (Atlas-Stil: gedämpfte Blautöne)
const OCEAN_COLOR: Record<string, string> = {
  freudig:      "#1a6db5",
  nachdenklich: "#1a4a8c",
  traurig:      "#0e2d5a",
  überrascht:   "#2a4db5",
  ruhig:        "#1a5a8c",
  aufmunternd:  "#2a5a9c",
  neugierig:    "#1a4a9c",
  empathisch:   "#1e3a7a",
};

// Vereinfachte Kontinentumrisse [lon, lat] — erkennbar wie auf einem Atlas
const CONTINENTS: [number, number][][] = [
  // Nordamerika
  [
    [-168,71],[-130,55],[-124,49],[-95,49],[-83,46],[-75,45],
    [-67,47],[-53,47],[-50,24],[-62,10],[-75,8],[-83,8],
    [-85,22],[-80,23],[-90,16],[-92,16],[-105,20],[-110,23],
    [-117,32],[-118,34],[-124,38],[-124,49],[-140,60],[-168,71],
  ],
  // Grönland
  [[-72,83],[-18,83],[-18,76],[-45,60],[-65,60],[-72,72]],
  // Südamerika
  [
    [-82,12],[-75,12],[-62,12],[-50,2],[-35,-5],[-36,-18],
    [-35,-53],[-52,-54],[-68,-56],[-76,-50],[-82,12],
  ],
  // Europa
  [
    [-10,35],[36,35],[40,42],[28,48],[32,60],[28,72],
    [10,72],[5,58],[0,51],[-5,48],[-10,35],
  ],
  // Skandinavien
  [[5,58],[28,72],[20,72],[8,58]],
  // Grossbritannien (grob)
  [[-6,50],[2,51],[2,59],[-6,59]],
  // Afrika
  [
    [-18,37],[37,37],[52,12],[55,8],[52,-12],
    [52,-35],[18,-35],[12,-18],[-18,-12],[-18,37],
  ],
  // Asien (Festland)
  [
    [26,72],[140,72],[145,50],[145,1],[105,1],
    [80,8],[60,22],[50,8],[26,36],[26,72],
  ],
  // Arabische Halbinsel
  [[36,30],[60,22],[58,12],[44,12],[36,30]],
  // Indische Halbinsel
  [[68,24],[80,8],[68,8],[68,24]],
  // Japan (grob)
  [[130,31],[132,34],[141,42],[141,45],[136,45],[130,38]],
  // Australien
  [
    [114,-22],[122,-14],[136,-12],[138,-14],[144,-18],
    [148,-20],[154,-28],[151,-34],[150,-38],[146,-42],
    [128,-32],[122,-34],[114,-26],[114,-22],
  ],
  // Neuseeland (grob)
  [[166,-46],[175,-38],[172,-34],[170,-46]],
  // Antarktis
  [[-180,-70],[180,-70],[180,-90],[-180,-90]],
];

function buildTexture(oceanHex: string): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Ozean-Gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   "#061428");
  grad.addColorStop(0.5, oceanHex);
  grad.addColorStop(1,   "#061428");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const xy = (lon: number, lat: number): [number, number] => [
    ((lon + 180) / 360) * W,
    ((90 - lat) / 180) * H,
  ];

  // Kontinente — Atlas-Grün (gedämpft, wie Schulatlas)
  ctx.fillStyle   = "#4a7c52";
  ctx.strokeStyle = "#3a6040";
  ctx.lineWidth   = 1;

  for (const poly of CONTINENTS) {
    if (poly.length < 3) continue;
    ctx.beginPath();
    const [x0, y0] = xy(poly[0][0], poly[0][1]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < poly.length; i++) {
      const [x, y] = xy(poly[i][0], poly[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Gitternetz (Äquator + Wendekreise + Polarkreise dicker/heller)
  const drawLat = (lat: number, alpha: number, width: number) => {
    const y = ((90 - lat) / 180) * H;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth   = width;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  };
  const drawLon = (lon: number, alpha: number, width: number) => {
    const x = ((lon + 180) / 360) * W;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth   = width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  };

  // Reguläre Gitterlinien
  for (let lat = -75; lat <= 75; lat += 15) drawLat(lat, 0.12, 0.6);
  for (let lon = -165; lon <= 165; lon += 15) drawLon(lon, 0.12, 0.6);

  // Äquator
  drawLat(0, 0.35, 1.2);
  // Wendekreise
  drawLat(23.5,  0.20, 0.8);
  drawLat(-23.5, 0.20, 0.8);
  // Polarkreise
  drawLat(66.5,  0.18, 0.7);
  drawLat(-66.5, 0.18, 0.7);
  // Nullmeridian
  drawLon(0, 0.30, 1.0);
  // Datumsgrenze
  drawLon(180, 0.18, 0.7);

  return new THREE.CanvasTexture(canvas);
}

function Globe({ emotion, speaking }: Props) {
  const globeRef = useRef<THREE.Mesh>(null);
  const atmosRef = useRef<THREE.Mesh>(null);
  const glowRef  = useRef<THREE.Mesh>(null);

  const texture = useMemo(
    () => buildTexture(OCEAN_COLOR[emotion ?? "ruhig"] ?? "#1a5a8c"),
    [emotion],
  );

  useFrame(({ clock }) => {
    const t   = clock.elapsedTime;
    const spd = speaking ? 2.2 : 1;

    if (globeRef.current) {
      globeRef.current.rotation.y += 0.003 * spd;
      globeRef.current.rotation.x = Math.sin(t * 0.25) * 0.04;
    }
    if (atmosRef.current) {
      (atmosRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.10 + Math.sin(t * 1.3) * 0.025;
    }
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = speaking
        ? 0.10 + Math.abs(Math.sin(t * 3)) * 0.05
        : 0.05 + Math.sin(t * 1.0) * 0.02;
    }
  });

  return (
    <group>
      {/* Globus mit Canvas-Textur */}
      <mesh ref={globeRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial map={texture} />
      </mesh>

      {/* Atmosphären-Halo */}
      <mesh ref={atmosRef}>
        <sphereGeometry args={[1.06, 32, 32]} />
        <meshBasicMaterial
          color="#6ab4ff"
          transparent
          opacity={0.10}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Äusserer Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.18, 24, 24]} />
        <meshBasicMaterial
          color="#3a8ad4"
          transparent
          opacity={0.05}
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
      camera={{ position: [0, 0, 3.0], fov: 40 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <Globe emotion={emotion} speaking={speaking} />
    </Canvas>
  );
}
