import { useCallback, useEffect, useState } from "react";

function DownloadIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
    </svg>
  );
}

function ExpandIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  );
}

export function CanvasImage({ src, alt = "Generated", delayMs = 0 }) {
  const [loaded, setLoaded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const download = useCallback(() => {
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = `tunde-image-${Date.now()}.png`;
    a.click();
  }, [src]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  return (
    <>
      <div
        className="canvas-block-enter my-3 overflow-hidden rounded-xl border border-slate-600/50 bg-gradient-to-b from-slate-900/80 to-slate-950/90 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-slate-700/50 first:mt-0"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Canvas · image
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={download}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/80 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              title="Download"
              aria-label="Download image"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/80 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              title="Fullscreen"
              aria-label="Fullscreen preview"
            >
              <ExpandIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="relative mt-2 overflow-hidden rounded-lg bg-slate-950/60">
          {!loaded ? (
            <div className="canvas-skeleton flex min-h-[12rem] w-full items-center justify-center rounded-lg">
              <span className="text-[11px] text-slate-600">Rendering…</span>
            </div>
          ) : null}
          <img
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            className={[
              "max-h-[22rem] w-full rounded-lg object-contain transition-opacity duration-300",
              loaded ? "opacity-100" : "absolute inset-0 opacity-0",
            ].join(" ")}
          />
        </div>
      </div>

      {fullscreen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setFullscreen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            onClick={() => setFullscreen(false)}
          >
            Close
          </button>
          <img
            src={src}
            alt={alt}
            className="max-h-[92vh] max-w-full rounded-lg object-contain shadow-2xl ring-1 ring-slate-700"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

/** Shown while the backend is generating an image (WebSocket tool_activity). */
export function CanvasImagePending({ delayMs = 0 }) {
  return (
    <div
      className="canvas-block-enter my-3 overflow-hidden rounded-xl border border-slate-600/50 bg-gradient-to-b from-slate-900/80 to-slate-950/90 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-slate-700/50 first:mt-0"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Canvas · image
        </p>
        <span className="text-[10px] font-medium text-tunde-accent/90">Generating…</span>
      </div>
      <div className="canvas-skeleton mt-2 flex min-h-[14rem] w-full items-center justify-center rounded-lg">
        <span className="text-[11px] text-slate-500">Executing ImageTool…</span>
      </div>
    </div>
  );
}

export function CanvasImageError({ message, onRetry, delayMs = 0 }) {
  return (
    <div
      className="canvas-block-enter my-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 shadow-inner ring-1 ring-amber-900/30"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600/90">
        Canvas · image
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-300">
        {message || "Image generation did not complete."}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-tunde-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Retry image
        </button>
      ) : null}
    </div>
  );
}
