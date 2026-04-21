// tunde_webapp_frontend/src/components/UIUXWizard.jsx
import { useState } from "react";
import {
  UIUX_STEPS,
  PRODUCT_TYPE_OPTIONS,
  INDUSTRY_OPTIONS,
  PLATFORM_OPTIONS,
  UI_STYLE_OPTIONS,
  COLOR_THEME_OPTIONS,
  SCREEN_OPTIONS_BY_TYPE,
  COMPONENT_OPTIONS,
  PRIMARY_ACTION_OPTIONS,
  INITIAL_FORM,
} from "../constants/uiuxWorkflow";

export default function UIUXWizard({ onSubmit, onClose, isLoading }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL_FORM);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const toggleList = (key, val) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(val)
        ? f[key].filter((v) => v !== val)
        : [...f[key], val],
    }));

  // Update screens when product type changes
  const handleProductTypeChange = (type) => {
    const defaultScreens = SCREEN_OPTIONS_BY_TYPE[type]?.slice(0, 3) || [];
    setForm((f) => ({ ...f, product_type: type, screens: defaultScreens }));
  };

  const canNext = () => {
    if (step === 1) return form.product_name.trim().length > 0 && form.description.trim().length >= 5;
    if (step === 2) return form.platform !== "" && form.ui_style !== "" && form.color_theme !== "";
    if (step === 3) return form.screens.length > 0 && form.components.length > 0;
    return true;
  };

  const handleNext    = () => { if (canNext()) setStep((s) => s + 1); };
  const handleBack    = () => setStep((s) => s - 1);
  const handleSubmit  = () => { if (canNext()) onSubmit(form); };

  // Reusable option button
  const OptionBtn = ({ value, selected, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border text-left
        ${selected
          ? "border-purple-500 bg-purple-500/20 text-purple-300"
          : "border-white/10 bg-white/5 text-gray-300 hover:border-purple-400/50"
        }`}
    >
      {value}
    </button>
  );

  const screenOptions = SCREEN_OPTIONS_BY_TYPE[form.product_type] || [];

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
              UI/UX Prototype
            </p>
            <h2 className="text-lg font-bold text-white">
              {UIUX_STEPS[step - 1].title}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {UIUX_STEPS[step - 1].hint}
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
          {UIUX_STEPS.map((s) => (
            <div
              key={s.id}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                s.id <= step ? "bg-purple-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pb-4 space-y-4 min-h-[320px] max-h-[60vh] overflow-y-auto">

          {/* ── Step 1 — Product Info ──────────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Product name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.product_name}
                  onChange={(e) => set("product_name", e.target.value)}
                  placeholder="e.g. FlowDesk, NexaAdmin…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                             text-white placeholder-gray-600 text-sm focus:outline-none
                             focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">Product type</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRODUCT_TYPE_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o}
                      value={o}
                      selected={form.product_type === o}
                      onClick={() => handleProductTypeChange(o)}
                    />
                  ))}
                </div>
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
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Brief description of the product…"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                             text-white placeholder-gray-600 text-sm focus:outline-none
                             focus:border-purple-500 transition resize-none"
                />
              </div>
            </>
          )}

          {/* ── Step 2 — Platform & Style ──────────────────────────────── */}
          {step === 2 && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Platform <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PLATFORM_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o}
                      value={o}
                      selected={form.platform === o}
                      onClick={() => set("platform", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  UI Style <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {UI_STYLE_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o}
                      value={o}
                      selected={form.ui_style === o}
                      onClick={() => set("ui_style", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Color theme <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {COLOR_THEME_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o}
                      value={o}
                      selected={form.color_theme === o}
                      onClick={() => set("color_theme", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">Primary action</label>
                <div className="flex flex-wrap gap-2">
                  {PRIMARY_ACTION_OPTIONS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => set("primary_action", o)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                        ${form.primary_action === o
                          ? "border-pink-500 bg-pink-500/20 text-pink-300"
                          : "border-white/10 bg-white/5 text-gray-400 hover:border-pink-400/40"
                        }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step 3 — Screens & Components ─────────────────────────── */}
          {step === 3 && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Screens to include{" "}
                  <span className="text-gray-600">(select all that apply)</span>{" "}
                  <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {screenOptions.map((o) => (
                    <OptionBtn
                      key={o}
                      value={o}
                      selected={form.screens.includes(o)}
                      onClick={() => toggleList("screens", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  UI Components{" "}
                  <span className="text-gray-600">(select all that apply)</span>{" "}
                  <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {COMPONENT_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o}
                      value={o}
                      selected={form.components.includes(o)}
                      onClick={() => toggleList("components", o)}
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
                ["Product",    form.product_name],
                ["Type",       form.product_type],
                ["Industry",   form.industry],
                ["Description",form.description],
                ["Platform",   form.platform],
                ["UI Style",   form.ui_style],
                ["Colors",     form.color_theme],
                ["Screens",    form.screens.join(", ")],
                ["Components", form.components.join(", ")],
                ["Action",     form.primary_action],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3 text-sm">
                  <span className="text-gray-500 w-24 shrink-0">{label}</span>
                  <span className="text-gray-200 break-words">{value}</span>
                </div>
              ))}
              <p className="text-xs text-gray-600 pt-2">
                ⏱ Estimated generation time: ~20 seconds
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
                "Generate Prototype"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}