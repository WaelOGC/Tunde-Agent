import {
  ASPECT_RATIOS,
  IMAGE_STYLES,
  RATIO_BUTTON_ACCENTS,
  STYLE_BUTTON_ACCENTS,
} from "../constants/imageGenerationWorkflow";

function AvatarT({ className }) {
  return (
    <div
      className={[
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        "bg-slate-700 text-slate-200 ring-1 ring-slate-600",
        className,
      ].join(" ")}
    >
      T
    </div>
  );
}

/**
 * Interactive steps for Generate Image: style grid → ratio grid (shown in chat column).
 * Copy/headings for each step live in assistant messages; this block is buttons only.
 */
export default function ImageGenerationWizard({
  phase,
  enabled,
  onStyleSelect,
  onRatioSelect,
  disabled = false,
}) {
  if (!enabled || !phase || phase === "awaiting_prompt") return null;

  return (
    <div className="flex w-full min-w-0 gap-3">
      <AvatarT />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-slate-800/80 bg-slate-900/50 px-3 py-3 sm:px-4">
        {phase === "pick_style" ? (
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/90">
              🎨 Style options
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {IMAGE_STYLES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onStyleSelect(s)}
                  className={[
                    "group relative overflow-hidden rounded-xl border bg-gradient-to-br px-3 py-2.5 text-left text-sm font-medium text-slate-100",
                    "transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]",
                    "disabled:pointer-events-none disabled:opacity-45",
                    STYLE_BUTTON_ACCENTS[i % STYLE_BUTTON_ACCENTS.length],
                  ].join(" ")}
                >
                  <span className="relative z-10 block">{s.label}</span>
                  {s.note ? (
                    <span className="relative z-10 mt-0.5 block text-[10px] font-normal text-slate-400">
                      {s.note}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {phase === "pick_ratio" ? (
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-cyan-400/90">
              📐 Aspect ratio
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ASPECT_RATIOS.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onRatioSelect(r)}
                  className={[
                    "rounded-xl border px-3 py-2.5 text-left text-sm font-medium text-slate-100",
                    "transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]",
                    "disabled:pointer-events-none disabled:opacity-45",
                    RATIO_BUTTON_ACCENTS[i % RATIO_BUTTON_ACCENTS.length],
                  ].join(" ")}
                >
                  <span className="text-cyan-100/95">{r.label}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{r.ratio}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
