import { useCallback, useEffect, useMemo, useState } from "react";

/** Header actions — premium pill, aligned with Preview in Canvas / Refine */
const HEADER_PILL_BASE =
  "relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[transform,box-shadow,border-color,background-color,opacity] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

const HEADER_PILL_SHARE =
  `${HEADER_PILL_BASE} border-emerald-500/40 bg-emerald-950/45 text-emerald-100 hover:border-emerald-400/65 hover:bg-emerald-900/55`;

const HEADER_PILL_LIVE =
  `${HEADER_PILL_BASE} border-sky-500/40 bg-slate-900/70 text-slate-100 hover:border-sky-400/65 hover:bg-slate-800/80 hover:shadow-[0_12px_36px_rgba(56,189,248,0.12)]`;

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
      <div className="grid flex-1 grid-cols-2 gap-3 min-h-0">
        <div className="canvas-skeleton rounded-xl" />
        <div className="canvas-skeleton rounded-xl" />
      </div>
      <div className="canvas-skeleton h-24 w-full rounded-xl" />
      <p className="text-center text-[11px] font-medium text-sky-400/90">Tunde is building your page…</p>
    </div>
  );
}

export default function LandingCanvasPanel({
  open,
  title = "Tunde Report",
  html = "",
  busy = false,
  streaming = false,
  shareUrl = "",
  onClose,
  onShare,
  onApplyRevision,
}) {
  const [tab, setTab] = useState("preview");
  const [revision, setRevision] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  /** Mirrors `shareUrl` prop and updates in the same turn as a successful publish (before parent re-render). */
  const [publishedLiveUrl, setPublishedLiveUrl] = useState("");

  const srcDoc = useMemo(() => html || "", [html]);
  const showSkeleton = busy && !srcDoc.trim();
  const previewChrome = streaming ? "canvas-preview-stream-pulse rounded-b-lg" : "";

  const livePageUrl = (shareUrl || publishedLiveUrl).trim();

  useEffect(() => {
    setPublishedLiveUrl((shareUrl || "").trim());
  }, [shareUrl]);

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

  if (!open) return null;

  return (
    <div
      className={[
        "flex h-full min-h-0 w-full min-w-0 flex-col border-l border-slate-700/90 bg-slate-950 shadow-2xl shadow-black/50",
        "fixed inset-y-0 right-0 z-[60] max-w-lg lg:static lg:z-auto lg:max-w-[560px] lg:shrink-0 lg:shadow-none",
      ].join(" ")}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800/90 bg-slate-950/95 px-3 py-2.5 backdrop-blur-md">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500/90">Tunde Canvas</p>
          <p className="truncate text-sm font-medium text-slate-100">{title}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={handleShare}
            disabled={busy || streaming || !html}
            className={HEADER_PILL_SHARE}
            title="Publish and copy a shareable link"
          >
            Share page
          </button>
          {livePageUrl ? (
            <span className="group/tooltip inline-flex">
              <button
                type="button"
                onClick={handleOpenLive}
                className={HEADER_PILL_LIVE}
                title="View your landing page in a new tab"
                aria-label="View your landing page in a new tab"
              >
                <span aria-hidden>🌐</span>
                Open live
              </button>
              <span className={TOOLTIP_POP} role="tooltip">
                View your landing page in a new tab
              </span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-600/80 bg-slate-900/40 px-3 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur-md hover:bg-slate-800/80"
            aria-label="Close canvas"
          >
            Close
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
              tab === id
                ? "bg-slate-800 text-white ring-1 ring-sky-500/45"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
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
            {showSkeleton ? (
              <div className="canvas-skeleton absolute inset-3 rounded-lg" />
            ) : null}
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
}
