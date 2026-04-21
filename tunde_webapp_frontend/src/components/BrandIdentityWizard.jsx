import { useCallback, useMemo, useState } from "react";
import {
  COLOR_MOOD_OPTIONS,
  DESIGN_STEPS,
  INDUSTRY_OPTIONS,
  LOGO_STYLE_OPTIONS,
  TONE_OPTIONS,
} from "../constants/designAgentWorkflow";

const SHELL =
  "relative z-[1] flex max-h-[min(92vh,880px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.1] shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-fuchsia-900/25 backdrop-blur-xl";
const BTN_GHOST =
  "rounded-lg border border-slate-600/80 bg-slate-900/50 px-4 py-2 text-[13px] font-semibold text-slate-200 hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_PRIMARY =
  "rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-[13px] font-bold text-white shadow-lg shadow-purple-950/40 hover:from-purple-400 hover:to-pink-400 disabled:cursor-not-allowed disabled:opacity-50";

const INITIAL_FORM = {
  brand_name: "",
  industry: "Tech",
  description: "",
  audience: "",
  tone: "",
  color_mood: "",
  logo_style: "",
};

function GridPick({ options, colsClass, selected, onSelect }) {
  return (
    <div className={`grid gap-2 ${colsClass}`}>
      {options.map((opt) => {
        const active = selected === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            className={[
              "rounded-xl border px-3 py-2.5 text-left text-[12px] font-medium transition-colors",
              active
                ? "border-purple-500 bg-purple-500/20 text-purple-100 ring-2 ring-purple-500/50"
                : "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-purple-500/35 hover:bg-purple-500/10",
            ].join(" ")}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function BrandIdentityWizard({ onSubmit, onClose, isLoading }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM }));

  const canNext = useMemo(() => {
    if (step === 0) {
      return form.brand_name.trim().length >= 1 && form.description.trim().length >= 5;
    }
    if (step === 1) return Boolean(form.tone);
    if (step === 2) return Boolean(form.color_mood && form.logo_style);
    return true;
  }, [step, form.brand_name, form.description, form.tone, form.color_mood, form.logo_style]);

  const goNext = useCallback(() => {
    if (!canNext || isLoading) return;
    setStep((s) => Math.min(s + 1, DESIGN_STEPS.length - 1));
  }, [canNext, isLoading]);

  const goBack = useCallback(() => {
    if (isLoading) return;
    setStep((s) => Math.max(s - 1, 0));
  }, [isLoading]);

  const submit = useCallback(() => {
    if (isLoading) return;
    onSubmit?.({
      brand_name: form.brand_name.trim(),
      industry: form.industry.trim() || "Other",
      description: form.description.trim(),
      audience: form.audience.trim(),
      tone: form.tone,
      color_mood: form.color_mood,
      logo_style: form.logo_style,
    });
  }, [form, isLoading, onSubmit]);

  const summary = (
    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3 text-[13px] text-slate-200">
      <p>
        <span className="text-slate-500">Brand · </span>
        {form.brand_name || "—"}
      </p>
      <p>
        <span className="text-slate-500">Industry · </span>
        {form.industry}
      </p>
      <p>
        <span className="text-slate-500">Description · </span>
        {form.description || "—"}
      </p>
      <p>
        <span className="text-slate-500">Audience · </span>
        {form.audience || "—"}
      </p>
      <p>
        <span className="text-slate-500">Tone · </span>
        {form.tone || "—"}
      </p>
      <p>
        <span className="text-slate-500">Color mood · </span>
        {form.color_mood || "—"}
      </p>
      <p>
        <span className="text-slate-500">Logo style · </span>
        {form.logo_style || "—"}
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => !isLoading && onClose?.()}
      />
      <div className={SHELL} style={{ backgroundColor: "#0a0f1a" }}>
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "#0a0f1a" }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300/90">Design Agent</p>
            <p className="text-sm font-semibold text-slate-100">{DESIGN_STEPS[step]?.title}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{DESIGN_STEPS[step]?.hint}</p>
          </div>
          <span className="rounded-full border border-purple-500/35 bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
            Business
          </span>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-white/[0.06] px-3 py-2">
          {DESIGN_STEPS.map((s, i) => (
            <div
              key={s.id}
              className={[
                "flex-1 rounded-lg px-2 py-1 text-center text-[10px] font-semibold",
                i === step
                  ? "bg-gradient-to-r from-purple-500/30 to-pink-500/25 text-purple-100"
                  : i < step
                    ? "text-purple-400/80"
                    : "text-slate-600",
              ].join(" ")}
            >
              {i + 1}
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {step === 0 ? (
            <div className="space-y-4">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-400">Brand / company name *</span>
                <input
                  value={form.brand_name}
                  onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
                  placeholder="Acme Co."
                  className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/35 px-3 py-2 text-[14px] text-slate-100 placeholder:text-slate-600 focus:border-purple-500/45 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-400">Industry</span>
                <select
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/35 px-3 py-2 text-[14px] text-slate-100 focus:border-purple-500/45 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                >
                  {INDUSTRY_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-400">Description * (5+ characters)</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="One-line description…"
                  rows={3}
                  className="mt-1.5 w-full resize-y rounded-lg border border-white/[0.08] bg-black/35 px-3 py-2 text-[14px] text-slate-100 placeholder:text-slate-600 focus:border-purple-500/45 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                />
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-400">Target audience</span>
                <input
                  value={form.audience}
                  onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
                  placeholder="e.g. young professionals, luxury buyers"
                  className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/35 px-3 py-2 text-[14px] text-slate-100 placeholder:text-slate-600 focus:border-purple-500/45 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                />
              </label>
              <p className="text-[11px] font-semibold text-slate-400">Tone *</p>
              <GridPick
                options={TONE_OPTIONS}
                colsClass="grid-cols-2 sm:grid-cols-4"
                selected={form.tone}
                onSelect={(opt) => setForm((f) => ({ ...f, tone: opt }))}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] font-semibold text-slate-400">Color mood *</p>
                <GridPick
                  options={COLOR_MOOD_OPTIONS}
                  colsClass="grid-cols-2 sm:grid-cols-3"
                  selected={form.color_mood}
                  onSelect={(opt) => setForm((f) => ({ ...f, color_mood: opt }))}
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400">Logo style *</p>
                <GridPick
                  options={LOGO_STYLE_OPTIONS}
                  colsClass="grid-cols-2"
                  selected={form.logo_style}
                  onSelect={(opt) => setForm((f) => ({ ...f, logo_style: opt }))}
                />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <p className="text-[12px] text-slate-400">Review your choices, then generate a full brand identity pack.</p>
              {summary}
              <p className="text-center text-[12px] text-slate-500">Estimated time: ~15 seconds</p>
              <button type="button" onClick={submit} disabled={isLoading || !canNext} className={`${BTN_PRIMARY} w-full py-3`}>
                {isLoading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Generating…
                  </span>
                ) : (
                  "Generate Brand Identity"
                )}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap justify-between gap-2 border-t border-white/[0.06] bg-slate-950/60 px-4 py-3 backdrop-blur-sm">
          <button type="button" className={BTN_GHOST} onClick={goBack} disabled={step === 0 || isLoading}>
            Back
          </button>
          {step < 3 ? (
            <button type="button" className={BTN_PRIMARY} onClick={goNext} disabled={!canNext || isLoading}>
              Next
            </button>
          ) : (
            <button type="button" className={BTN_GHOST} onClick={() => !isLoading && onClose?.()}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
