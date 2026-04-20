import { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import CodeBlock from "./CodeBlock";
import { ResearchReportInner, getResearchPlainText } from "./ResearchReportDocument";
import { researchReportFilenameSlug } from "../utils/researchReportUtils";

/** Header actions — premium pill */
const HEADER_PILL_BASE =
  "relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-[transform,box-shadow,background-color,opacity] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

const HEADER_PILL_GHOST = `${HEADER_PILL_BASE} border-slate-600/80 bg-slate-900/50 text-slate-200 hover:bg-slate-800/80`;
const HEADER_PILL_ACCENT = `${HEADER_PILL_BASE} border-amber-500/40 bg-amber-950/50 text-amber-100 hover:bg-amber-900/50`;
const HEADER_PILL_SHARE = `${HEADER_PILL_BASE} border-emerald-500/40 bg-emerald-950/45 text-emerald-100 hover:border-emerald-400/65 hover:bg-emerald-900/55`;
const HEADER_PILL_LIVE =
  `${HEADER_PILL_BASE} border-sky-500/40 bg-slate-900/70 text-slate-100 hover:border-sky-400/65 hover:bg-slate-800/80`;
const HEADER_PILL_CREATE =
  `${HEADER_PILL_BASE} border-violet-500/45 bg-violet-950/50 text-violet-100 hover:border-violet-400/60 hover:bg-violet-900/55`;

function backendHttpBase() {
  return import.meta.env.VITE_BACKEND_HTTP_BASE || "http://localhost:8001";
}

const RESEARCH_CREATE_MENU_OPTIONS = [
  { kind: "web_page", label: "🌐 Web page" },
  { kind: "infographic", label: "📊 Infographic" },
];

const TOOLTIP_POP =
  "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-700/90 bg-slate-900/95 px-2.5 py-1.5 text-[10px] font-medium text-slate-200 opacity-0 shadow-xl ring-1 ring-white/10 transition-opacity duration-150 group-hover/tooltip:opacity-100";

function CanvasBuildSkeleton() {
  return (
    <div className="flex h-full min-h-[12rem] flex-col gap-4 p-4">
      <div className="space-y-2">
        <div className="canvas-skeleton h-3 w-40 rounded-md" />
        <div className="canvas-skeleton h-8 w-4/5 max-w-md rounded-lg" />
        <div className="canvas-skeleton h-3 w-full max-w-sm rounded-md" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <div className="canvas-skeleton rounded-xl" />
        <div className="canvas-skeleton rounded-xl" />
      </div>
      <div className="canvas-skeleton h-24 w-full rounded-xl" />
      <p className="text-center text-[11px] font-medium text-sky-400/90">Tunde is building your page…</p>
    </div>
  );
}

function normalizeCodeLanguage(lang) {
  const s = String(lang || "").trim().toLowerCase();
  if (s === "htm") return "html";
  return s;
}

function isHtmlLikeLanguage(lang) {
  const s = normalizeCodeLanguage(lang);
  return s === "html" || s === "xhtml" || s.includes("html");
}

function wrapHtmlForPreview(code) {
  const c = String(code || "").trim();
  if (!c) return "<!DOCTYPE html><html><head><meta charset='utf-8'/></head><body></body></html>";
  if (/^<!DOCTYPE/i.test(c) || /<html[\s>]/i.test(c)) return c;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>${c}</body></html>`;
}

function codeDownloadExtension(lang) {
  const s = normalizeCodeLanguage(lang);
  const map = {
    javascript: "js",
    typescript: "ts",
    python: "py",
    html: "html",
    htm: "html",
    css: "css",
    json: "json",
    markdown: "md",
    bash: "sh",
    plaintext: "txt",
  };
  return map[s] || (s.includes("jsx") ? "jsx" : s.includes("tsx") ? "tsx" : "txt");
}

const LandingCanvasPanel = forwardRef(function LandingCanvasPanel(
  {
    open,
    title = "Tunde Report",
    html = "",
    busy = false,
    streaming = false,
    shareUrl = "",
    /** 'landing' | 'research' | 'code' */
    canvasView = "landing",
    researchBlock = null,
    codeBlock = null,
    canvasTitleOverride = "",
    canvasLinkedMessageId = null,
    onClose,
    onShare,
    onApplyRevision,
    onLandingCanvasRegenerate,
    onResearchPagesGenerate,
    onResearchPagesRevision,
    getResearchCachedPreview,
    onInvalidateResearchPageCache,
  },
  ref
) {
  const [tab, setTab] = useState("preview");
  /** Code-assistant canvas: code | preview */
  const [codeCanvasTab, setCodeCanvasTab] = useState("code");
  const [revision, setRevision] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  const [publishedLiveUrl, setPublishedLiveUrl] = useState("");
  const [codeShareMsg, setCodeShareMsg] = useState("");
  /** Research canvas: report (document) | preview (generated HTML) */
  const [researchCanvasTab, setResearchCanvasTab] = useState("report");
  const [researchCreateMenuOpen, setResearchCreateMenuOpen] = useState(false);
  const [researchCreateBusy, setResearchCreateBusy] = useState(false);
  const [researchCreateError, setResearchCreateError] = useState("");
  const [researchGeneratedHtml, setResearchGeneratedHtml] = useState("");
  const [researchPreviewMode, setResearchPreviewMode] = useState("preview");
  const [researchPublishedUrl, setResearchPublishedUrl] = useState("");
  const [researchPublishBusy, setResearchPublishBusy] = useState(false);
  const [researchRefineText, setResearchRefineText] = useState("");
  const [researchRefineBusy, setResearchRefineBusy] = useState(false);
  const [researchRefineError, setResearchRefineError] = useState("");
  const researchCreateMenuRef = useRef(null);
  const lastResearchCreateKindRef = useRef("web_page");
  const researchBlockSigRef = useRef("");
  const researchRestoredForOpenRef = useRef(false);

  const isLanding = canvasView === "landing";
  const isResearch = canvasView === "research" && researchBlock && typeof researchBlock === "object";
  const isCode = canvasView === "code" && codeBlock && typeof codeBlock === "object";

  const headerTitle =
    canvasTitleOverride.trim() ||
    (isResearch && typeof researchBlock.topic === "string" ? researchBlock.topic : "") ||
    (isCode ? `Code · ${normalizeCodeLanguage(codeBlock.language || "plaintext")}` : title);

  const srcDoc = useMemo(() => html || "", [html]);
  const showSkeleton = isLanding && busy && !srcDoc.trim();
  const previewChrome = streaming ? "canvas-preview-stream-pulse rounded-b-lg" : "";

  const livePageUrl = (shareUrl || publishedLiveUrl).trim();

  useEffect(() => {
    setPublishedLiveUrl((shareUrl || "").trim());
  }, [shareUrl]);

  useEffect(() => {
    if (!open) return;
    if (isCode && isHtmlLikeLanguage(codeBlock.language)) setCodeCanvasTab((t) => t || "code");
    if (isLanding) setTab("preview");
  }, [open, isCode, codeBlock?.language, isLanding]);

  useEffect(() => {
    if (!isResearch || !researchBlock || typeof researchBlock !== "object") return;
    const sig = JSON.stringify({
      t: researchBlock.topic,
      s: (researchBlock.summary || "").slice(0, 200),
    });
    if (researchBlockSigRef.current !== sig) {
      researchBlockSigRef.current = sig;
      researchRestoredForOpenRef.current = false;
      setResearchGeneratedHtml("");
      setResearchCreateError("");
      setResearchCanvasTab("report");
      setResearchCreateMenuOpen(false);
      setResearchPreviewMode("preview");
      setResearchPublishedUrl("");
      setResearchPublishBusy(false);
      setResearchRefineText("");
      setResearchRefineError("");
    }
  }, [isResearch, researchBlock]);

  useEffect(() => {
    if (!open) researchRestoredForOpenRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open || !isResearch || typeof getResearchCachedPreview !== "function" || researchRestoredForOpenRef.current)
      return;
    const hit = getResearchCachedPreview();
    if (hit?.html?.trim()) {
      researchRestoredForOpenRef.current = true;
      setResearchGeneratedHtml(hit.html);
      if (typeof hit.kind === "string" && hit.kind) lastResearchCreateKindRef.current = hit.kind;
      setResearchCanvasTab("preview");
      setResearchPreviewMode("preview");
    }
  }, [open, isResearch, getResearchCachedPreview]);

  useEffect(() => {
    if (!researchCreateMenuOpen) return;
    const onDown = (e) => {
      if (researchCreateMenuRef.current?.contains(e.target)) return;
      setResearchCreateMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [researchCreateMenuOpen]);

  const researchPlain = useMemo(() => (isResearch ? getResearchPlainText(researchBlock) : ""), [isResearch, researchBlock]);
  const researchTopic = useMemo(() => {
    if (!isResearch) return "";
    return typeof researchBlock.topic === "string" ? researchBlock.topic.trim() : "";
  }, [isResearch, researchBlock]);
  const researchTitleHint = useMemo(() => (researchTopic || headerTitle || "Tunde Report").trim(), [researchTopic, headerTitle]);
  const researchPreviewSrcDoc = useMemo(() => {
    if (!researchGeneratedHtml.trim()) return "";
    return wrapHtmlForPreview(researchGeneratedHtml);
  }, [researchGeneratedHtml]);

  const codePlain = useMemo(() => {
    if (!isCode) return "";
    return typeof codeBlock.code === "string" ? codeBlock.code : "";
  }, [isCode, codeBlock]);

  const previewSrcDoc = useMemo(() => {
    if (!isCode || !isHtmlLikeLanguage(codeBlock.language)) return "";
    return wrapHtmlForPreview(codeBlock.code);
  }, [isCode, codeBlock]);

  const handleResearchPrint = useCallback(() => window.print(), []);

  const handleResearchCopy = useCallback(async () => {
    setShareMsg("");
    try {
      await navigator.clipboard.writeText(researchPlain);
      setShareMsg("Report copied.");
      window.setTimeout(() => setShareMsg(""), 2200);
    } catch {
      setShareMsg("Could not copy.");
    }
  }, [researchPlain]);

  const handleResearchShare = useCallback(async () => {
    setShareMsg("");
    const plain = researchPlain;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: headerTitle || "Research report",
          text: plain.slice(0, 120000),
        });
        setShareMsg("Shared.");
        window.setTimeout(() => setShareMsg(""), 2200);
        return;
      }
    } catch {
      /* user cancelled or share failed — fall back */
    }
    try {
      await navigator.clipboard.writeText(plain);
      setShareMsg("Report copied — paste anywhere to share.");
      window.setTimeout(() => setShareMsg(""), 3200);
    } catch {
      setShareMsg("Could not share or copy.");
    }
  }, [researchPlain, headerTitle]);

  const handleResearchDownloadTxt = useCallback(() => {
    if (!isResearch) return;
    const blob = new Blob([researchPlain], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const t =
      typeof researchBlock.topic === "string" ? researchBlock.topic.trim() : "research-report";
    a.download = `${researchReportFilenameSlug(t)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [isResearch, researchPlain, researchBlock]);

  const handleShare = useCallback(async () => {
    setShareMsg("");
    const url = await onShare?.();
    if (url) {
      setPublishedLiveUrl(url.trim());
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg("Link copied to clipboard.");
      } catch {
        setShareMsg(url);
      }
    }
  }, [onShare]);

  const handleOpenLive = useCallback(() => {
    const u = livePageUrl;
    if (!u) return;
    window.open(u, "_blank", "noopener,noreferrer");
  }, [livePageUrl]);

  const applyRevision = useCallback(() => {
    const t = revision.trim();
    if (!t || busy) return;
    onApplyRevision?.(t);
    setRevision("");
  }, [revision, busy, onApplyRevision]);

  const handleCodeCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codePlain);
      setCodeShareMsg("Copied.");
      window.setTimeout(() => setCodeShareMsg(""), 2000);
    } catch {
      setCodeShareMsg("Copy failed.");
    }
  }, [codePlain]);

  const handleCodeDownload = useCallback(() => {
    if (!isCode) return;
    const ext = codeDownloadExtension(codeBlock.language);
    const blob = new Blob([codePlain], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snippet.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [isCode, codePlain, codeBlock]);

  const handleCodeShareClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codePlain);
      setCodeShareMsg("Code copied — share anywhere.");
      window.setTimeout(() => setCodeShareMsg(""), 2600);
    } catch {
      setCodeShareMsg("Could not copy.");
    }
  }, [codePlain]);

  const handleCodePrint = useCallback(() => window.print(), []);

  const runResearchCreate = useCallback(
    async (kind, force = false) => {
      const plain = researchPlain.trim();
      if (!plain || researchCreateBusy || researchRefineBusy) return;
      if (typeof onResearchPagesGenerate !== "function") {
        setResearchCreateError("Canvas generate is not wired.");
        return;
      }
      lastResearchCreateKindRef.current = String(kind || "web_page");
      setResearchCreateBusy(true);
      setResearchCreateError("");
      setResearchRefineError("");
      setResearchCreateMenuOpen(false);
      try {
        const isInfographic = String(kind || "") === "infographic";
        const infographicContext = `IMPORTANT: Generate this as a VERTICAL INFOGRAPHIC, not a regular webpage.

Design requirements:
- Full dark background (#0f172a)
- Large colorful section headers with emoji icons
- Big bold statistics with colored pill backgrounds
- Horizontal progress bars for comparisons  
- Each major finding gets its own colored card section
- Use large numbers (font-size: 3rem+) for key statistics
- Timeline section if chronological data exists
- Quote boxes for key statements
- NO navigation bar, NO tabs — single scrolling page only
- Footer: "Published with Tunde"

Research content to convert:
${plain}`;
        const context = isInfographic ? infographicContext : plain;
        const titleHint = isInfographic ? `Infographic: ${researchTopic}` : researchTitleHint;
        const { html: htmlOut } = await onResearchPagesGenerate({
          kind: String(kind || "web_page"),
          force: Boolean(force),
          body: { context, title_hint: titleHint },
        });
        if (!htmlOut.trim()) {
          setResearchCreateError("Empty HTML returned.");
          return;
        }
        setResearchGeneratedHtml(htmlOut);
        setResearchPreviewMode("preview");
        setResearchCanvasTab("preview");
      } catch (e) {
        setResearchCreateError(e instanceof Error ? e.message : "Could not reach the server.");
      } finally {
        setResearchCreateBusy(false);
      }
    },
    [researchPlain, researchCreateBusy, researchRefineBusy, researchTitleHint, researchTopic, onResearchPagesGenerate]
  );

  const handleResearchRegenerate = useCallback(() => {
    const k = lastResearchCreateKindRef.current || "web_page";
    onInvalidateResearchPageCache?.();
    void runResearchCreate(k, true);
  }, [onInvalidateResearchPageCache, runResearchCreate]);

  const applyResearchRevision = useCallback(async () => {
    const notes = researchRefineText.trim();
    const prev = researchGeneratedHtml.trim();
    if (!notes || !prev || researchCreateBusy || researchRefineBusy) return;
    if (typeof onResearchPagesRevision !== "function") {
      setResearchRefineError("Canvas revision is not wired.");
      return;
    }
    setResearchRefineBusy(true);
    setResearchRefineError("");
    setResearchCreateError("");
    try {
      const { html: htmlOut } = await onResearchPagesRevision({
        createKind: lastResearchCreateKindRef.current || "web_page",
        body: {
          title_hint: researchTitleHint,
          existing_html: prev,
          revision_notes: notes,
        },
      });
      if (!htmlOut.trim()) {
        setResearchRefineError("Empty HTML returned.");
        return;
      }
      setResearchGeneratedHtml(htmlOut);
      setResearchPreviewMode("preview");
      setResearchRefineText("");
      setResearchCanvasTab("preview");
    } catch (e) {
      setResearchRefineError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setResearchRefineBusy(false);
    }
  }, [
    researchRefineText,
    researchGeneratedHtml,
    researchCreateBusy,
    researchRefineBusy,
    researchTitleHint,
    onResearchPagesRevision,
  ]);

  const handleResearchViewPage = useCallback(async () => {
    const already = researchPublishedUrl.trim();
    if (already) {
      window.open(already, "_blank", "noopener,noreferrer");
      return;
    }
    const htmlToPublish = researchGeneratedHtml.trim();
    if (!htmlToPublish || researchPublishBusy || researchCreateBusy || researchRefineBusy) return;
    setResearchPublishBusy(true);
    setResearchCreateError("");
    setResearchRefineError("");
    try {
      const base = backendHttpBase().replace(/\/$/, "");
      const r = await fetch(`${base}/api/pages/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: researchTitleHint || "Tunde Report",
          html: htmlToPublish,
        }),
      });
      const raw = await r.text();
      if (!r.ok) {
        let detail = raw.slice(0, 300);
        try {
          const ej = JSON.parse(raw);
          if (ej && typeof ej.detail === "string") detail = ej.detail;
        } catch {
          /* ignore */
        }
        setResearchCreateError(detail || "Publish failed.");
        return;
      }
      const j = JSON.parse(raw);
      const url = typeof j.share_url === "string" ? j.share_url : "";
      if (!url) {
        setResearchCreateError("Publish failed (missing share_url).");
        return;
      }
      setResearchPublishedUrl(url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setResearchCreateError("Publish failed — could not reach the server.");
    } finally {
      setResearchPublishBusy(false);
    }
  }, [
    researchPublishedUrl,
    researchGeneratedHtml,
    researchPublishBusy,
    researchCreateBusy,
    researchRefineBusy,
    researchTitleHint,
  ]);

  if (!open) return null;

  const shellClass =
    "flex h-full min-h-0 min-w-0 flex-col border-l border-slate-700/90 bg-slate-950 shadow-2xl shadow-black/50 fixed inset-y-0 right-0 z-[60] w-full max-w-lg lg:static lg:z-auto lg:w-[60%] lg:max-w-none lg:shrink-0 lg:basis-[60%] lg:shadow-none";

  /* ——— Research Agent canvas ——— */
  if (isResearch) {
    return (
      <div ref={ref} tabIndex={-1} className={shellClass}>
        <div className="relative z-[10000] flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800/90 bg-slate-950/95 px-3 py-2.5 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">
              Tunde Canvas · Research
            </p>
            <p className="truncate text-sm font-semibold text-slate-100">{headerTitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            <button type="button" className={HEADER_PILL_ACCENT} onClick={handleResearchPrint} title="Print report">
              Print
            </button>
            <button type="button" className={HEADER_PILL_GHOST} onClick={handleResearchCopy} title="Copy full report">
              Copy
            </button>
            <button type="button" className={HEADER_PILL_SHARE} onClick={handleResearchShare} title="Share report">
              Share
            </button>
            <button
              type="button"
              className={HEADER_PILL_GHOST}
              onClick={handleResearchDownloadTxt}
              title="Download as .txt"
            >
              Download
            </button>
            <button
              type="button"
              className={HEADER_PILL_GHOST}
              onClick={() => setResearchPreviewMode((m) => (m === "code" ? "preview" : "code"))}
              disabled={researchCanvasTab !== "preview" || !researchGeneratedHtml.trim()}
              title={researchCanvasTab !== "preview" ? "Open Preview tab to view code" : "Toggle HTML source"}
            >
              Code
            </button>
            <button
              type="button"
              className={HEADER_PILL_SHARE}
              onClick={handleResearchViewPage}
              disabled={!researchGeneratedHtml.trim() || researchPublishBusy || researchCreateBusy || researchRefineBusy}
              title={!researchGeneratedHtml.trim() ? "Generate a page first" : "Publish and open in a new tab"}
            >
              {researchPublishBusy ? "Publishing…" : "View Page"}
            </button>
            <div className="relative z-[10001]" ref={researchCreateMenuRef}>
              <button
                type="button"
                className={HEADER_PILL_CREATE}
                disabled={researchCreateBusy || researchRefineBusy || !researchPlain.trim()}
                onClick={() => setResearchCreateMenuOpen((o) => !o)}
                aria-expanded={researchCreateMenuOpen}
                aria-haspopup="menu"
                title={!researchPlain.trim() ? "No research content available yet" : "Create a page from this report"}
              >
                Create{" "}
                <span className="text-[9px] opacity-90" aria-hidden>
                  ▼
                </span>
              </button>
              {researchCreateMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-[9999] mt-1.5 min-w-[13.5rem] rounded-lg border border-[#e2e8f0] bg-white py-1 shadow-[0_10px_25px_rgba(0,0,0,0.15)]"
                >
                  {RESEARCH_CREATE_MENU_OPTIONS.map((opt) => (
                    <button
                      key={opt.kind}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-40"
                      disabled={researchCreateBusy || researchRefineBusy}
                      onClick={() => runResearchCreate(opt.kind, false)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={HEADER_PILL_GHOST}
              onClick={handleResearchRegenerate}
              disabled={researchCreateBusy || researchRefineBusy || !researchPlain.trim()}
              title="Discard cached preview and call the API again"
            >
              🔄 Regenerate
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600/80 bg-slate-900/40 px-2.5 py-1.5 text-[13px] font-medium leading-none text-slate-300 hover:bg-slate-800/80"
              aria-label="Close canvas"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>
        {shareMsg ? (
          <p className="shrink-0 border-b border-slate-800/80 bg-slate-900/50 px-3 py-1.5 text-[11px] text-emerald-300/90">
            {shareMsg}
          </p>
        ) : null}
        {researchCreateBusy || researchRefineBusy ? (
          <div className="shrink-0 border-b border-violet-500/25 bg-violet-950/40 px-3 py-2">
            <p className="text-[11px] font-medium text-violet-200/95">
              {researchRefineBusy ? "Updating preview…" : "Generating…"}
            </p>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-violet-500/90" />
            </div>
          </div>
        ) : null}
        {researchCreateError ? (
          <p className="shrink-0 border-b border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-[11px] text-amber-200/95">
            {researchCreateError}
          </p>
        ) : null}
        <div className="flex shrink-0 gap-1 border-b border-slate-800/90 px-2 py-2">
          <button
            type="button"
            onClick={() => setResearchCanvasTab("report")}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              researchCanvasTab === "report"
                ? "bg-slate-800 text-white ring-1 ring-amber-500/45"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
            ].join(" ")}
          >
            Report
          </button>
          <button
            type="button"
            onClick={() => setResearchCanvasTab("preview")}
            disabled={!researchPreviewSrcDoc.trim()}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              researchCanvasTab === "preview"
                ? "bg-slate-800 text-white ring-1 ring-amber-500/45"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
              !researchPreviewSrcDoc.trim() ? "cursor-not-allowed opacity-40" : "",
            ].join(" ")}
          >
            Preview
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden border-b border-slate-800/50 bg-slate-950 print:bg-white">
          {researchCanvasTab === "report" ? (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-neutral-300 bg-white print:shadow-none">
                <ResearchReportInner block={researchBlock} contentId="tunde-research-canvas-print" />
              </div>
            </div>
          ) : (
            <div className="relative h-full overflow-hidden bg-slate-950 p-2">
              {researchPreviewMode === "code" ? (
                <pre className="h-full overflow-auto rounded-md border border-slate-800/90 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200 shadow-inner">
                  <code>{researchGeneratedHtml || "—"}</code>
                </pre>
              ) : (
                <iframe
                  title="Research preview"
                  className="h-full w-full rounded-md border border-slate-800/90 bg-slate-950 shadow-inner"
                  sandbox="allow-scripts allow-forms"
                  srcDoc={researchPreviewSrcDoc}
                />
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-800/90 bg-slate-950/90 p-2.5 backdrop-blur-sm">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Refine page</p>
          <textarea
            value={researchRefineText}
            onChange={(e) => setResearchRefineText(e.target.value)}
            placeholder="Describe changes (e.g. emphasize the stats, improve visual hierarchy)…"
            disabled={researchCreateBusy || researchRefineBusy || !researchGeneratedHtml.trim()}
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none disabled:opacity-50"
          />
          {researchRefineError ? <p className="mt-1 text-[11px] text-amber-200/95">{researchRefineError}</p> : null}
          <button
            type="button"
            onClick={applyResearchRevision}
            disabled={researchCreateBusy || researchRefineBusy || !researchRefineText.trim() || !researchGeneratedHtml.trim()}
            className="mt-1.5 w-full rounded-lg bg-amber-600/90 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
          >
            {researchRefineBusy ? "Updating…" : "Apply to page"}
          </button>
        </div>
      </div>
    );
  }

  /* ——— Code Assistant canvas ——— */
  if (isCode) {
    const language = typeof codeBlock.language === "string" ? codeBlock.language : "plaintext";
    const taskType = typeof codeBlock.task_type === "string" ? codeBlock.task_type : "write";
    const code = typeof codeBlock.code === "string" ? codeBlock.code : "";
    const complexity = typeof codeBlock.complexity === "string" ? codeBlock.complexity : "";
    const showPreview = isHtmlLikeLanguage(language) && previewSrcDoc.trim();

    return (
      <div ref={ref} tabIndex={-1} className={shellClass}>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800/90 bg-slate-950/95 px-3 py-2.5 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/90">
              Tunde Canvas · Code
            </p>
            <p className="truncate text-sm font-semibold text-slate-100">{headerTitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {showPreview ? (
              <div className="mr-1 flex rounded-lg border border-slate-700 bg-slate-900/80 p-0.5">
                <button
                  type="button"
                  onClick={() => setCodeCanvasTab("code")}
                  className={[
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold",
                    codeCanvasTab === "code" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200",
                  ].join(" ")}
                >
                  Code
                </button>
                <button
                  type="button"
                  onClick={() => setCodeCanvasTab("preview")}
                  className={[
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold",
                    codeCanvasTab === "preview" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200",
                  ].join(" ")}
                >
                  Preview
                </button>
              </div>
            ) : null}
            <button type="button" className={HEADER_PILL_ACCENT} onClick={handleCodePrint}>
              Print
            </button>
            <button type="button" className={HEADER_PILL_SHARE} onClick={handleCodeShareClipboard}>
              Share
            </button>
            <button type="button" className={HEADER_PILL_GHOST} onClick={handleCodeDownload}>
              Download
            </button>
            <button type="button" className={HEADER_PILL_GHOST} onClick={handleCodeCopy}>
              Copy
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600/80 bg-slate-900/40 px-2.5 py-1.5 text-[13px] font-medium leading-none text-slate-300 hover:bg-slate-800/80"
              aria-label="Close canvas"
            >
              ✕
            </button>
          </div>
        </div>
        {codeShareMsg ? (
          <p className="shrink-0 border-b border-slate-800/80 bg-slate-900/50 px-3 py-1.5 text-[11px] text-emerald-300/90">
            {codeShareMsg}
          </p>
        ) : null}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-950">
          {!showPreview || codeCanvasTab === "code" ? (
            <div className="h-full overflow-y-auto p-3">
              <CodeBlock code={code} language={language} taskType={taskType} complexity={complexity} />
            </div>
          ) : (
            <div className="h-full overflow-hidden bg-slate-950 p-2">
              <iframe
                title="HTML preview"
                className="h-full w-full rounded-md border border-slate-800/90 bg-white shadow-inner"
                sandbox="allow-scripts allow-same-origin"
                srcDoc={previewSrcDoc}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ——— Landing page canvas (existing) ——— */
  return (
    <div ref={ref} tabIndex={-1} className={shellClass}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800/90 bg-slate-950/95 px-3 py-2.5 backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500/90">Tunde Canvas</p>
          <p className="truncate text-sm font-medium text-slate-100">{title}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button type="button" onClick={handleShare} disabled={busy || streaming || !html} className={HEADER_PILL_SHARE}>
            Share page
          </button>
          {livePageUrl ? (
            <span className="group/tooltip inline-flex">
              <button type="button" onClick={handleOpenLive} className={HEADER_PILL_LIVE}>
                <span aria-hidden>🌐</span>
                Open live
              </button>
              <span className={TOOLTIP_POP} role="tooltip">
                View your landing page in a new tab
              </span>
            </span>
          ) : null}
          <button type="button" className={HEADER_PILL_ACCENT} onClick={() => window.print()} title="Print preview">
            Print
          </button>
          <button type="button" className={HEADER_PILL_GHOST} onClick={() => navigator.clipboard.writeText(html)}>
            Copy
          </button>
          {typeof onLandingCanvasRegenerate === "function" ? (
            <button
              type="button"
              className={HEADER_PILL_GHOST}
              onClick={() => onLandingCanvasRegenerate()}
              disabled={busy || streaming}
              title="Discard cached page and call generate again"
            >
              🔄 Regenerate
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600/80 bg-slate-900/40 px-2.5 py-1.5 text-[13px] font-medium leading-none text-slate-300 hover:bg-slate-800/80"
            aria-label="Close canvas"
          >
            ✕
          </button>
        </div>
      </div>

      {shareMsg ? (
        <p className="shrink-0 border-b border-slate-800/80 bg-slate-900/50 px-3 py-1.5 text-[11px] text-emerald-300/90">
          {shareMsg}
        </p>
      ) : null}

      <div className="flex shrink-0 gap-1 border-b border-slate-800/90 px-2 py-2">
        {["preview", "code"].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              tab === id ? "bg-slate-800 text-white ring-1 ring-sky-500/45" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
            ].join(" ")}
          >
            {id}
          </button>
        ))}
        {streaming ? (
          <span className="ml-auto self-center text-[10px] font-medium uppercase tracking-wide text-sky-400/85">
            Live update
          </span>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden border-b border-slate-800/50 bg-slate-950">
        {tab === "preview" ? (
          <>
            {showSkeleton ? (
              <CanvasBuildSkeleton />
            ) : (
              <div className={`h-full overflow-hidden bg-slate-950 p-1 ${previewChrome}`}>
                <iframe
                  title="Landing preview"
                  className="h-full w-full rounded-md border border-slate-800/90 bg-slate-950 shadow-inner"
                  sandbox="allow-scripts allow-same-origin"
                  srcDoc={srcDoc}
                />
              </div>
            )}
          </>
        ) : (
          <div className="relative h-full">
            {showSkeleton ? <div className="canvas-skeleton absolute inset-3 rounded-lg" /> : null}
            <pre
              className={[
                "h-full overflow-auto p-3 font-mono text-[11px] leading-relaxed text-slate-300",
                showSkeleton ? "opacity-40" : "",
              ].join(" ")}
            >
              {showSkeleton ? "/* Waiting for HTML stream… */" : html || "—"}
            </pre>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-800/90 bg-slate-950/90 p-2.5 backdrop-blur-sm">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Refine page</p>
        <textarea
          value={revision}
          onChange={(e) => setRevision(e.target.value)}
          placeholder="Describe changes (e.g. emphasize KPIs, shorten hero, add a comparison table)…"
          disabled={busy || streaming}
          rows={2}
          className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={applyRevision}
          disabled={busy || streaming || !revision.trim() || !html}
          className="mt-1.5 w-full rounded-lg bg-tunde-accent py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Updating…" : "Apply to page"}
        </button>
        {shareUrl ? (
          <p className="mt-2 truncate text-[10px] text-slate-500" title={shareUrl}>
            Last share URL: {shareUrl}
          </p>
        ) : null}
      </div>
    </div>
  );
});

export default LandingCanvasPanel;
