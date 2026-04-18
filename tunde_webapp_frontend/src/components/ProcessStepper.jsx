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
      <div className="flex h-full w-11 shrink-0 flex-col border-l border-white/[0.06] bg-tunde-bg">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex h-12 w-full flex-col items-center justify-center gap-0.5 text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
          title="Expand process"
          aria-expanded="false"
        >
          <ChevronIcon className="h-4 w-4" collapsed />
          <span className="text-[9px] font-medium uppercase tracking-wide">Run</span>
        </button>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-l border-white/[0.06] bg-tunde-bg">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        <span className="text-[11px] font-medium text-slate-500">Process</span>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
            title="Collapse"
            aria-expanded="true"
          >
            <ChevronIcon className="h-4 w-4" collapsed={false} />
          </button>
        ) : (
          <span className="w-6" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Pipeline</p>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {STEPS.map((step, i) => {
              const isActive = activeKey != null && step.key === activeKey;
              const isPast = activeIdx > i;
              return (
                <div key={step.id} className="flex items-center gap-1.5">
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums",
                      isActive
                        ? "bg-tunde-accent/20 text-violet-200 ring-1 ring-tunde-accent/45"
                        : isPast
                          ? "bg-emerald-500/10 text-emerald-400/90 ring-1 ring-emerald-500/20"
                          : "bg-white/[0.04] text-slate-500 ring-1 ring-white/[0.06]",
                    ].join(" ")}
                  >
                    {step.label}
                  </span>
                  {i < STEPS.length - 1 ? (
                    <span className="text-[10px] font-medium text-slate-600" aria-hidden>
                      →
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {activeKey && activity?.statusLabel ? (
            <p className="text-[10px] leading-snug text-violet-300/85">{activity.statusLabel}</p>
          ) : null}
        </div>

        {activity?.thoughtLog?.length ? (
          <div className="mt-5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">Activity</p>
            <ul className="mt-1.5 max-h-36 space-y-1 overflow-y-auto pr-0.5">
              {activity.thoughtLog.map((line, i) => {
                const full = String(line);
                const short = formatLiveActivityLine(full);
                return (
                  <li
                    key={`${i}-${full.slice(0, 24)}`}
                    className="flex gap-1.5 text-[10px] leading-tight text-slate-500"
                    title={full}
                  >
                    <span className="shrink-0 select-none" aria-hidden>
                      {liveActivityIcon(full)}
                    </span>
                    <span className="min-w-0 flex-1 break-words">{short}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {activity?.qcNote ? (
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">QC</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{activity.qcNote}</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
