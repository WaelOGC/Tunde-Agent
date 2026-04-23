import React from "react";

const VALID = new Set(["IDLE", "LISTENING", "THINKING", "SPEAKING"]);

let avatarMiniStylesInjected = false;

function ensureAvatarMiniStyles() {
  if (avatarMiniStylesInjected || typeof document === "undefined") return;
  avatarMiniStylesInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-tde-avatar-mini", "1");
  el.textContent = `
@keyframes tde-avatar-listen-pulse {
  0%, 100% {
    transform: scale(1);
    filter: drop-shadow(0 0 5px rgba(45, 212, 191, 0.38)) drop-shadow(0 0 12px rgba(99, 102, 241, 0.28));
  }
  50% {
    transform: scale(1.05);
    filter: drop-shadow(0 0 10px rgba(45, 212, 191, 0.58)) drop-shadow(0 0 20px rgba(129, 140, 248, 0.45));
  }
}
@keyframes tde-avatar-shimmer {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes tde-avatar-think-hue {
  0%, 100% { opacity: 0.92; }
  50% { opacity: 1; }
}
@keyframes tde-avatar-speak-bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}
@keyframes tde-avatar-speak-ring {
  0% { box-shadow: 0 0 0 0 rgba(167, 139, 250, 0.55), 0 0 12px rgba(34, 211, 238, 0.35); }
  65% { box-shadow: 0 0 0 9px rgba(167, 139, 250, 0), 0 0 22px rgba(167, 139, 250, 0.45); }
  100% { box-shadow: 0 0 0 0 rgba(167, 139, 250, 0), 0 0 12px rgba(34, 211, 238, 0.35); }
}

.tde-avatar-mini {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  isolation: isolate;
  transition: filter 0.45s ease-in-out, transform 0.45s ease-in-out;
}
.tde-avatar-mini__disk {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: background 0.5s ease-in-out, box-shadow 0.5s ease-in-out;
}
.tde-avatar-mini__label {
  position: relative;
  z-index: 2;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  color: rgba(15, 23, 42, 0.88);
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
  pointer-events: none;
  user-select: none;
}
.tde-avatar-mini__halo {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease-in-out;
}

/* IDLE */
.tde-avatar-mini[data-state="IDLE"] {
  transform: scale(1);
  filter: drop-shadow(0 0 4px rgba(45, 212, 191, 0.32)) drop-shadow(0 0 10px rgba(99, 102, 241, 0.18));
}
.tde-avatar-mini[data-state="IDLE"] .tde-avatar-mini__disk {
  background: linear-gradient(145deg, #2dd4bf 0%, #22d3ee 42%, #6b7ff5 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

/* LISTENING */
.tde-avatar-mini[data-state="LISTENING"] {
  animation: tde-avatar-listen-pulse 1.15s ease-in-out infinite;
}
.tde-avatar-mini[data-state="LISTENING"] .tde-avatar-mini__disk {
  background: linear-gradient(145deg, #2dd4bf 0%, #38bdf8 48%, #6366f1 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

/* THINKING */
.tde-avatar-mini[data-state="THINKING"] {
  filter: drop-shadow(0 0 7px rgba(139, 92, 246, 0.5)) drop-shadow(0 0 16px rgba(79, 70, 229, 0.35));
}
.tde-avatar-mini[data-state="THINKING"] .tde-avatar-mini__disk {
  background: linear-gradient(
    118deg,
    #4f46e5 0%,
    #6366f1 18%,
    #7c3aed 38%,
    #22d3ee 58%,
    #8b5cf6 78%,
    #4f46e5 100%
  );
  background-size: 260% 260%;
  animation: tde-avatar-shimmer 2.6s ease-in-out infinite, tde-avatar-think-hue 1.8s ease-in-out infinite;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}
.tde-avatar-mini[data-state="THINKING"] .tde-avatar-mini__halo {
  opacity: 0.55;
  background: conic-gradient(from 0deg, #22d3ee, #a78bfa, #6366f1, #22d3ee);
  animation: tde-avatar-halo-spin 3.2s linear infinite;
}
@keyframes tde-avatar-halo-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* SPEAKING */
.tde-avatar-mini[data-state="SPEAKING"] {
  animation: tde-avatar-speak-ring 1.2s ease-out infinite;
  filter: drop-shadow(0 0 12px rgba(167, 139, 250, 0.65)) drop-shadow(0 0 24px rgba(34, 211, 238, 0.38));
}
.tde-avatar-mini[data-state="SPEAKING"] .tde-avatar-mini__disk {
  background: linear-gradient(145deg, #22d3ee 0%, #818cf8 45%, #c084fc 100%);
  animation: tde-avatar-speak-bounce 0.52s ease-in-out infinite;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.26);
}
`;
  document.head.appendChild(el);
}

export default function AvatarMini({ state }) {
  ensureAvatarMiniStyles();

  const raw = String(state ?? "IDLE").toUpperCase();
  const visualState = VALID.has(raw) ? raw : "IDLE";

  return (
    <div className="tde-avatar-mini" data-state={visualState}>
      <div className="tde-avatar-mini__halo" aria-hidden />
      <div className="tde-avatar-mini__disk">
        <span className="tde-avatar-mini__label">{state}</span>
      </div>
    </div>
  );
}
