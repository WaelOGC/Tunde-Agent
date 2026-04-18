/**
 * Post-upload actions for Tunde Data & File Analyst (chat-embedded).
 * "visualize" reserves future canvas chart wiring.
 */

const ACTIONS = [
  {
    id: "summarize",
    label: "Summarize Content",
    short: "Summarize",
    emoji: "📄",
    accent:
      "from-emerald-500/20 to-teal-600/15 border-emerald-500/40 hover:border-emerald-400/70 hover:shadow-[0_0_18px_rgba(52,211,153,0.12)]",
  },
  {
    id: "analyze",
    label: "Perform Data Analysis",
    short: "Analyze",
    emoji: "📈",
    accent:
      "from-sky-500/20 to-blue-600/15 border-sky-500/40 hover:border-sky-400/70 hover:shadow-[0_0_18px_rgba(56,189,248,0.12)]",
  },
  {
    id: "insights",
    label: "Extract Key Insights",
    short: "Insights",
    emoji: "💡",
    accent:
      "from-amber-500/20 to-orange-600/15 border-amber-500/40 hover:border-amber-400/70 hover:shadow-[0_0_18px_rgba(251,191,36,0.12)]",
  },
  {
    id: "visualize",
    label: "Visualize Data",
    short: "Visualize",
    emoji: "📉",
    accent:
      "from-violet-500/20 to-fuchsia-600/15 border-violet-500/40 hover:border-violet-400/70 hover:shadow-[0_0_18px_rgba(167,139,250,0.12)]",
  },
];

export default function DataAnalystWizard({
  enabled,
  disabled,
  onAction,
}) {
  if (!enabled) return null;

  return (
    <div className="canvas-block-enter w-full max-w-none rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900/60 to-slate-950/80 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-slate-800/80">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tunde Data Wizard</p>
      <h3 className="mt-1 text-base font-semibold text-emerald-300/95">
        <span className="mr-1.5" aria-hidden>
          🔍
        </span>
        Next step — choose an action
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Pick a shortcut or type your own question below. Your file stays in context while **File Analyst** is on.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={disabled}
            onClick={() => onAction?.(a.id)}
            className={[
              "flex items-center gap-2 rounded-xl border bg-gradient-to-br px-3 py-2.5 text-left text-sm font-medium text-slate-100",
              "transition-[transform,box-shadow,border-color] duration-150 hover:scale-[1.01] active:scale-[0.99]",
              "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100",
              a.accent,
            ].join(" ")}
          >
            <span className="text-lg" aria-hidden>
              {a.emoji}
            </span>
            <span className="leading-snug">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
