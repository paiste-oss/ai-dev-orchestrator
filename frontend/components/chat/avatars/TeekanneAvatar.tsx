"use client";

import { useEffect, useRef } from "react";

const EMOTION_STYLE: Record<string, { fill: string; mouthRy: number }> = {
  freudig:      { fill: "#a855f7", mouthRy: 7 },
  nachdenklich: { fill: "#6366f1", mouthRy: 2 },
  traurig:      { fill: "#64748b", mouthRy: 3 },
  überrascht:   { fill: "#ec4899", mouthRy: 9 },
  ruhig:        { fill: "#8b5cf6", mouthRy: 4 },
  aufmunternd:  { fill: "#f97316", mouthRy: 7 },
  neugierig:    { fill: "#7c3aed", mouthRy: 5 },
  empathisch:   { fill: "#e879f9", mouthRy: 5 },
};

interface Props {
  emotion?: string | null;
  speaking?: boolean;
}

export default function TeekanneAvatar({ emotion, speaking }: Props) {
  const bodyRef  = useRef<SVGEllipseElement>(null);
  const mouthRef = useRef<SVGEllipseElement>(null);

  useEffect(() => {
    const e = EMOTION_STYLE[emotion ?? "ruhig"] ?? EMOTION_STYLE.ruhig;
    bodyRef.current?.setAttribute("fill", e.fill);
    mouthRef.current?.setAttribute("ry", String(e.mouthRy));
  }, [emotion]);

  const bodyClass  = `tk-body${speaking ? " sp" : ""}`;
  const lidClass   = `tk-lid${speaking  ? " sp" : ""}`;
  const mouthClass = `tk-mouth${speaking ? " sp" : ""}`;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        .tk-body  { transform-origin: 100px 138px; animation: tkWobble 2.2s ease-in-out infinite; }
        .tk-body.sp { animation: tkWobble 0.35s ease-in-out infinite; }
        .tk-lid   { transform-origin: 100px 92px; }
        .tk-lid.sp  { animation: tkLid 0.3s ease-in-out infinite; }
        .tk-eye   { animation: tkBlink 5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .tk-eye:nth-child(2) { animation-delay: 0.12s; }
        .tk-mouth { transform-box: fill-box; transform-origin: center; }
        .tk-mouth.sp { animation: tkTalk 0.18s ease-in-out infinite; }
        @keyframes tkWobble { 0%,100%{transform:rotate(0deg)} 30%{transform:rotate(-3deg)} 70%{transform:rotate(3deg)} }
        @keyframes tkLid    { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-9px) rotate(4deg)} }
        @keyframes tkBlink  { 0%,88%,100%{transform:scaleY(1)} 94%{transform:scaleY(0.08)} }
        @keyframes tkTalk   { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(0.15)} }
        @keyframes tkSteam  {
          0%   { transform:translateY(0) scale(0.6); opacity:0; }
          25%  { opacity:0.65; }
          100% { transform:translateY(-36px) scale(1.5); opacity:0; }
        }
      `}</style>

      <div style={{ position: "relative", width: "88%", maxWidth: 176, aspectRatio: "1" }}>
        {/* Dampf */}
        <div style={{ position: "absolute", top: 6, left: "62%", pointerEvents: "none" }}>
          {([
            { w: 9,  h: 9,  l: 0,   t: 0, delay: "0s"    },
            { w: 7,  h: 7,  l: 13,  t: 3, delay: "0.55s" },
            { w: 8,  h: 8,  l: -8,  t: 4, delay: "1.1s"  },
          ] as const).map((p, i) => (
            <div key={i} style={{
              position: "absolute",
              width: p.w, height: p.h, left: p.l, top: p.t,
              borderRadius: "50%",
              background: "rgba(210,210,255,0.55)",
              animation: `tkSteam 1.9s ease-out ${p.delay} infinite`,
            }} />
          ))}
        </div>

        <svg viewBox="0 0 200 210" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
          {/* Schatten */}
          <ellipse cx="100" cy="200" rx="55" ry="7" fill="rgba(0,0,0,0.18)" />
          {/* Griff */}
          <path d="M42,110 C16,112 14,152 42,157" stroke="#9333ea" strokeWidth="14" fill="none" strokeLinecap="round" />
          {/* Körper */}
          <g className={bodyClass}>
            <ellipse ref={bodyRef} cx="100" cy="138" rx="63" ry="53" fill="#7c3aed" />
            <ellipse cx="100" cy="138" rx="56" ry="46" fill="#a78bfa" opacity="0.22" />
            <ellipse cx="80" cy="114" rx="14" ry="7" fill="rgba(255,255,255,0.18)" transform="rotate(-20,80,114)" />
          </g>
          {/* Tülle */}
          <path d="M161,120 C180,110 186,90 180,74" stroke="#9333ea" strokeWidth="14" fill="none" strokeLinecap="round" />
          <circle cx="180" cy="72" r="5" fill="#a78bfa" />
          {/* Deckel */}
          <g className={lidClass}>
            <ellipse cx="100" cy="94" rx="43" ry="11" fill="#6d28d9" />
            <ellipse cx="100" cy="91" rx="39" ry="9"  fill="#7c3aed" />
            <ellipse cx="100" cy="82" rx="17" ry="10" fill="#6d28d9" />
            <circle  cx="100" cy="73" r="8"            fill="#8b5cf6" />
          </g>
          {/* Auge links */}
          <g className="tk-eye">
            <ellipse cx="83"   cy="136" rx="8.5" ry="9.5" fill="white" />
            <circle  cx="85"   cy="136" r="4.5"           fill="#1a0045" />
            <circle  cx="86.5" cy="134" r="1.5"           fill="white" />
          </g>
          {/* Auge rechts */}
          <g className="tk-eye">
            <ellipse cx="117"  cy="136" rx="8.5" ry="9.5" fill="white" />
            <circle  cx="119"  cy="136" r="4.5"           fill="#1a0045" />
            <circle  cx="120.5" cy="134" r="1.5"          fill="white" />
          </g>
          {/* Mund */}
          <ellipse ref={mouthRef} className={mouthClass} cx="100" cy="155" rx="12" ry="4" fill="white" />
        </svg>
      </div>
    </div>
  );
}
