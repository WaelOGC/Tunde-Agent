import { useMemo, useState } from "react";

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

const GROUP_ORDER = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Last 7 days" },
  { key: "older", label: "Older" },
];

function startOfLocalDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** @param {string | null} iso @param {boolean} isLocal */
function bucketForSession(iso, isLocal) {
  if (isLocal || !iso) return "today";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "older";
  const now = Date.now();
  const today0 = startOfLocalDay(now);
  const y0 = startOfLocalDay(now - 86400000);
  const weekStart = today0 - 7 * 86400000;
  if (t >= today0) return "today";
  if (t >= y0) return "yesterday";
  if (t >= weekStart) return "week";
  return "older";
}

function toolBadgeShort(tool) {
  if (!tool || typeof tool !== "string") return "";
  const t = tool.toLowerCase();
  const map = {
    math: "Math",
    science: "Science",
    chemistry: "Chem",
    space: "Space",
    health: "Health",
    code: "Code",
    translation: "Translate",
    research: "Research",
    study: "Study",
    data_analyst: "Data",
    ceo: "CEO",
    landing: "Canvas",
  };
  return map[t] || tool.slice(0, 10);
}

/** @param {string | null} iso @param {boolean} isLocal */
function formatWhen(iso, isLocal) {
  if (isLocal) return "Now";
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const today0 = startOfLocalDay(now);
  const y0 = today0 - 86400000;
  const t = d.getTime();
  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (t >= today0) return timeStr;
  if (t >= y0) return `Yesterday · ${timeStr}`;
  if (t >= today0 - 6 * 86400000) {
    return `${d.toLocaleDateString(undefined, { weekday: "short" })} · ${timeStr}`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

  const sortedSessions = useMemo(() => {
    const copy = [...(sessions || [])];
    copy.sort((a, b) => {
      if (a.isLocalDraft && !b.isLocalDraft) return -1;
      if (!a.isLocalDraft && b.isLocalDraft) return 1;
      const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return tb - ta;
    });
    return copy;
  }, [sessions]);

  const grouped = useMemo(() => {
    /** @type {Record<string, typeof sortedSessions>} */
    const g = { today: [], yesterday: [], week: [], older: [] };
    for (const s of sortedSessions) {
      const k = bucketForSession(s.startedAt, s.isLocalDraft);
      g[k].push(s);
    }
    return g;
  }, [sortedSessions]);

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
        <p className="px-2 pb-1.5 text-[11px] font-medium text-slate-600">Chats</p>
        {GROUP_ORDER.map(({ key, label }) => {
          const list = grouped[key] || [];
          if (!list.length) return null;
          return (
            <div key={key} className="mb-3">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{label}</p>
              <ul className="space-y-0.5">
                {list.map((s) => {
                  const active = s.id === activeSessionId;
                  const hovered = hoverId === s.id;
                  const badge = toolBadgeShort(s.toolUsed);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => void onSelectSession(s.id)}
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
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug">{s.title}</span>
                          {badge ? (
                            <span className="shrink-0 rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-200/90">
                              {badge}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{s.preview}</span>
                          <span className="shrink-0 text-[10px] text-slate-600 tabular-nums">
                            {formatWhen(s.startedAt, s.isLocalDraft)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
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
