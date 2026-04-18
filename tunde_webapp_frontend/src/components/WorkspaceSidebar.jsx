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
  onOpenTundeHub,
  connected,
}) {
  const [hoverId, setHoverId] = useState(null);

  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-white/[0.06] bg-tunde-bg">
      <div className="shrink-0 px-3 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-700 text-sm font-bold text-white shadow-md shadow-violet-950/50"
            aria-hidden
          >
            T
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-tight text-white">Tunde</p>
            <p className="truncate text-[11px] text-slate-500">Workspace</p>
          </div>
        </div>
        {onNewChat ? (
          <button
            type="button"
            onClick={onNewChat}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 text-[13px] font-medium text-slate-200 transition-colors hover:border-white/[0.12] hover:bg-white/[0.07] hover:text-white"
          >
            <span className="text-lg font-light leading-none text-slate-400" aria-hidden>
              +
            </span>
            New chat
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <p className="px-2 pb-1.5 text-[11px] font-medium text-slate-600">Recent</p>
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
                    "flex w-full flex-col rounded-md px-2.5 py-2 text-left transition-colors",
                    active
                      ? "bg-white/[0.08] text-white"
                      : hovered
                        ? "bg-white/[0.04] text-slate-200"
                        : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-300",
                  ].join(" ")}
                >
                  <span className="truncate text-[13px] font-medium leading-snug">{s.title}</span>
                  <span className="truncate text-[11px] text-slate-600">{s.preview}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="shrink-0 space-y-2 border-t border-white/[0.06] px-3 py-3">
        {onOpenTundeHub ? (
          <button
            type="button"
            onClick={onOpenTundeHub}
            className="flex w-full items-center justify-center rounded-lg bg-tunde-accent py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-violet-950/40 transition-colors hover:bg-tunde-accentHover"
          >
            Tunde Hub
          </button>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
            title="Settings"
            aria-label="Open settings"
          >
            <GearIcon className="h-[18px] w-[18px]" />
          </button>
          <div className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] text-slate-500">
            <span
              className={[
                "h-1.5 w-1.5 shrink-0 rounded-full",
                connected ? "bg-tunde-success" : "bg-red-500/90",
              ].join(" ")}
              title={connected ? "Connected" : "Disconnected"}
            />
            <span>{connected ? "Live" : "Offline"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
