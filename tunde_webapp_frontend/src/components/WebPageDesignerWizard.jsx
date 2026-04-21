// tunde_webapp_frontend/src/components/WebPageDesignerWizard.jsx
import { useState } from "react";
import {
  WEB_PAGE_STEPS,
  INDUSTRY_OPTIONS,
  PAGE_STYLE_OPTIONS,
  COLOR_SCHEME_OPTIONS,
  SECTION_OPTIONS,
  CTA_PRESETS,
  INITIAL_FORM,
} from "../constants/webPageDesignerWorkflow";

export default function WebPageDesignerWizard({ onSubmit, onClose, isLoading }) {
  const [step, setStep]   = useState(1);
  const [form, setForm]   = useState(INITIAL_FORM);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const toggleSection = (section) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.includes(section)
        ? f.sections.filter((s) => s !== section)
        : [...f.sections, section],
    }));
  };

  // ── Validation per step ───────────────────────────────────────────────────
  const canNext = () => {
    if (step === 1) return form.business_name.trim().length > 0 && form.description.trim().length >= 5;
    if (step === 2) return form.audience.trim().length > 0 && form.page_style !== "";
    if (step === 3) return form.color_scheme !== "" && form.sections.length > 0;
    return true;
  };

  const handleNext = () => { if (canNext()) setStep((s) => s + 1); };
  const handleBack = () => setStep((s) => s - 1);
  const handleSubmit = () => { if (canNext()) onSubmit(form); };

  // ── Option grid button ────────────────────────────────────────────────────
  const OptionBtn = ({ value, selected, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border
        ${selected
          ? "border-purple-500 bg-purple-500/20 text-purple-300"
          : "border-white/10 bg-white/5 text-gray-300 hover:border-purple-400/50"
        }`}
    >
      {value}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: "#0a0f1a" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-purple-400 uppercase mb-0.5">
              Web Page Designer
            </p>
            <h2 className="text-lg font-bold text-white">
              {WEB_PAGE_STEPS[step - 1].title}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {WEB_PAGE_STEPS[step - 1].hint}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Business
            </span>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2 px-6 pb-4">
          {WEB_PAGE_STEPS.map((s) => (
            <div
              key={s.id}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                s.id <= step ? "bg-purple-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="px-6 pb-4 space-y-4 min-h-[280px]">

          {/* ── Step 1 — Business Info ─────────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Business / Brand name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => set("business_name", e.target.value)}
                  placeholder="e.g. NexaFlow"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                             text-white placeholder-gray-600 text-sm focus:outline-none
                             focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Industry</label>
                <select
                  value={form.industry}
                  onChange={(e) => set("industry", e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                             text-white text-sm focus:outline-none focus:border-purple-500
                             transition appearance-none cursor-pointer"
                >
                  {INDUSTRY_OPTIONS.map((o) => (
                    <option key={o} value={o} className="bg-gray-900">{o}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Description <span className="text-gray-600 text-xs">(5+ characters)</span>{" "}
                  <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="One-line description of your business…"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                             text-white placeholder-gray-600 text-sm focus:outline-none
                             focus:border-purple-500 transition resize-none"
                />
              </div>
            </>
          )}

          {/* ── Step 2 — Audience & Style ──────────────────────────────── */}
          {step === 2 && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Target audience <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.audience}
                  onChange={(e) => set("audience", e.target.value)}
                  placeholder="e.g. Young professionals, startup founders…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                             text-white placeholder-gray-600 text-sm focus:outline-none
                             focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Page style <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PAGE_STYLE_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o}
                      value={o}
                      selected={form.page_style === o}
                      onClick={() => set("page_style", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Call to action text
                </label>
                <div className="flex flex-wrap gap-2">
                  {CTA_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("cta_text", c)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                        ${form.cta_text === c
                          ? "border-pink-500 bg-pink-500/20 text-pink-300"
                          : "border-white/10 bg-white/5 text-gray-400 hover:border-pink-400/40"
                        }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step 3 — Page Structure ────────────────────────────────── */}
          {step === 3 && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Color scheme <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {COLOR_SCHEME_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o}
                      value={o}
                      selected={form.color_scheme === o}
                      onClick={() => set("color_scheme", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Sections to include{" "}
                  <span className="text-gray-600">(select all that apply)</span>{" "}
                  <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {SECTION_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o}
                      value={o}
                      selected={form.sections.includes(o)}
                      onClick={() => toggleSection(o)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step 4 — Confirm ───────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Summary</p>
              {[
                ["Business",    form.business_name],
                ["Industry",    form.industry],
                ["Description", form.description],
                ["Audience",    form.audience],
                ["Style",       form.page_style],
                ["Colors",      form.color_scheme],
                ["Sections",    form.sections.join(", ")],
                ["CTA",         form.cta_text],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3 text-sm">
                  <span className="text-gray-500 w-24 shrink-0">{label}</span>
                  <span className="text-gray-200 break-words">{value}</span>
                </div>
              ))}
              <p className="text-xs text-gray-600 pt-2">
                ⏱ Estimated generation time: ~15 seconds
              </p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white
                       disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            Back
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canNext()}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white
                         bg-gradient-to-r from-purple-500 to-pink-500
                         hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white
                         bg-gradient-to-r from-purple-500 to-pink-500
                         hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                         transition flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white
                                   rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate Web Page"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}