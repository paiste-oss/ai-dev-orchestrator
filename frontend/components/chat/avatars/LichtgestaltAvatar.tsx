"use client";

import { useEffect, useRef } from "react";

const EMOTION_HSL: Record<string, [number, number, number]> = {
  freudig:      [45,  92, 65],
  nachdenklich: [220, 72, 60],
  traurig:      [232, 32, 48],
  überrascht:   [282, 85, 70],
  ruhig:        [178, 58, 55],
  aufmunternd:  [28,  96, 62],
  neugierig:    [268, 65, 64],
  empathisch:   [328, 72, 65],
};

interface Props {
  emotion?: string | null;
  speaking?: boolean;
}

export default function LichtgestaltAvatar({ emotion, speaking }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref damit der Animations-Loop immer aktuelle Werte sieht
  const stateRef = useRef({ emotion: emotion ?? "ruhig", speaking: speaking ?? false });

  useEffect(() => {
    stateRef.current = { emotion: emotion ?? "ruhig", speaking: speaking ?? false };
  }, [emotion, speaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2, cy = H / 2;

    const N = 45;
    const parts = Array.from({ length: N }, (_, i) => ({
      angle: (i / N) * Math.PI * 2 + Math.random() * 0.3,
      r:     38 + Math.random() * 32,
      speed: 0.004 + Math.random() * 0.009,
      size:  1.2 + Math.random() * 2.8,
      op:    0.3 + Math.random() * 0.55,
      layer: i % 3,
    }));

    let t = 0;
    let raf: number;

    function draw() {
      const { emotion: em, speaking: sp } = stateRef.current;
      const [h, s, l] = EMOTION_HSL[em] ?? [200, 60, 60];
      const spd   = sp ? 2.6 : 1;
      const pulse = 1 + 0.14 * Math.sin(t * (sp ? 6.5 : 2));

      ctx.clearRect(0, 0, W, H);

      // Äusserer Glanz
      for (let i = 4; i >= 1; i--) {
        const gr = 65 * pulse * i * 0.45;
        const ga = (0.055 / i) * (1 + 0.28 * Math.sin(t * 1.3));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
        g.addColorStop(0, `hsla(${h},${s}%,${l}%,${ga * 3.5})`);
        g.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
        ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }

      // Partikel
      parts.forEach(p => {
        p.angle += p.speed * spd * (1 + p.layer * 0.25);
        const pr = p.r * pulse * (0.78 + p.layer * 0.18);
        const x  = cx + Math.cos(p.angle) * pr;
        const y  = cy + Math.sin(p.angle) * pr * 0.72;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (sp ? 1.35 : 1), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${h + 18},${s}%,${Math.min(l + 22, 94)}%,${p.op})`;
        ctx.fill();
      });

      // Kern-Orb
      const cr = 22 * pulse;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
      cg.addColorStop(0,    `hsla(${h},${s}%,${Math.min(l + 32, 96)}%,1)`);
      cg.addColorStop(0.55, `hsla(${h},${s}%,${l}%,0.7)`);
      cg.addColorStop(1,    `hsla(${h},${s}%,${l}%,0)`);
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fillStyle = cg; ctx.fill();

      // Gesicht
      const eyeColor = `hsla(${h},${s}%,${Math.min(l + 38, 97)}%,0.92)`;
      if (!sp) {
        ctx.fillStyle = eyeColor;
        ctx.beginPath(); ctx.arc(cx - 9, cy - 5, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 9, cy - 5, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy + 4, 8, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.strokeStyle = eyeColor; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - 11, cy + 8);
        for (let i = 0; i <= 22; i++) {
          ctx.lineTo(cx - 11 + i, cy + 8 + Math.sin((i / 3.5) + t * 9) * 3);
        }
        ctx.strokeStyle = eyeColor; ctx.lineWidth = 2.2; ctx.stroke();
      }

      t += 0.022;
      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, []); // einmalig — stateRef hält aktuelle Werte

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
