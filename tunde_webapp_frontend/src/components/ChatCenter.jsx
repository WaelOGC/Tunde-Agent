import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/** px — sync with Tailwind min/max classes on the composer textarea */
const COMPOSER_TEXTAREA_MIN_PX = 48;
const COMPOSER_TEXTAREA_MAX_PX = 280;
import { CanvasImage, CanvasImageError, CanvasImagePending } from "./canvas/CanvasImage";
import CanvasTable from "./canvas/CanvasTable";
import ImageGenerationWizard from "./ImageGenerationWizard";
import DataAnalystWizard from "./DataAnalystWizard";
import { AssistantFormattedText } from "../utils/AssistantFormattedText";
import { prepareAssistantMarkdown, segmentMarkdownPipeTables } from "../utils/markdownTables";

function SendIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
    </svg>
  );
}

function Avatar({ label, className }) {
  return (
    <div
      className={[
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        className,
      ].join(" ")}
    >
      {label}
    </div>
  );
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "tabular") return "Spreadsheet (CSV / Excel)";
  if (k === "pdf") return "PDF document";
  if (k === "txt") return "Plain text";
  return k || "File";
}

/** “Preview in Canvas” — icon + label, appears after substantive assistant output */
const PREVIEW_CANVAS_CHIP =
  "canvas-preview-chip-in group inline-flex items-center gap-2 rounded-full border border-violet-500/35 bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium text-slate-100 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[transform,box-shadow,border-color,background-color] duration-200 hover:border-violet-400/55 hover:bg-white/[0.07] hover:shadow-[0_12px_36px_rgba(124,58,237,0.12)] disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]";

function LayoutPreviewIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function messageHasReportContext(m) {
  const t = (m?.text || "").trim();
  if (t.length > 0) return true;
  return Array.isArray(m?.blocks) && m.blocks.length > 0;
}

const TOOL_MENU_SECTIONS = [
  {
    category: "Core Tools",
    items: [
      { id: "search", label: "Search", hint: "Live web research", live: true },
      { id: "analysis", label: "Analyze", hint: "Pasted CSV / TSV tables", live: true },
      {
        id: "file_analyst",
        label: "File Analyst",
        hint: "Upload CSV, Excel, PDF, or TXT",
        live: true,
      },
      { id: "vision", label: "Generate Image", hint: "Style & aspect wizard", live: true },
    ],
  },
  {
    category: "Education",
    items: [
      { id: "math_solver", label: "Math Solver", live: false },
      { id: "science_agent", label: "Science Agent", live: false },
      { id: "chemistry_agent", label: "Chemistry Agent", live: false },
      { id: "space_agent", label: "Space Agent", live: false },
      { id: "health_agent", label: "Health Agent", live: false },
      { id: "study_assistant", label: "Study Assistant", live: false },
    ],
  },
  {
    category: "Business",
    items: [
      { id: "simulation", label: "Simulation", live: false },
      { id: "voice", label: "Voice", live: false },
      { id: "code_assistant", label: "Code Assistant", live: false },
      { id: "translation", label: "Translation", live: false },
      { id: "research_agent", label: "Research Agent", live: false },
      { id: "data_analyst", label: "Data Analyst", live: false },
      { id: "document_writer", label: "Document Writer", live: false },
      { id: "business_agent", label: "Business Agent", live: false },
    ],
  },
  {
    category: "Creative",
    items: [
      { id: "design_agent", label: "Design Agent", live: false },
      { id: "creative_writer", label: "Creative Writer", live: false },
    ],
  },
];

const WELCOME_PILLS = [
  { id: "search", label: "Search" },
  { id: "file", label: "Analyze file" },
  { id: "image", label: "Generate image" },
  { id: "math", label: "Math problem" },
];

function AssistantRichText({ text }) {
  const segments = useMemo(
    () => segmentMarkdownPipeTables(prepareAssistantMarkdown(text || "")),
    [text]
  );
  let tableIdx = 0;
  return (
    <div className="space-y-5">
      {segments.map((seg, i) => {
        if (seg.type === "table") {
          const delay = tableIdx * 45;
          tableIdx += 1;
          return (
            <CanvasTable
              key={`tbl-${i}`}
              headers={seg.headers}
              rows={seg.rows}
              title={null}
              subtitle="Table"
              delayMs={delay}
            />
          );
        }
        return (
          <AssistantFormattedText key={`txt-${i}`} text={seg.text} />
        );
      })}
    </div>
  );
}

function MessageBlocks({ blocks, onRetryLastPrompt }) {
  if (!blocks || !blocks.length) return null;
  return (
    <div className="mt-4 space-y-5 border-t border-slate-700/60 pt-4">
      {blocks.map((b, i) => {
        const kind = typeof b?.type === "string" ? b.type.toLowerCase() : "";
        if (kind === "image_pending") {
          return <CanvasImagePending key={`pending-${i}`} delayMs={i * 50} />;
        }
        if (kind === "image") {
          const src = (b.src || b.url || b.data_url || b.image_url || "").trim();
          if (!src) return null;
          return <CanvasImage key={i} src={src} alt={b.alt || "Generated image"} delayMs={i * 50} />;
        }
        if (kind === "image_error") {
          return (
            <CanvasImageError
              key={i}
              message={typeof b.message === "string" ? b.message : ""}
              onRetry={onRetryLastPrompt}
              delayMs={i * 50}
            />
          );
        }
        if (kind === "table" && Array.isArray(b.headers) && Array.isArray(b.rows)) {
          return (
            <CanvasTable
              key={i}
              headers={b.headers}
              rows={b.rows}
              title={b.title}
              subtitle="Table"
              delayMs={i * 50}
            />
          );
        }
        if (kind === "file_preview") {
          const name = typeof b.name === "string" ? b.name : "File";
          const size = b.size;
          const fk = typeof b.kind === "string" ? b.kind : "";
          return (
            <div
              key={i}
              className="canvas-block-enter mt-3 overflow-hidden rounded-xl border border-cyan-900/40 bg-gradient-to-br from-cyan-950/40 to-slate-950/80 p-3 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-cyan-800/30"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-500/90">📂 File preview</p>
              <p className="mt-1.5 text-sm font-medium text-slate-100">{name}</p>
              <p className="mt-1 text-xs text-slate-400">
                {kindLabel(fk)} · {formatFileSize(size)}
              </p>
            </div>
          );
        }
        if (kind === "code" && typeof b.content === "string") {
          return (
            <div
              key={i}
              className="canvas-block-enter my-4 w-full max-w-none overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/40 shadow-[0_8px_24px_rgba(0,0,0,0.25)] ring-1 ring-slate-800/80 first:mt-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className="border-b border-slate-800 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Canvas · code{b.language ? ` · ${b.language}` : ""}
              </p>
              <pre className="max-h-64 overflow-auto p-3 text-[11px] leading-relaxed text-slate-200">
                <code>{b.content}</code>
              </pre>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function ChatCenter({
  sessionTitle,
  messages,
  processing,
  connected,
  onSend,
  onRetryLastPrompt,
  liveToolLine = "",
  pendingInfographic = false,
  enabledTools = { search: true, analysis: false, vision: false, memory: false, file_analyst: false },
  onToggleTool,
  imageGenWizard = null,
  onImageStyleSelect,
  onImageRatioSelect,
  fileAnalystContext = null,
  onAnalystFile,
  onDataWizardAction,
  onCanvasOpen,
  canvasBusy = false,
}) {
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [input, setInput] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const toolsRef = useRef(null);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    const next = Math.min(
      COMPOSER_TEXTAREA_MAX_PX,
      Math.max(COMPOSER_TEXTAREA_MIN_PX, scrollH)
    );
    el.style.height = `${next}px`;
    el.style.overflowY = scrollH > COMPOSER_TEXTAREA_MAX_PX ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, processing, imageGenWizard?.phase, fileAnalystContext?.fileId]);

  const pickAnalystFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !onAnalystFile) return;
    setFileBusy(true);
    try {
      await onAnalystFile(f);
    } finally {
      setFileBusy(false);
    }
  };

  const inputPlaceholder = (() => {
    if (!connected) return "Waiting for connection…";
    if (imageGenWizard?.phase === "awaiting_prompt") {
      return "Describe the image you want (style & ratio are set) — Enter to send…";
    }
    if (enabledTools.file_analyst && fileAnalystContext?.fileId) {
      return "Ask about your uploaded file, or use the Data Wizard above…";
    }
    return "Message Tunde… (Enter to send, Shift+Enter for new line)";
  })();

  useEffect(() => {
    function handleClickOutside(e) {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showWelcome = messages.length === 0 && !processing;

  const handleWelcomePill = (pillId) => {
    if (pillId === "search") {
      if (!enabledTools.search) onToggleTool?.("search");
    } else if (pillId === "file") {
      if (!enabledTools.file_analyst) onToggleTool?.("file_analyst");
    } else if (pillId === "image") {
      if (!enabledTools.vision) onToggleTool?.("vision");
    } else if (pillId === "math") {
      setInput("Help me solve this math problem: ");
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || processing || !connected) return;
    onSend(text);
    setInput("");
    setToolsOpen(false);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-tunde-surface">
      {!showWelcome ? (
        <header className="shrink-0 border-b border-white/[0.06] px-4 py-2.5 md:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium text-slate-200">{sessionTitle}</h1>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {connected ? "Ready" : "Reconnecting…"}
              </p>
            </div>
          </div>
          {enabledTools.file_analyst ? (
            <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] font-medium text-emerald-400/90">
              <span aria-hidden>📊</span>
              File Analyst
              {fileAnalystContext?.fileId ? <span className="text-emerald-500/70">· file attached</span> : null}
            </p>
          ) : null}
        </header>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showWelcome ? (
          <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
            <div className="max-w-lg text-center">
              <h2 className="text-[1.65rem] font-semibold tracking-tight text-white md:text-3xl">
                Hello, how can I help?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                Ask me anything — I&apos;ll assign the right agents to your task.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                {WELCOME_PILLS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleWelcomePill(p.id)}
                    disabled={!connected}
                    className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-slate-300 transition-colors hover:border-violet-500/35 hover:bg-violet-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-2 py-3 sm:px-4">
            <div className="mx-auto flex w-full max-w-none flex-col gap-5">
          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={["flex w-full min-w-0 gap-3", isUser ? "flex-row-reverse" : "flex-row"].join(
                  " "
                )}
              >
                <Avatar
                  label={isUser ? "U" : "T"}
                  className={
                    isUser
                      ? "bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-sm shadow-violet-950/40"
                      : "bg-white/[0.08] text-slate-200 ring-1 ring-white/[0.08]"
                  }
                />
                <div
                  className={[
                    "min-w-0 rounded-2xl py-3 text-sm leading-relaxed shadow-sm",
                    isUser
                      ? "max-w-[min(85%,42rem)] shrink-0 rounded-tr-sm bg-gradient-to-br from-violet-600 to-purple-800 px-4 text-white shadow-sm shadow-black/20"
                      : "w-full max-w-none flex-1 rounded-tl-sm border border-white/[0.06] bg-white/[0.03] px-3 text-slate-100 sm:px-4",
                  ].join(" ")}
                >
                  {isUser ? m.text : <AssistantRichText text={m.text} />}
                  {!isUser ? (
                    <MessageBlocks blocks={m.blocks} onRetryLastPrompt={onRetryLastPrompt} />
                  ) : null}
                  {!isUser &&
                  m.canvasFollowUp &&
                  messageHasReportContext(m) &&
                  typeof onCanvasOpen === "function" ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-3">
                      <button
                        type="button"
                        onClick={onCanvasOpen}
                        disabled={processing || !connected || canvasBusy}
                        className={PREVIEW_CANVAS_CHIP}
                        title="Open the Tunde Canvas and build a shareable report from this answer"
                      >
                        <LayoutPreviewIcon className="h-4 w-4 text-violet-400 transition-transform duration-200 group-hover:scale-110" />
                        Preview in Canvas
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          <ImageGenerationWizard
            phase={imageGenWizard?.phase}
            enabled={Boolean(enabledTools.vision)}
            onStyleSelect={onImageStyleSelect}
            onRatioSelect={onImageRatioSelect}
            disabled={processing || !connected}
          />
          <DataAnalystWizard
            enabled={Boolean(enabledTools.file_analyst && fileAnalystContext?.fileId)}
            disabled={processing || !connected || fileBusy}
            onAction={onDataWizardAction}
          />
          {processing && (
            <div className="flex w-full min-w-0 gap-3">
              <Avatar label="T" className="bg-white/[0.08] text-slate-200 ring-1 ring-white/[0.08]" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="rounded-2xl rounded-tl-sm border border-white/[0.06] bg-white/[0.03] px-3 py-3 sm:px-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Thinking
                  </p>
                  {liveToolLine ? (
                    <p className="mt-1.5 text-xs leading-snug text-slate-300">{liveToolLine}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-500">Preparing workspace tools…</p>
                  )}
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500" />
                  </div>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-800/90">
                    <div className="thinking-shimmer h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-violet-500/35 to-transparent" />
                  </div>
                </div>
                {pendingInfographic ? <CanvasImagePending /> : null}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] bg-tunde-surface/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
          <div
            className={[
              "relative flex w-full items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 py-1.5",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[box-shadow,border-color] duration-200 ease-out",
              "focus-within:border-violet-500/40 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.15)]",
            ].join(" ")}
          >
            <div className="relative flex shrink-0 items-end gap-0.5 self-end pb-1 pl-1" ref={toolsRef}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.pdf,.txt"
                className="hidden"
                onChange={pickAnalystFile}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!enabledTools.file_analyst || processing || !connected || fileBusy}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-35"
                title={enabledTools.file_analyst ? "Upload file (File Analyst)" : "Turn on File Analyst in + menu"}
                aria-label="Upload file for File Analyst"
              >
                <span className="text-base leading-none" aria-hidden>
                  📄
                </span>
              </button>
              <button
                type="button"
                onClick={() => setToolsOpen((o) => !o)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                title="Tools"
                aria-expanded={toolsOpen}
              >
                <span className="text-xl font-light leading-none">+</span>
              </button>
              {toolsOpen && (
                <div className="absolute bottom-full left-0 z-20 mb-2 max-h-[min(70vh,28rem)] w-[min(calc(100vw-1.5rem),20rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-white/[0.08] bg-tunde-bg py-2 shadow-2xl shadow-black/40">
                  {TOOL_MENU_SECTIONS.map((section) => (
                    <div key={section.category} className="border-b border-white/[0.04] pb-2 last:border-b-0 last:pb-0">
                      <p className="sticky top-0 z-10 bg-tunde-bg px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        {section.category}
                      </p>
                      {section.items.map((item) =>
                        item.live ? (
                          <label
                            key={item.id}
                            className="flex cursor-pointer items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-3.5 w-3.5 rounded border-slate-600 bg-slate-900/80 text-tunde-accent focus:ring-tunde-accent"
                              checked={Boolean(enabledTools[item.id])}
                              onChange={() => onToggleTool?.(item.id)}
                            />
                            <span>
                              <span className="block text-[13px] text-slate-200">{item.label}</span>
                              <span className="block text-[11px] text-slate-500">{item.hint}</span>
                            </span>
                          </label>
                        ) : (
                          <div
                            key={item.id}
                            className="flex cursor-not-allowed items-start gap-2 px-3 py-2 text-left opacity-50"
                          >
                            <span
                              className="mt-1 h-3.5 w-3.5 shrink-0 rounded border border-slate-700/80 bg-slate-900/50"
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-[13px] text-slate-400">{item.label}</span>
                                <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                                  Coming soon
                                </span>
                              </span>
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={inputPlaceholder}
              disabled={!connected || processing}
              rows={1}
              aria-label="Message input"
              className={[
                "min-h-[48px] max-h-[280px] min-w-0 flex-1 resize-none bg-transparent py-2.5 pl-1 pr-14",
                "text-sm leading-relaxed text-slate-100",
                "placeholder:text-slate-600 placeholder:opacity-90",
                "transition-[height] duration-200 ease-out",
                "focus:outline-none disabled:opacity-50",
              ].join(" ")}
            />
            <button
              type="submit"
              disabled={!connected || processing || !input.trim()}
              className="absolute bottom-2 right-2 z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tunde-accent text-white shadow-md shadow-violet-950/30 transition-[opacity,transform] hover:bg-tunde-accentHover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              title="Send (Enter)"
              aria-label="Send message"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-600">
            Enter to send · Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}
