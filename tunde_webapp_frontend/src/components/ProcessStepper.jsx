import { useState } from "react";

function liveActivityIcon(line) {
  const s = String(line || "");
  if (s.includes("[Image Tool]")) return "🎨";
  if (s.includes("[Search Tool]")) return "🔍";
  if (s.includes("[Data Tool]")) return "📊";
  return "⚡";
}

function formatLiveActivityLine(line) {
  return String(line || "").replace(/^\[[^\]]+\]\s*/, "");
}

const STEPS = [
  { id: "agent", label: "Agent", key: "agent" },
  { id: "qc", label: "QC", key: "qc" },
  { id: "ceo", label: "CEO", key: "ceo" },
];

function ChevronIcon({ className, collapsed }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function ProcessStepper({ activity, collapsible = true }) {
  const [collapsed, setCollapsed] = useState(false);

  const activeKey = activity?.activeStep ?? null;
  const activeIdx = activeKey ? STEPS.findIndex((s) => s.key === activeKey) : -1;

  if (collapsible && collapsed) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col border-l border-slate-800/80 bg-tunde-bg">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex h-12 w-full items-center justify-center text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-white"
          title="Expand process monitor"
          aria-expanded="false"
        >
          <ChevronIcon className="h-4 w-4" collapsed />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-slate-800/80 bg-tunde-bg">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800/80 px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Process
        </span>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-white"
            title="Collapse"
            aria-expanded="true"
          >
            <ChevronIcon className="h-4 w-4" collapsed={false} />
          </button>
        ) : (
          <span className="w-8" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="relative pl-1">
          <div className="absolute left-[15px] top-3 bottom-3 w-px bg-slate-700/80" aria-hidden />
          <ol className="relative space-y-6">
            {STEPS.map((step, i) => {
              const isActive = activeKey != null && step.key === activeKey;
              const isPast = activeIdx > i;
              return (
                <li key={step.id} className="relative flex gap-3">
                  <div className="relative z-10 flex shrink-0 flex-col items-center">
                    <span
                      className={[
                        "flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ring-2 transition-all",
                        isActive
                          ? "bg-tunde-accent text-white ring-tunde-accent/50 shadow-[0_0_12px_rgba(59,130,246,0.35)]"
                          : isPast
                            ? "bg-tunde-success/20 text-tunde-success ring-tunde-success/30"
                            : "bg-slate-800 text-slate-500 ring-slate-700",
                      ].join(" ")}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 pt-1">
                    <p
                      className={[
                        "text-sm font-semibold",
                        isActive ? "text-white" : "text-slate-500",
                      ].join(" ")}
                    >
                      {step.label}
                    </p>
                    {isActive && activity?.statusLabel && (
                      <p className="mt-0.5 text-xs text-tunde-accent">{activity.statusLabel}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {activity?.thoughtLog?.length ? (
          <div className="mt-6 rounded-lg border border-slate-800/90 bg-slate-900/30 p-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Live activity
            </p>
            <ul className="mt-1.5 max-h-36 space-y-1 overflow-y-auto pr-0.5">
              {activity.thoughtLog.map((line, i) => {
                const full = String(line);
                const short = formatLiveActivityLine(full);
                return (
                  <li
                    key={`${i}-${full.slice(0, 24)}`}
                    className="flex gap-1.5 text-[10px] leading-tight text-slate-400"
                    title={full}
                  >
                    <span className="shrink-0 select-none" aria-hidden>
                      {liveActivityIcon(full)}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-slate-400">{short}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {activity?.qcNote && (
          <div className="mt-8 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              QC note
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-200">{activity.qcNote}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
