import { useId, useMemo } from "react";

const BG = "#0a0f1a";
const H = 320;
const W = 560;

function labelProps(x, y, size = 10) {
  return {
    x,
    y,
    fill: "#f1f5f9",
    fontSize: size,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontWeight: "500",
    style: { filter: "drop-shadow(0 0 4px rgba(255,255,255,0.35))" },
  };
}

function SvgShell({ title, children, className = "" }) {
  return (
    <figure
      className={[
        "w-full overflow-hidden rounded-lg border border-emerald-400/30 shadow-[inset_0_0_48px_rgba(52,211,153,0.07),0_0_28px_rgba(52,211,153,0.14)]",
        className,
      ].join(" ")}
      style={{ backgroundColor: BG }}
      aria-label={title}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-[320px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        <title>{title}</title>
        {children}
      </svg>
    </figure>
  );
}

/** Exported for tests / reuse — merges optional topic hint into detection text. */
export function detectAnatomyTopic(category, explanation, topic = "") {
  const text = `${category || ""} ${explanation || ""} ${topic || ""}`.toLowerCase();
  if (text.includes("heart") || text.includes("cardiac") || text.includes("cardiovascular")) return "heart";
  if (
    text.includes("lung") ||
    text.includes("respiratory") ||
    text.includes("breathing") ||
    text.includes("pulmonary")
  )
    return "lungs";
  if (text.includes("brain") || text.includes("neuro") || text.includes("mental") || text.includes("cognitive"))
    return "brain";
  if (text.includes("stomach") || text.includes("digest") || text.includes("intestine") || text.includes("gut"))
    return "digestive";
  if (text.includes("gene") || text.includes("cell") || text.includes("dna") || text.includes("cancer"))
    return "dna";
  return "body";
}

function HeartDiagram() {
  const uid = useId().replace(/:/g, "");
  const m = { end: `url(#${uid}-arrR)`, endB: `url(#${uid}-arrB)` };

  return (
    <SvgShell title="Human heart — chambers and blood flow (schematic)">
      <defs>
        <marker id={`${uid}-arrR`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="#f87171" />
        </marker>
        <marker id={`${uid}-arrB`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="#60a5fa" />
        </marker>
      </defs>

      <path
        d="M280 42 C340 38 395 72 415 125 C428 165 418 218 385 258 C355 292 315 298 280 295 C245 298 205 292 175 258 C142 218 132 165 145 125 C165 72 220 38 280 42 Z"
        fill="rgba(248,113,113,0.08)"
        stroke="#e2e8f0"
        strokeWidth="2"
      />
      <path d="M280 62 L280 268" stroke="#cbd5e1" strokeWidth="2" opacity="0.85" />
      <path d="M155 148 L405 148" stroke="#cbd5e1" strokeWidth="2" opacity="0.85" />

      <path
        d="M165 72 L268 72 Q275 72 275 80 L275 138 Q275 145 268 145 L165 145 Q158 145 158 138 L158 80 Q158 72 165 72 Z"
        fill="rgba(239,68,68,0.42)"
        stroke="#fecaca"
        strokeWidth="1.5"
      />
      <path
        d="M292 72 L395 72 Q402 72 402 80 L402 138 Q402 145 395 145 L292 145 Q285 145 285 138 L285 80 Q285 72 292 72 Z"
        fill="rgba(248,113,113,0.38)"
        stroke="#fecaca"
        strokeWidth="1.5"
      />
      <path
        d="M158 158 L268 158 Q275 158 275 165 L275 248 Q275 258 265 262 L175 272 Q158 275 158 258 Z"
        fill="rgba(220,38,38,0.45)"
        stroke="#fca5a5"
        strokeWidth="1.5"
      />
      <path
        d="M292 158 L402 158 Q408 158 408 165 L408 248 Q408 268 385 272 L292 262 Q285 258 285 248 L285 165 Q285 158 292 158 Z"
        fill="rgba(185,28,28,0.48)"
        stroke="#fca5a5"
        strokeWidth="1.5"
      />

      <ellipse cx="335" cy="52" rx="38" ry="14" fill="rgba(239,68,68,0.55)" stroke="#fecaca" strokeWidth="1.5" />
      <text {...labelProps(298, 56, 9)} fill="#fecdd3">
        Aorta
      </text>
      <ellipse cx="225" cy="48" rx="42" ry="13" fill="rgba(96,165,250,0.45)" stroke="#93c5fd" strokeWidth="1.5" />
      <text {...labelProps(168, 52, 9)} fill="#bfdbfe">
        Pulmonary Artery
      </text>

      <path d="M55 118 L148 118" stroke="#ef4444" strokeWidth="3.5" fill="none" markerEnd={m.end} />
      <path d="M328 155 L328 228" stroke="#ef4444" strokeWidth="3.5" fill="none" markerEnd={m.end} />
      <path d="M355 268 L355 295" stroke="#ef4444" strokeWidth="3.5" fill="none" markerEnd={m.end} />
      <path d="M412 118 L498 118" stroke="#ef4444" strokeWidth="3.5" fill="none" markerEnd={m.end} />
      <path d="M498 138 L415 138" stroke="#3b82f6" strokeWidth="3.5" fill="none" markerEnd={m.endB} />
      <path d="M212 155 L212 248" stroke="#3b82f6" strokeWidth="3.5" fill="none" markerEnd={m.endB} />
      <path d="M155 268 L155 298" stroke="#3b82f6" strokeWidth="3.5" fill="none" markerEnd={m.endB} />
      <path d="M62 158 L148 158" stroke="#3b82f6" strokeWidth="3.5" fill="none" markerEnd={m.endB} />

      <text {...labelProps(178, 132)}>Right Atrium</text>
      <text {...labelProps(318, 132)}>Left Atrium</text>
      <text {...labelProps(172, 220)}>Right Ventricle</text>
      <text {...labelProps(325, 220)}>Left Ventricle</text>
      <text {...labelProps(380, 18, 9)} fill="#fecaca">
        Oxygenated (red arrows)
      </text>
      <text {...labelProps(28, 18, 9)} fill="#93c5fd">
        Deoxygenated (blue arrows)
      </text>
    </SvgShell>
  );
}

function BrainDiagram() {
  const uid = useId().replace(/:/g, "");
  return (
    <SvgShell title="Human brain — lateral view with lobes (schematic)">
      <defs>
        <filter id={`${uid}-glow`} x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer outline */}
      <path
        d="M95 210 Q88 140 112 95 Q145 42 215 35 Q295 28 355 62 Q395 95 408 155 Q418 205 395 248 Q372 285 318 298 Q268 305 218 292 Q155 278 115 238 Q95 218 95 210 Z"
        fill="rgba(15,23,42,0.35)"
        stroke="#e2e8f0"
        strokeWidth="2"
      />

      <g className="anatomy-brain-glow">
        {/* Frontal — blue */}
        <path
          d="M115 95 Q180 48 258 42 Q268 120 248 158 Q185 142 122 155 Q108 125 115 95 Z"
          fill="rgba(59,130,246,0.42)"
          stroke="#93c5fd"
          strokeWidth="1.5"
          filter={`url(#${uid}-glow)`}
        />
        <text {...labelProps(145, 95, 10)}>Frontal</text>

        {/* Parietal — green */}
        <path
          d="M260 42 Q330 52 372 95 Q378 138 348 178 Q298 165 252 158 Q268 105 260 42 Z"
          fill="rgba(34,197,94,0.42)"
          stroke="#86efac"
          strokeWidth="1.5"
        />
        <text {...labelProps(295, 108, 10)}>Parietal</text>

        {/* Temporal — purple */}
        <path
          d="M118 158 Q165 165 218 178 Q248 218 268 268 Q218 282 178 268 Q142 218 118 158 Z"
          fill="rgba(147,51,234,0.42)"
          stroke="#d8b4fe"
          strokeWidth="1.5"
        />
        <text {...labelProps(155, 215, 10)}>Temporal</text>

        {/* Occipital — orange */}
        <path
          d="M348 178 Q395 155 398 205 Q392 248 358 278 Q322 268 298 238 Q318 205 348 178 Z"
          fill="rgba(249,115,22,0.42)"
          stroke="#fdba74"
          strokeWidth="1.5"
        />
        <text {...labelProps(338, 225, 10)}>Occipital</text>

        {/* Cerebellum — pink */}
        <path
          d="M278 268 Q318 248 358 278 Q348 298 305 305 Q268 302 258 278 Q268 272 278 268 Z"
          fill="rgba(236,72,153,0.48)"
          stroke="#fbcfe8"
          strokeWidth="1.5"
        />
        <text {...labelProps(298, 292, 10)}>Cerebellum</text>

        {/* Brain stem — gray */}
        <path d="M238 278 L248 312 L278 318 L292 278 Z" fill="rgba(148,163,184,0.65)" stroke="#cbd5e1" strokeWidth="1.5" />
        <text {...labelProps(248, 308, 9)} fill="#e2e8f0">
          Brain Stem
        </text>
      </g>
    </SvgShell>
  );
}

function LungsDiagram() {
  const uid = useId().replace(/:/g, "");
  return (
    <SvgShell title="Lungs — trachea, bronchi, diaphragm (schematic)">
      <defs>
        <linearGradient id={`${uid}-tr`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fecdd3" />
          <stop offset="100%" stopColor="#fda4af" />
        </linearGradient>
      </defs>

      <rect
        x="268"
        y="22"
        width="24"
        height="58"
        rx="6"
        fill={`url(#${uid}-tr)`}
        stroke="#e2e8f0"
        strokeWidth="1.5"
      />
      <text {...labelProps(255, 18, 10)}>Trachea</text>

      <path d="M268 78 L228 105 L155 145" stroke="#fecdd3" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M292 78 L332 105 L405 145" stroke="#fecdd3" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M215 118 L175 158" stroke="#fb7185" strokeWidth="3" fill="none" opacity="0.7" />
      <path d="M345 118 L385 158" stroke="#fb7185" strokeWidth="3" fill="none" opacity="0.7" />
      <path d="M175 158 L155 188 L142 212" stroke="#fda4af" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.65" />
      <path d="M175 158 L192 198" stroke="#fda4af" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.65" />
      <path d="M385 158 L405 192 L418 222" stroke="#fda4af" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.65" />
      <path d="M385 158 L368 198" stroke="#fda4af" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.65" />
      <path d="M220 128 L198 145" stroke="#fda4af" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M340 128 L362 145" stroke="#fda4af" strokeWidth="1.5" fill="none" opacity="0.5" />

      <g className="anatomy-lungs-breathe" style={{ transformOrigin: "280px 175px" }}>
        <path
          d="M320 125 Q395 105 435 155 Q452 218 418 268 Q385 298 338 285 Q305 238 318 175 Q318 145 320 125 Z"
          fill="rgba(251,113,133,0.38)"
          stroke="#e2e8f0"
          strokeWidth="2"
        />
        <path
          d="M330 145 Q375 138 408 175 Q418 215 395 248"
          fill="none"
          stroke="#fb7185"
          strokeWidth="1.2"
          opacity="0.45"
        />
        <text {...labelProps(380, 198, 10)}>Right Lung</text>

        <path
          d="M240 125 Q165 105 125 155 Q108 218 142 268 Q175 298 222 285 Q255 238 242 175 Q242 145 240 125 Z"
          fill="rgba(251,113,133,0.38)"
          stroke="#e2e8f0"
          strokeWidth="2"
        />
        <path
          d="M230 145 Q185 138 152 175 Q142 215 165 248"
          fill="none"
          stroke="#fb7185"
          strokeWidth="1.2"
          opacity="0.45"
        />
        <text {...labelProps(135, 198, 10)}>Left Lung</text>
      </g>

      <path
        d="M72 278 Q165 248 280 258 Q395 248 488 278 L488 292 L72 292 Z"
        fill="rgba(52,211,153,0.18)"
        stroke="#e2e8f0"
        strokeWidth="2"
      />
      <text {...labelProps(238, 308, 10)}>Diaphragm</text>
    </SvgShell>
  );
}

function DnaDiagram() {
  const cx = 280;
  const steps = 15;
  const amp = 78;
  const dy = 16;
  const y0 = 28;
  let pathA = "";
  let pathB = "";
  const rungs = [];
  for (let i = 0; i <= steps; i++) {
    const y = y0 + i * dy;
    const ang = i * 0.72;
    const xa = cx + Math.cos(ang) * amp;
    const xb = cx + Math.cos(ang + Math.PI) * amp;
    pathA += i === 0 ? `M ${xa.toFixed(1)} ${y}` : ` L ${xa.toFixed(1)} ${y}`;
    pathB += i === 0 ? `M ${xb.toFixed(1)} ${y}` : ` L ${xb.toFixed(1)} ${y}`;
    if (i < steps) {
      rungs.push(
        <line
          key={i}
          x1={xa}
          y1={y}
          x2={xb}
          y2={y}
          stroke="#a5f3fc"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.82"
        />
      );
    }
  }

  return (
    <SvgShell title="DNA — double helix (schematic)">
      <g className="anatomy-dna-spin" style={{ transformOrigin: "280px 148px" }}>
        <path d={pathA} fill="none" stroke="#22d3ee" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathB} fill="none" stroke="#38bdf8" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        {rungs}
      </g>
      <circle cx="155" cy="52" r="5" fill="#22d3ee" opacity="0.85" />
      <text {...labelProps(168, 56, 10)} fill="#67e8f9">
        Sugar-phosphate backbone
      </text>
      <circle cx="155" cy="148" r="5" fill="#a5f3fc" opacity="0.85" />
      <text {...labelProps(168, 152, 10)} fill="#a5f3fc">
        Base pairs (A–T, G–C)
      </text>
      <circle cx="155" cy="248" r="5" fill="#64748b" opacity="0.85" />
      <text {...labelProps(168, 252, 10)} fill="#94a3b8">
        Nucleotide (unit along backbone)
      </text>
      <text {...labelProps(368, 148, 10)} fill="#64748b">
        Rotation
      </text>
    </SvgShell>
  );
}

function DigestiveDiagram() {
  return (
    <SvgShell title="Digestive system — major organs (schematic)">
      {/* Esophagus */}
      <path d="M268 28 L268 95" stroke="#fdba74" strokeWidth="16" strokeLinecap="round" opacity="0.55" />
      <path d="M268 28 L268 95" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
      <text {...labelProps(282, 68, 10)}>Esophagus</text>

      {/* Stomach */}
      <path
        d="M238 105 Q218 145 228 188 Q238 218 268 228 Q305 218 322 185 Q332 145 298 112 Q275 98 268 105 Q255 102 238 105 Z"
        fill="rgba(251,146,60,0.45)"
        stroke="#e2e8f0"
        strokeWidth="2"
      />
      <text {...labelProps(328, 168, 10)}>Stomach</text>

      {/* Liver */}
      <path
        d="M305 78 Q385 72 418 118 Q428 155 398 185 Q355 175 318 155 Q298 118 305 78 Z"
        fill="rgba(180,83,9,0.48)"
        stroke="#e2e8f0"
        strokeWidth="2"
      />
      <text {...labelProps(355, 128, 10)}>Liver</text>

      {/* Small intestine */}
      <path
        d="M248 235 Q218 248 195 268 Q185 288 215 298 Q255 305 285 292 Q318 278 338 252 Q328 235 298 228 Q268 232 248 235 Z"
        fill="rgba(250,204,21,0.35)"
        stroke="#e2e8f0"
        strokeWidth="1.8"
      />
      <path
        d="M225 248 Q255 262 285 255 Q308 248 318 268"
        fill="none"
        stroke="#fde047"
        strokeWidth="2"
        opacity="0.6"
      />
      <text {...labelProps(118, 268, 10)}>Small Intestine</text>

      {/* Large intestine (frame) */}
      <path
        d="M135 215 Q118 175 135 138 Q155 105 195 118 Q175 155 165 195 Q158 248 185 288 Q218 305 268 298 Q338 298 395 268 Q418 228 408 178 Q392 138 358 118"
        fill="none"
        stroke="rgba(34,197,94,0.55)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M135 215 Q118 175 135 138 Q155 105 195 118 Q175 155 165 195 Q158 248 185 288 Q218 305 268 298 Q338 298 395 268 Q418 228 408 178 Q392 138 358 118"
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text {...labelProps(418, 208, 10)}>Large Intestine</text>
    </SvgShell>
  );
}

function BodyDiagram() {
  return (
    <SvgShell title="Human torso — major organs (front view, schematic)">
      {/* Outline */}
      <path
        d="M280 38 C310 38 328 58 328 82 C335 92 348 105 358 118 C388 158 395 218 382 278 C375 298 348 312 318 318 C298 322 278 322 258 318 C228 312 205 298 198 278 C185 218 192 158 218 118 C228 105 242 92 248 82 C248 58 268 38 280 38 Z"
        fill="rgba(15,23,42,0.25)"
        stroke="#e2e8f0"
        strokeWidth="2.5"
      />

      {/* Brain */}
      <ellipse cx="278" cy="72" rx="52" ry="38" fill="rgba(167,139,250,0.38)" stroke="#e2e8f0" strokeWidth="1.5" />
      <text {...labelProps(268, 48, 9)}>Brain</text>

      {/* Lungs */}
      <ellipse cx="218" cy="158" rx="42" ry="62" fill="rgba(251,113,133,0.35)" stroke="#e2e8f0" strokeWidth="1.5" />
      <ellipse cx="342" cy="158" rx="42" ry="62" fill="rgba(251,113,133,0.35)" stroke="#e2e8f0" strokeWidth="1.5" />
      <text {...labelProps(158, 128, 9)}>Lungs</text>

      {/* Heart */}
      <path
        d="M268 128 C288 118 312 132 305 158 C302 178 278 195 278 195 C278 195 255 178 252 158 C245 132 268 118 278 128"
        fill="rgba(239,68,68,0.48)"
        stroke="#e2e8f0"
        strokeWidth="1.5"
      />
      <text {...labelProps(315, 168, 9)}>Heart</text>

      {/* Liver */}
      <path
        d="M318 178 Q368 172 378 208 Q382 238 348 258 Q318 248 305 218 Q298 188 318 178 Z"
        fill="rgba(180,83,9,0.42)"
        stroke="#e2e8f0"
        strokeWidth="1.5"
      />
      <text {...labelProps(388, 218, 9)}>Liver</text>

      {/* Stomach */}
      <ellipse cx="238" cy="218" rx="38" ry="35" fill="rgba(251,146,60,0.42)" stroke="#e2e8f0" strokeWidth="1.5" />
      <text {...labelProps(148, 228, 9)}>Stomach</text>

      {/* Leader lines */}
      <path d="M268 52 L248 35" stroke="#94a3b8" strokeWidth="1" opacity="0.6" />
      <path d="M178 158 L142 148" stroke="#94a3b8" strokeWidth="1" opacity="0.6" />
      <path d="M292 158 L355 148" stroke="#94a3b8" strokeWidth="1" opacity="0.6" />
      <path d="M278 165 L355 165" stroke="#94a3b8" strokeWidth="1" opacity="0.6" />
      <path d="M348 218 L418 208" stroke="#94a3b8" strokeWidth="1" opacity="0.6" />
      <path d="M238 218 L178 218" stroke="#94a3b8" strokeWidth="1" opacity="0.6" />
    </SvgShell>
  );
}

function DiagramForTopic({ resolved }) {
  switch (resolved) {
    case "heart":
      return (
        <div className="anatomy-heart-pulse" style={{ transformOrigin: "center center" }}>
          <HeartDiagram />
        </div>
      );
    case "lungs":
      return <LungsDiagram />;
    case "brain":
      return <BrainDiagram />;
    case "digestive":
      return <DigestiveDiagram />;
    case "dna":
      return <DnaDiagram />;
    default:
      return <BodyDiagram />;
  }
}

/**
 * Detailed anatomical SVG diagrams for Health Agent (inline, no external images).
 *
 * @param {{ category?: string, explanation?: string, topic?: string }} props
 */
export default function AnatomyVisual({ category = "", explanation = "", topic = "" }) {
  const resolved = useMemo(
    () => detectAnatomyTopic(category, explanation, topic),
    [category, explanation, topic]
  );

  return (
    <div className="w-full">
      <style>{`
        @keyframes anatomy-heart-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        .anatomy-heart-pulse {
          animation: anatomy-heart-pulse 1.05s ease-in-out infinite;
        }
        @keyframes anatomy-lungs-breathe {
          0%, 100% { transform: scaleY(1) scaleX(1); }
          50% { transform: scaleY(1.055) scaleX(1.02); }
        }
        .anatomy-lungs-breathe {
          animation: anatomy-lungs-breathe 3.4s ease-in-out infinite;
        }
        @keyframes anatomy-brain-glow {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(147,197,253,0.4)); }
          50% { filter: drop-shadow(0 0 12px rgba(134,239,172,0.55)); }
        }
        .anatomy-brain-glow {
          animation: anatomy-brain-glow 2.6s ease-in-out infinite;
        }
        @keyframes anatomy-dna-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .anatomy-dna-spin {
          animation: anatomy-dna-spin 18s linear infinite;
        }
      `}</style>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-green-400/85">
        Anatomy visual
      </p>
      <DiagramForTopic resolved={resolved} />
    </div>
  );
}
