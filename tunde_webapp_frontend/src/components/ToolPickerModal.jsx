import { useCallback, useEffect, useMemo, useState } from "react";

const TABS = [
  { id: "all", label: "All tools" },
  { id: "core", label: "Core" },
  { id: "science", label: "Science" },
  { id: "design", label: "Design" },
  { id: "business", label: "Business" },
];

/** @typedef {{ id: string; icon: string; name: string; hint: string; tab: string; business?: boolean; comingSoon?: boolean; toggleId?: string }} ToolCardDef */

/** @type {ToolCardDef[]} */
const TOOL_CARDS = [
  // Core (order per spec)
  { id: "search", toggleId: "search", icon: "🔍", name: "Search", hint: "Live web research & citations", tab: "core" },
  { id: "data_analyst", toggleId: "data_analyst", icon: "📊", name: "Data Analyst", hint: "CSV, Excel & data insights", tab: "core" },
  { id: "file_analyst", toggleId: "file_analyst", icon: "📎", name: "File Analyst", hint: "PDF, TXT, spreadsheet upload", tab: "core" },
  { id: "document_writer", toggleId: "document_writer", icon: "📄", name: "Document Writer", hint: "Write & format documents", tab: "core" },
  { id: "code_assistant", toggleId: "code_assistant", icon: "💻", name: "Code Assistant", hint: "Debug, review & explain code", tab: "core" },
  { id: "translation_agent", toggleId: "translation_agent", icon: "🌍", name: "Translation", hint: "50+ languages & dialects", tab: "core" },
  { id: "vision", toggleId: "vision", icon: "🖼", name: "Generate Image", hint: "Style & aspect wizard", tab: "core" },
  { id: "study_assistant", toggleId: "study_assistant", icon: "📚", name: "Study Assistant", hint: "Learn any topic fast", tab: "core" },
  { id: "research_agent", toggleId: "research_agent", icon: "🔭", name: "Research Agent", hint: "Multi-source summaries", tab: "core" },
  // Science
  { id: "math_solver", toggleId: "math_solver", icon: "🧮", name: "Math Solver", hint: "Step-by-step solutions", tab: "science" },
  { id: "chemistry_agent", toggleId: "chemistry_agent", icon: "🔬", name: "Chemistry", hint: "Molecules & reactions", tab: "science" },
  { id: "space_agent", toggleId: "space_agent", icon: "🚀", name: "Space", hint: "Solar system explorer", tab: "science" },
  { id: "health_agent", toggleId: "health_agent", icon: "❤️", name: "Health", hint: "Medical information", tab: "science" },
  // Design (Business tier)
  {
    id: "design_agent",
    toggleId: "design_agent",
    icon: "🎨",
    name: "Brand Identity",
    hint: "Colors, logo & guidelines",
    tab: "design",
    business: true,
  },
  {
    id: "web_page_designer",
    toggleId: "web_page_designer",
    icon: "🌐",
    name: "Web Page Designer",
    hint: "Landing pages & sites",
    tab: "design",
    business: true,
  },
  {
    id: "uiux_prototype",
    toggleId: "uiux_prototype",
    icon: "🖥️",
    name: "UI/UX Prototype",
    hint: "Dashboards & app screens",
    tab: "design",
    comingSoon: true,
  },
  {
    id: "architecture_agent",
    toggleId: "architecture_agent",
    icon: "🏛️",
    name: "Architecture Visualizer",
    hint: "3D models, sustainability & materials analysis",
    tab: "design",
    business: true,
  },
  // Business (Business tier)
  {
    id: "business_research",
    toggleId: "business_agent",
    icon: "💼",
    name: "Business Research",
    hint: "Market & competitor analysis",
    tab: "business",
    business: true,
  },
  {
    id: "scenario_simulator",
    toggleId: "business_agent",
    icon: "📈",
    name: "Scenario Simulator",
    hint: "P&L & financial modeling",
    tab: "business",
    business: true,
  },
];

export default function ToolPickerModal({ open, onClose, enabledTools, onToggleTool }) {
  const [tab, setTab] = useState("all");

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setTab("all");
  }, [open]);

  const visible = useMemo(() => {
    if (tab === "all") return TOOL_CARDS;
    return TOOL_CARDS.filter((c) => c.tab === tab);
  }, [tab]);

  const handleCard = useCallback(
    (toggleId) => {
      onToggleTool?.(toggleId);
      onClose?.();
    },
    [onToggleTool, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="flex w-[580px] max-w-full max-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0c1018] shadow-2xl shadow-black/60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-picker-title"
      >
        <div className="shrink-0 border-b border-white/[0.06] px-5 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="tool-picker-title" className="text-lg font-semibold tracking-tight text-white">
                Tools
              </h2>
              <p className="mt-1 text-[12px] text-slate-500">Choose a tool to activate in this conversation</p>
            </div>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Close"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-1 border-b border-transparent">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={[
                    "relative px-3 pb-2.5 text-[13px] font-medium transition-colors",
                    active ? "text-violet-300" : "text-slate-500 hover:text-slate-300",
                  ].join(" ")}
                >
                  {t.label}
                  {active ? (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-violet-500" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            {visible.map((card) => {
              const tid = card.toggleId || card.id;
              const on = Boolean(enabledTools?.[tid]);
              const comingSoon = Boolean(card.comingSoon);
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={comingSoon}
                  aria-disabled={comingSoon}
                  onClick={comingSoon ? undefined : () => handleCard(tid)}
                  className={[
                    "flex flex-col rounded-xl border bg-white/[0.02] p-3 text-left transition-colors",
                    comingSoon
                      ? "cursor-not-allowed opacity-50 border-white/[0.08]"
                      : on
                        ? "border-violet-500/50 ring-1 ring-violet-500/20"
                        : "border-white/[0.08] hover:border-violet-500/55 hover:ring-1 hover:ring-violet-500/15",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-lg leading-none" aria-hidden>
                      {card.icon}
                    </span>
                    {comingSoon ? (
                      <span className="shrink-0 rounded border border-slate-500/40 bg-slate-600/20 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-400">
                        Coming Soon
                      </span>
                    ) : card.business ? (
                      <span className="shrink-0 rounded border border-purple-400/35 bg-purple-500/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-purple-200/95">
                        Business
                      </span>
                    ) : (
                      <span />
                    )}
                  </div>
                  <p className="mt-2 text-[13px] font-bold leading-snug text-slate-100">{card.name}</p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">{card.hint}</p>
                  {comingSoon ? (
                    <p className="mt-1 text-[10px] italic leading-snug text-slate-500">Available soon</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.06] px-5 py-2.5 text-center text-[11px] text-slate-600">
          Press Escape to close
        </div>
      </div>
    </div>
  );
}
