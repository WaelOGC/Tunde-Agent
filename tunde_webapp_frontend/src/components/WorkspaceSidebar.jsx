import { useState } from "react";

function GearIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export default function WorkspaceSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onOpenSettings,
  connected,
}) {
  const [hoverId, setHoverId] = useState(null);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-slate-800/80 bg-tunde-bg">
      <div className="shrink-0 border-b border-slate-800/80 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight text-white">Tunde</span>
              <span className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                v0.1.0
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Workspace</p>
          </div>
          {onNewChat ? (
            <button
              type="button"
              onClick={onNewChat}
              className="shrink-0 rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition-colors hover:bg-tunde-accent hover:text-white"
            >
              New
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Recent sessions
        </p>
        <ul className="space-y-0.5">
          {sessions.map((s) => {
            const active = s.id === activeSessionId;
            const hovered = hoverId === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectSession(s.id)}
                  onMouseEnter={() => setHoverId(s.id)}
                  onMouseLeave={() => setHoverId(null)}
                  className={[
                    "flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors",
                    active
                      ? "bg-slate-800/90 text-white ring-1 ring-tunde-accent/40"
                      : hovered
                        ? "bg-slate-800/50 text-slate-100"
                        : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200",
                  ].join(" ")}
                >
                  <span className="truncate text-sm font-medium">{s.title}</span>
                  <span className="truncate text-[11px] text-slate-500">{s.preview}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="shrink-0 border-t border-slate-800/80 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-white"
            title="Settings"
            aria-label="Open settings"
          >
            <GearIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 rounded-lg bg-slate-900/60 px-2.5 py-1.5">
            <span
              className={[
                "h-2 w-2 shrink-0 rounded-full",
                connected ? "bg-tunde-success shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-red-500",
              ].join(" ")}
              title={connected ? "Connected" : "Disconnected"}
            />
            <span className="text-[11px] font-medium text-slate-400">
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
