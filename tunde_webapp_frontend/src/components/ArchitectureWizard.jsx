// tunde_webapp_frontend/src/components/ArchitectureWizard.jsx
import { useState } from "react";
import {
  ARCHITECTURE_STEPS,
  BUILDING_TYPE_OPTIONS,
  CLIMATE_OPTIONS,
  ROOM_OPTIONS,
  STYLE_OPTIONS,
  STRUCTURE_OPTIONS,
  FACADE_OPTIONS,
  ROOF_OPTIONS,
  INITIAL_FORM,
} from "../constants/architectureWorkflow";

export default function ArchitectureWizard({ onSubmit, onClose, isLoading }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL_FORM);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const toggleRoom = (room) =>
    setForm((f) => ({
      ...f,
      rooms: f.rooms.includes(room)
        ? f.rooms.filter((r) => r !== room)
        : [...f.rooms, room],
    }));

  const canNext = () => {
    if (step === 1)
      return form.project_name.trim().length > 0 && form.description.trim().length >= 5;
    if (step === 2)
      return form.total_area > 0 && form.floors >= 1 && form.rooms.length > 0;
    if (step === 3)
      return form.style !== "" && form.structure_type !== "" &&
             form.facade_material !== "" && form.roof_type !== "";
    return true;
  };

  const handleNext   = () => { if (canNext()) setStep((s) => s + 1); };
  const handleBack   = () => setStep((s) => s - 1);
  const handleSubmit = () => { if (canNext()) onSubmit(form); };

  const OptionBtn = ({ value, selected, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border text-left
        ${selected
          ? "border-amber-500 bg-amber-500/20 text-amber-300"
          : "border-white/10 bg-white/5 text-gray-300 hover:border-amber-400/50"
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
            <p className="text-xs font-semibold tracking-widest text-amber-400 uppercase mb-0.5">
              🏛️ Architecture Visualizer
            </p>
            <h2 className="text-lg font-bold text-white">
              {ARCHITECTURE_STEPS[step - 1].title}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {ARCHITECTURE_STEPS[step - 1].hint}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
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
          {ARCHITECTURE_STEPS.map((s) => (
            <div
              key={s.id}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                s.id <= step ? "bg-amber-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pb-4 space-y-4 min-h-[320px] max-h-[60vh] overflow-y-auto">

          {/* ── Step 1 — Building Info ─────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Project name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.project_name}
                  onChange={(e) => set("project_name", e.target.value)}
                  placeholder="e.g. Green Villa, Downtown Office..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                             text-white placeholder-gray-600 text-sm focus:outline-none
                             focus:border-amber-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">Building type</label>
                <div className="grid grid-cols-2 gap-2">
                  {BUILDING_TYPE_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o} value={o}
                      selected={form.building_type === o}
                      onClick={() => set("building_type", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Describe the building in detail — style, purpose, special features..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                             text-white placeholder-gray-600 text-sm focus:outline-none
                             focus:border-amber-500 transition resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">Location / Climate</label>
                <div className="grid grid-cols-2 gap-2">
                  {CLIMATE_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o} value={o}
                      selected={form.location_climate === o}
                      onClick={() => set("location_climate", o)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step 2 — Dimensions & Layout ──────────────────────── */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Total area (m²) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={form.total_area}
                    onChange={(e) => set("total_area", parseFloat(e.target.value) || 0)}
                    min="10"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                               text-white text-sm focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Floors <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={form.floors}
                    onChange={(e) => set("floors", parseInt(e.target.value) || 1)}
                    min="1"
                    max="200"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                               text-white text-sm focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Floor height (m)
                  </label>
                  <input
                    type="number"
                    value={form.floor_height}
                    onChange={(e) => set("floor_height", parseFloat(e.target.value) || 3)}
                    min="2"
                    max="10"
                    step="0.5"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                               text-white text-sm focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Rooms / spaces <span className="text-gray-600">(select all that apply)</span>{" "}
                  <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {ROOM_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o} value={o}
                      selected={form.rooms.includes(o)}
                      onClick={() => toggleRoom(o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Special requirements
                </label>
                <input
                  type="text"
                  value={form.special_requirements}
                  onChange={(e) => set("special_requirements", e.target.value)}
                  placeholder="e.g. Earthquake-resistant, passive cooling, rooftop garden..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5
                             text-white placeholder-gray-600 text-sm focus:outline-none
                             focus:border-amber-500 transition"
                />
              </div>
            </>
          )}

          {/* ── Step 3 — Style & Materials ─────────────────────────── */}
          {step === 3 && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Architectural style <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o} value={o}
                      selected={form.style === o}
                      onClick={() => set("style", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Primary structure <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {STRUCTURE_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o} value={o}
                      selected={form.structure_type === o}
                      onClick={() => set("structure_type", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Facade material <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {FACADE_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o} value={o}
                      selected={form.facade_material === o}
                      onClick={() => set("facade_material", o)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Roof type <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ROOF_OPTIONS.map((o) => (
                    <OptionBtn
                      key={o} value={o}
                      selected={form.roof_type === o}
                      onClick={() => set("roof_type", o)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step 4 — Confirm ───────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Summary</p>
              {[
                ["Project",     form.project_name],
                ["Type",        form.building_type],
                ["Climate",     form.location_climate],
                ["Description", form.description],
                ["Area",        `${form.total_area} m²`],
                ["Floors",      `${form.floors} floors × ${form.floor_height}m`],
                ["Rooms",       form.rooms.join(", ")],
                ["Style",       form.style],
                ["Structure",   form.structure_type],
                ["Facade",      form.facade_material],
                ["Roof",        form.roof_type],
                ...(form.special_requirements ? [["Special", form.special_requirements]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3 text-sm">
                  <span className="text-gray-500 w-24 shrink-0">{label}</span>
                  <span className="text-gray-200 break-words">{value}</span>
                </div>
              ))}

              {/* Sustainability hint */}
              <div className="mt-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <p className="text-xs text-amber-400 font-medium mb-1">
                  🌱 What you'll get:
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Interactive 3D model · Sustainability Score · Materials Report ·
                  Disaster Assessment · GLTF/OBJ export for Blender & AutoCAD
                </p>
              </div>

              <p className="text-xs text-gray-600 pt-1">
                ⏱ Estimated generation time: ~30 seconds
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
                         bg-gradient-to-r from-amber-500 to-orange-500
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
                         bg-gradient-to-r from-amber-500 to-orange-500
                         hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                         transition flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white
                                   rounded-full animate-spin" />
                  Generating 3D Model…
                </>
              ) : (
                "Generate 3D Model"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}