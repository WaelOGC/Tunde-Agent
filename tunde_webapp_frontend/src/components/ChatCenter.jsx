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
  "canvas-preview-chip-in group inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-slate-900/70 px-3.5 py-2 text-[12px] font-medium text-slate-100 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[transform,box-shadow,border-color,background-color] duration-200 hover:border-sky-400/65 hover:bg-slate-800/80 hover:shadow-[0_12px_36px_rgba(56,189,248,0.12)] disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]";

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

const TOOL_ITEMS = [
  { id: "search", label: "Search", hint: "Live web (Tavily / Serper)" },
  { id: "analysis", label: "Analyze", hint: "CSV / TSV tables pasted in your message" },
  {
    id: "file_analyst",
    label: "File Analyst",
    hint: "📊 Upload CSV, Excel, PDF, or TXT — Data Wizard in chat",
  },
  {
    id: "vision",
    label: "Generate Image",
    hint: "Tunde imaging — style & size wizard in chat",
  },
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
      <header className="shrink-0 border-b border-slate-800/80 px-6 py-4">
        <h1 className="truncate text-lg font-semibold text-white">{sessionTitle}</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {connected ? "Connected to orchestrator" : "Reconnecting…"}
        </p>
        {enabledTools.file_analyst ? (
          <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-medium text-emerald-200/95">
            <span aria-hidden>📊</span>
            File Analyst active — uploads & file context enabled
            {fileAnalystContext?.fileId ? (
              <span className="text-emerald-400/80">· file in context</span>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
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
                      ? "bg-tunde-accent text-white"
                      : "bg-slate-700 text-slate-200 ring-1 ring-slate-600"
                  }
                />
                <div
                  className={[
                    "min-w-0 rounded-2xl py-3 text-sm leading-relaxed shadow-sm",
                    isUser
                      ? "max-w-[min(85%,42rem)] shrink-0 rounded-tr-sm bg-tunde-accent px-4 text-white"
                      : "w-full max-w-none flex-1 rounded-tl-sm border border-slate-800/80 bg-slate-900/50 px-3 text-slate-100 sm:px-4",
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
                        <LayoutPreviewIcon className="h-4 w-4 text-sky-400 transition-transform duration-200 group-hover:scale-110" />
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
              <Avatar label="T" className="bg-slate-700 text-slate-200 ring-1 ring-slate-600" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="rounded-2xl rounded-tl-sm border border-slate-800/80 bg-slate-900/50 px-3 py-3 sm:px-4">
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
                    <div className="thinking-shimmer h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-tunde-accent/35 to-transparent" />
                  </div>
                </div>
                {pendingInfographic ? <CanvasImagePending /> : null}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-800/80 bg-tunde-surface/95 px-4 py-4 backdrop-blur-sm sm:px-8">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
          <div
            className={[
              "relative flex w-full items-end gap-2 rounded-2xl border border-slate-700/75 bg-slate-900/50 px-2 py-2",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_24px_rgba(0,0,0,0.25)] backdrop-blur-md",
              "ring-1 ring-white/[0.07] transition-[box-shadow,border-color] duration-200 ease-out",
              "focus-within:border-tunde-accent/50 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.2),0_8px_32px_rgba(0,0,0,0.35)] focus-within:ring-tunde-accent/35",
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800/90 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800/90 hover:text-white"
                title="Tools"
                aria-expanded={toolsOpen}
              >
                <span className="text-lg font-light leading-none">+</span>
              </button>
              {toolsOpen && (
                <div className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-xl border border-slate-800 bg-tunde-bg py-2 shadow-xl">
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Active tools
                  </p>
                  {TOOL_ITEMS.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-800/80"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-tunde-accent focus:ring-tunde-accent"
                        checked={Boolean(enabledTools[item.id])}
                        onChange={() => onToggleTool?.(item.id)}
                      />
                      <span>
                        <span className="block text-sm text-slate-200">{item.label}</span>
                        <span className="block text-[11px] text-slate-500">{item.hint}</span>
                      </span>
                    </label>
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
              className="absolute bottom-2 right-2 z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tunde-accent text-white shadow-md ring-1 ring-white/10 transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              title="Send (Enter)"
              aria-label="Send message"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-600">
            Enter to send · Shift+Enter new line · Search, File Analyst uploads, & Tunde imaging
          </p>
        </form>
      </div>
    </div>
  );
}
