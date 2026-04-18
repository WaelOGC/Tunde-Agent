import { useState } from "react";

function ComingSoonBadge({ className = "" }) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full border border-slate-600/60 bg-slate-800/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-500",
        className,
      ].join(" ")}
    >
      Soon
    </span>
  );
}

function SectionCard({ icon: Icon, title, description, children, badge }) {
  return (
    <section className="rounded-2xl border border-slate-800/90 bg-slate-900/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start gap-3 border-b border-slate-800/80 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-tunde-accent ring-1 ring-slate-700/60">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {badge}
          </div>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function IconGlobe({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function IconMic({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

function IconSparkles({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

function IconCredit({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconCode({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  );
}

function IconBrain({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5a3 3 0 10-5.997.125 4 4 0 00-2.526 5.77 4 4 0 00.556 6.588 4 4 0 004.972 0 4 4 0 00.556-6.588 4 4 0 00-2.526-5.77A3 3 0 0012 5z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5a3 3 0 015.997.125 4 4 0 012.526 5.77 4 4 0 01-.556 6.588 4 4 0 01-4.972 0 4 4 0 01-.556-6.588 4 4 0 012.526-5.77A3 3 0 0012 5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a4.5 4.5 0 00-3-4 4.5 4.5 0 00-3 4M12 18v3" />
    </svg>
  );
}

function ToggleSwitch({ checked, onChange, id, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        "relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tunde-accent focus-visible:ring-offset-2 focus-visible:ring-offset-tunde-surface",
        checked ? "bg-tunde-accent" : "bg-slate-700",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform",
          checked ? "left-5" : "left-0.5",
        ].join(" ")}
      />
    </button>
  );
}

export default function SettingsPanel({
  onClose,
  memoryEnabled,
  onMemoryEnabledChange,
  customRules,
  onCustomRulesChange,
  backendHttpBase,
  wsUrl,
  backendHostLabel,
  onClearChat,
  onClearActivity,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-tunde-surface">
      <header className="shrink-0 border-b border-slate-800/80 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Workspace</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Settings</h1>
            <p className="mt-1 text-sm text-slate-500">Tune how Tunde works for you</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-700/80 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
          >
            Back to chat
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <SectionCard
            icon={IconGlobe}
            title="General"
            description="Language and voice output for the workspace."
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">Interface language</p>
                  <p className="text-xs text-slate-500">Applies to labels and future localized replies</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    disabled
                    className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-400"
                    defaultValue="en"
                  >
                    <option value="en">English</option>
                  </select>
                  <ComingSoonBadge />
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <IconMic className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Voice</p>
                    <p className="text-xs text-slate-500">Spoken responses and read-aloud</p>
                  </div>
                </div>
                <ComingSoonBadge />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={IconSparkles}
            title="Tunde personalization"
            description="Shape memory and custom behavior rules."
          >
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-800/80 bg-slate-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <IconBrain className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400/90" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Memory</p>
                    <p className="text-xs text-slate-500">
                      When enabled, requests may use long-term memory hooks from the orchestrator (tool
                      pipeline).
                    </p>
                  </div>
                </div>
                <ToggleSwitch
                  id="memory-toggle"
                  checked={Boolean(memoryEnabled)}
                  onChange={onMemoryEnabledChange}
                />
              </div>

              <div>
                <label htmlFor="custom-rules" className="text-sm font-medium text-slate-200">
                  Custom rules
                </label>
                <p className="mt-0.5 text-xs text-slate-500">
                  Plain-language instructions applied to Tunde&apos;s style (saved in this browser).
                </p>
                <textarea
                  id="custom-rules"
                  value={customRules}
                  onChange={(e) => onCustomRulesChange(e.target.value)}
                  rows={5}
                  placeholder={'e.g. "Always be concise."\n"Prefer bullet summaries for research."\n"Use metric units."'}
                  className="mt-2 w-full resize-y rounded-xl border border-slate-700/80 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-tunde-accent/50 focus:outline-none focus:ring-1 focus:ring-tunde-accent/30"
                />
                <p className="mt-1.5 text-[11px] text-slate-600">
                  Rules are stored locally for now; server-side injection is planned.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={IconCredit}
            title="Account & subscription"
            description="Plans, billing, and usage."
            badge={<ComingSoonBadge />}
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">Upgrade plan</p>
                  <p className="text-xs text-slate-500">Higher limits and team features</p>
                </div>
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-slate-700/80 bg-slate-800/40 px-4 py-2 text-sm font-medium text-slate-500"
                >
                  View plans
                </button>
              </div>
              <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">Billing & invoices</p>
                  <p className="text-xs text-slate-500">Payment method and history</p>
                </div>
                <ComingSoonBadge />
              </div>
            </div>
          </SectionCard>

          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/25">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-800/30"
              aria-expanded={advancedOpen}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 ring-1 ring-slate-700/60">
                  <IconCode className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Advanced</h2>
                  <p className="text-sm text-slate-500">Developer endpoints and maintenance</p>
                </div>
              </div>
              <svg
                className={["h-5 w-5 shrink-0 text-slate-500 transition-transform", advancedOpen ? "rotate-180" : ""].join(
                  " "
                )}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {advancedOpen ? (
              <div className="space-y-4 border-t border-slate-800/80 px-5 py-4">
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">HTTP API</div>
                  <code className="mt-2 block break-all text-xs text-cyan-300/90">{backendHttpBase}</code>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">WebSocket</div>
                  <code className="mt-2 block break-all text-xs text-cyan-300/90">{wsUrl}</code>
                </div>
                <p className="text-xs text-slate-500">Host: {backendHostLabel}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClearChat}
                    className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Clear chat
                  </button>
                  <button
                    type="button"
                    onClick={onClearActivity}
                    className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Clear process note
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
