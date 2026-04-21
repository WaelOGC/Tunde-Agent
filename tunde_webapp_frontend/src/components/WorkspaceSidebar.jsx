import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const TOOL_EMOJI = {
  DESIGN: "🎨",
  DOCS: "📄",
  BUSINESS: "💼",
  DATA: "📊",
  MATH: "🧮",
  SCIENCE: "🔬",
  SPACE: "🚀",
  HEALTH: "❤️",
  CODE: "💻",
  RESEARCH: "🔭",
  STUDY: "📚",
  TRANSLATE: "🌍",
  IMAGE: "🖼️",
  UI_UX: "🖥️",
  WEB: "🌐",
};

/** Emoji shown before chat title when `toolUsed` maps to a category (subtle prefix). */
function toolEmoji(tool) {
  if (!tool || typeof tool !== "string") return "";
  const t = tool.toLowerCase();
  const map = {
    design_agent: TOOL_EMOJI.DESIGN,
    web_page_designer: TOOL_EMOJI.WEB,
    uiux_prototype: TOOL_EMOJI.UI_UX,
    document_writer: TOOL_EMOJI.DOCS,
    business_agent: TOOL_EMOJI.BUSINESS,
    data_analyst: TOOL_EMOJI.DATA,
    file_analyst: TOOL_EMOJI.DATA,
    math: TOOL_EMOJI.MATH,
    math_solver: TOOL_EMOJI.MATH,
    science: TOOL_EMOJI.SCIENCE,
    science_agent: TOOL_EMOJI.SCIENCE,
    chemistry: TOOL_EMOJI.SCIENCE,
    chemistry_agent: TOOL_EMOJI.SCIENCE,
    space: TOOL_EMOJI.SPACE,
    space_agent: TOOL_EMOJI.SPACE,
    health: TOOL_EMOJI.HEALTH,
    health_agent: TOOL_EMOJI.HEALTH,
    code: TOOL_EMOJI.CODE,
    code_assistant: TOOL_EMOJI.CODE,
    research: TOOL_EMOJI.RESEARCH,
    research_agent: TOOL_EMOJI.RESEARCH,
    study: TOOL_EMOJI.STUDY,
    study_assistant: TOOL_EMOJI.STUDY,
    translation: TOOL_EMOJI.TRANSLATE,
    translation_agent: TOOL_EMOJI.TRANSLATE,
    vision: TOOL_EMOJI.IMAGE,
  };
  return map[t] || "";
}

function toolBadgeShort(tool) {
  if (!tool || typeof tool !== "string") return "";
  const t = tool.toLowerCase();
  const map = {
    math: "Math",
    math_solver: "Math",
    science: "Science",
    science_agent: "Science",
    chemistry: "Chem",
    chemistry_agent: "Chem",
    space: "Space",
    space_agent: "Space",
    health: "Health",
    health_agent: "Health",
    code: "Code",
    code_assistant: "Code",
    translation: "Translate",
    translation_agent: "Translate",
    research: "Research",
    research_agent: "Research",
    study: "Study",
    study_assistant: "Study",
    data_analyst: "Data",
    file_analyst: "Files",
    document_writer: "Docs",
    vision: "Image",
    design_agent: "Design",
    web_page_designer: "Web",
    uiux_prototype: "UI/UX",
    business_agent: "Business",
    ceo: "CEO",
    landing: "Canvas",
    search: "Search",
  };
  return map[t] || tool.slice(0, 10);
}

export default function WorkspaceSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onOpenSettings,
  onOpenTundeHub,
  onRenameChat,
  onDeleteChat,
  connected,
}) {
  const [hoverId, setHoverId] = useState(null);
  const [menuSessionId, setMenuSessionId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const menuRef = useRef(null);
  /** When Escape cancels rename, ignore the following input `blur` so we do not persist. */
  const skipRenameBlurRef = useRef(false);

  const confirmRename = useCallback(() => {
    if (skipRenameBlurRef.current) {
      skipRenameBlurRef.current = false;
      return;
    }
    if (editingId == null) return;
    const t = editingTitle.trim();
    if (!t) {
      setEditingId(null);
      return;
    }
    onRenameChat?.(editingId, t);
    setEditingId(null);
  }, [editingId, editingTitle, onRenameChat]);

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

  useEffect(() => {
    if (!menuSessionId) return undefined;
    function handleDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuSessionId(null);
      }
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [menuSessionId]);

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

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-2">
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
                  const emoji = toolEmoji(s.toolUsed);
                  const menuOpen = menuSessionId === s.id;
                  const isEditing = editingId === s.id;
                  return (
                    <li key={s.id} className="relative">
                      <div
                        className={[
                          "group flex w-full items-center gap-1 rounded-md px-1 py-1 transition-colors",
                          active
                            ? "bg-white/[0.08] text-white"
                            : hovered
                              ? "bg-white/[0.04] text-slate-200"
                              : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-300",
                        ].join(" ")}
                        onMouseEnter={() => setHoverId(s.id)}
                        onMouseLeave={() => setHoverId(null)}
                      >
                        {isEditing ? (
                          <div className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-1.5 pr-0">
                            <input
                              autoFocus
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  confirmRename();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  skipRenameBlurRef.current = true;
                                  setEditingId(null);
                                }
                              }}
                              onBlur={() => confirmRename()}
                              className="min-w-0 flex-1"
                              style={{
                                background: "transparent",
                                border: "none",
                                borderBottom: "1px solid #7F77DD",
                                color: "white",
                                fontSize: "12px",
                                width: "100%",
                                outline: "none",
                                padding: "1px 0",
                              }}
                              aria-label="Rename chat"
                            />
                            {badge ? (
                              <span className="shrink-0 rounded bg-violet-500/20 px-1 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-violet-200/90">
                                {badge}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void onSelectSession(s.id)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pl-1.5 pr-0 text-left"
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                              {emoji ? (
                                <span className="shrink-0 text-[13px] leading-none" aria-hidden>
                                  {emoji}
                                </span>
                              ) : null}
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug">{s.title}</span>
                            </span>
                            {badge ? (
                              <span
                                className={[
                                  "shrink-0 rounded bg-violet-500/20 font-semibold uppercase tracking-wide text-violet-200/90",
                                  emoji ? "px-1 py-0.5 text-[7px]" : "px-1.5 py-0.5 text-[9px]",
                                ].join(" ")}
                              >
                                {badge}
                              </span>
                            ) : null}
                          </button>
                        )}
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            className={[
                              "flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-opacity hover:bg-white/[0.06] hover:text-slate-200",
                              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                            ].join(" ")}
                            aria-label="Chat options"
                            aria-expanded={menuOpen}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuSessionId((cur) => (cur === s.id ? null : s.id));
                            }}
                          >
                            <span className="text-base leading-none" aria-hidden>
                              ···
                            </span>
                          </button>
                          {menuOpen ? (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-white/[0.1] bg-[#121722] py-1 shadow-xl shadow-black/50"
                              role="menu"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-slate-200 hover:bg-white/[0.06]"
                                onClick={() => {
                                  setMenuSessionId(null);
                                  setEditingId(s.id);
                                  setEditingTitle(s.title || "");
                                }}
                              >
                                <span aria-hidden>✏️</span>
                                Rename
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                title="Coming soon"
                                className="flex w-full cursor-default items-center gap-2 px-3 py-2 text-left text-[12px] text-slate-500"
                                onClick={() => {
                                  setMenuSessionId(null);
                                }}
                              >
                                <span aria-hidden>📁</span>
                                Move to folder
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-rose-200/95 hover:bg-rose-500/10"
                                onClick={() => {
                                  setMenuSessionId(null);
                                  if (!window.confirm("Delete this chat?")) return;
                                  onDeleteChat?.(s.id);
                                }}
                              >
                                <span aria-hidden>🗑</span>
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
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

        <div className="flex items-center justify-between gap-2 pt-0.5">
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
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
            title="Settings"
            aria-label="Open settings"
          >
            <GearIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}
