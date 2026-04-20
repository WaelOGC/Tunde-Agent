import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import CanvasTable from "./canvas/CanvasTable";
import DataChart from "./DataChart";
import { stripExecutiveSummary } from "../utils/executiveText";

const SHELL =
  "flex h-full min-h-0 flex-col overflow-hidden rounded-l-2xl border border-white/[0.08] bg-slate-950/80 shadow-[0_12px_48px_rgba(0,0,0,0.45)] ring-1 ring-slate-800/80 backdrop-blur-xl";

const TAB_BTN =
  "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150";

const HEADER_PILL_BASE =
  "relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-[transform,box-shadow,background-color,opacity] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

const HEADER_PILL_SHARE = `${HEADER_PILL_BASE} border-emerald-500/40 bg-emerald-950/45 text-emerald-100 hover:border-emerald-400/65 hover:bg-emerald-900/55`;
const HEADER_PILL_LIVE =
  `${HEADER_PILL_BASE} border-sky-500/40 bg-slate-900/70 text-slate-100 hover:border-sky-400/65 hover:bg-slate-800/80`;
const HEADER_PILL_GHOST = `${HEADER_PILL_BASE} border-slate-600/80 bg-slate-900/50 text-slate-200 hover:bg-slate-800/80`;

const TOOLTIP_POP =
  "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-700/90 bg-slate-900/95 px-2.5 py-1.5 text-[10px] font-medium text-slate-200 opacity-0 shadow-xl ring-1 ring-white/10 transition-opacity duration-150 group-hover/tooltip:opacity-100";

function wrapHtmlForPreview(code) {
  const c = String(code || "").trim();
  if (!c) return "<!DOCTYPE html><html><head><meta charset='utf-8'/></head><body></body></html>";
  if (/^<!DOCTYPE/i.test(c) || /<html[\s>]/i.test(c)) return c;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>${c}</body></html>`;
}

/** Renders smart_accounting without raw JSON dumps. */
function SmartAccountingPanel({ data }) {
  const d = data && typeof data === "object" ? data : null;
  if (!d) return null;
  const stub = d.quarterly_tax_report_stub && typeof d.quarterly_tax_report_stub === "object" ? d.quarterly_tax_report_stub : null;
  const notes = typeof d.notes === "string" ? d.notes.trim() : "";
  const rows = [];
  if (stub) {
    ["Q1", "Q2", "Q3", "Q4"].forEach((q) => {
      rows.push([q, String(stub[q] ?? "—")]);
    });
  }
  const extraKeys = Object.keys(d).filter((k) => k !== "quarterly_tax_report_stub" && k !== "notes");
  return (
    <div className="space-y-4">
      {rows.length ? (
        <CanvasTable headers={["Quarter", "Illustrative allocation / notes"]} rows={rows} subtitle="Quarterly snapshot" title="Tax & accounting (illustrative)" highlightMetrics />
      ) : (
        <p className="text-sm text-slate-500">No quarterly lines in this payload.</p>
      )}
      {extraKeys.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {extraKeys.map((k) => {
            const val = d[k];
            let display = "";
            if (Array.isArray(val)) {
              display = val.map((x) => String(x)).join(", ");
            } else if (val !== null && typeof val === "object") {
              display = Object.entries(val)
                .map(([kk, vv]) => `${kk}: ${vv}`)
                .join("; ");
            } else {
              display = String(val ?? "");
            }
            return (
              <div key={k} className="rounded-xl border border-slate-700/50 bg-slate-900/30 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k.replace(/_/g, " ")}</p>
                <p className="mt-1 text-[13px] leading-snug text-slate-200">{display}</p>
              </div>
            );
          })}
        </div>
      ) : null}
      {notes ? (
        <div className="rounded-xl border border-amber-800/30 bg-amber-950/20 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">Disclaimer</p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function CompetitiveRadarMap({ points, xLabel, yLabel }) {
  const pts = Array.isArray(points) ? points : [];
  const w = 400;
  const h = 280;
  const pad = 44;
  const plotW = w - 2 * pad;
  const plotH = h - 2 * pad;
  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-slate-950/90 via-slate-900/50 to-emerald-950/30 p-4 ring-1 ring-white/[0.06]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200/90">Competitive map</p>
          <p className="mt-1 max-w-md text-[12px] text-slate-400">
            Positioning on <span className="text-slate-200">{xLabel}</span> × <span className="text-slate-200">{yLabel}</span>.
            Bubble size hints at emphasis, not market share precision.
          </p>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full max-w-xl" role="img" aria-label="Competitive positioning map">
        <defs>
          <linearGradient id="bizRadarBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(56,189,248,0.14)" />
            <stop offset="50%" stopColor="rgba(16,185,129,0.08)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0.06)" />
          </linearGradient>
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x={pad - 8} y={pad - 8} width={plotW + 16} height={plotH + 16} rx="16" fill="url(#bizRadarBg)" opacity="0.95" />
        {/* Quadrant guides */}
        <line x1={pad + plotW / 2} x2={pad + plotW / 2} y1={pad} y2={h - pad} stroke="rgba(148,163,184,0.22)" strokeWidth="1" strokeDasharray="4 6" />
        <line x1={pad} x2={w - pad} y1={pad + plotH / 2} y2={pad + plotH / 2} stroke="rgba(148,163,184,0.22)" strokeWidth="1" strokeDasharray="4 6" />
        <text x={pad} y={pad - 14} fill="#64748b" fontSize="9" fontWeight="600">
          {yLabel} →
        </text>
        <text x={w - pad - 4} y={h - pad + 28} textAnchor="end" fill="#64748b" fontSize="9" fontWeight="600">
          {xLabel} →
        </text>
        {[0.33, 0.66].map((t) => (
          <rect
            key={t}
            x={pad}
            y={pad + t * plotH}
            width={plotW}
            height={1}
            fill="rgba(148,163,184,0.08)"
          />
        ))}
        {pts.map((p, i) => {
          const nx = typeof p.x === "number" ? p.x : Number(p.x) || 0;
          const ny = typeof p.y === "number" ? p.y : Number(p.y) || 0;
          const cx = pad + (nx / 100) * plotW;
          const cy = h - pad - (ny / 100) * plotH;
          const name = typeof p.name === "string" ? p.name : `Player ${i + 1}`;
          const hint = typeof p.share_hint === "string" ? p.share_hint : "";
          const r = 10 + (i % 3) * 2;
          return (
            <g key={`${name}-${i}`} filter="url(#glow)">
              <circle cx={cx} cy={cy} r={r} fill="rgba(251,191,36,0.92)" stroke="rgba(15,23,42,0.95)" strokeWidth="2.5" />
              <text x={cx + r + 6} y={cy - 4} fill="#e2e8f0" fontSize="11" fontWeight="600">
                {name}
              </text>
              {hint ? (
                <text x={cx + r + 6} y={cy + 10} fill="#94a3b8" fontSize="9">
                  {hint}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
        {pts.slice(0, 6).map((p, i) => (
          <span
            key={`leg-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/25 px-2.5 py-1 text-[10px] text-slate-300"
          >
            <span className="h-2 w-2 rounded-full bg-amber-400/90" aria-hidden />
            {typeof p.name === "string" ? p.name : `P${i + 1}`}
          </span>
        ))}
      </div>
    </div>
  );
}

function OutlookRoadmap({ milestones }) {
  const ms = Array.isArray(milestones) ? milestones : [];
  if (!ms.length) return <p className="text-sm text-slate-500">No milestones in this payload.</p>;
  const icons = ["◆", "◇", "○", "◎", "◉"];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-b from-slate-950/80 to-slate-900/40 px-4 py-6 ring-1 ring-sky-900/40">
      <div className="pointer-events-none absolute inset-x-8 top-[52px] h-0.5 bg-gradient-to-r from-sky-500/20 via-cyan-400/40 to-emerald-400/30" />
      <p className="mb-8 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-300/90">Interactive roadmap · five-year horizon</p>
      <ul className="relative space-y-8">
        {ms.map((m, i) => {
          const y = String(m?.year ?? i + 1);
          const title = String(m?.title ?? "");
          const detail = String(m?.detail ?? "");
          const ic = icons[i % icons.length];
          return (
            <li
              key={`${y}-${i}`}
              className="canvas-roadmap-milestone relative grid grid-cols-[auto_1fr] gap-4 pl-1"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="relative z-[1] flex flex-col items-center">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-400/35 bg-sky-950/60 text-lg text-sky-200 shadow-[0_0_24px_rgba(56,189,248,0.25)]"
                  aria-hidden
                >
                  {ic}
                </span>
                <span className="mt-2 rounded-md bg-sky-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                  Year {y}
                </span>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3 backdrop-blur-sm transition hover:border-sky-500/35">
                <p className="text-[15px] font-semibold tracking-tight text-slate-50">{title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <style>{`
        @keyframes roadmap-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .canvas-roadmap-milestone {
          animation: roadmap-in 0.55s ease-out both;
        }
      `}</style>
    </div>
  );
}

/**
 * Right-hand canvas for Business Agent payloads (SWOT, P/L, radar, HTML embed).
 */
const TAB_IDS = new Set(["overview", "swot", "competitors", "radar", "financials", "outlook", "page"]);

const BusinessAnalysisCanvas = forwardRef(function BusinessAnalysisCanvas(
  {
    open,
    businessBlock = null,
    tabRequest = { id: 0, tab: "overview" },
    onClose,
    busy = false,
    shareUrl = "",
    onShare,
    onApplyRevision,
  },
  ref
) {
  const [tab, setTab] = useState("overview");
  const [revision, setRevision] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  const [publishedLiveUrl, setPublishedLiveUrl] = useState("");

  useEffect(() => {
    if (!tabRequest || typeof tabRequest.id !== "number") return;
    const t = tabRequest.tab;
    if (typeof t === "string" && TAB_IDS.has(t)) {
      setTab(t);
    }
  }, [tabRequest.id, tabRequest.tab]);

  useEffect(() => {
    setPublishedLiveUrl((shareUrl || "").trim());
  }, [shareUrl]);

  const b = businessBlock && typeof businessBlock === "object" ? businessBlock : null;
  const title = useMemo(() => {
    if (!b) return "Business analysis";
    const q = typeof b.query === "string" ? b.query.trim() : "";
    return q ? q.slice(0, 72) : "Business analysis";
  }, [b]);

  const swot = b?.swot && typeof b.swot === "object" ? b.swot : {};
  const swotRows = useMemo(() => {
    const rows = [];
    const S = Array.isArray(swot.strengths) ? swot.strengths : [];
    const W = Array.isArray(swot.weaknesses) ? swot.weaknesses : [];
    const O = Array.isArray(swot.opportunities) ? swot.opportunities : [];
    const T = Array.isArray(swot.threats) ? swot.threats : [];
    const n = Math.max(S.length, W.length, O.length, T.length, 1);
    for (let i = 0; i < n; i += 1) {
      rows.push([
        String(S[i] ?? "—"),
        String(W[i] ?? "—"),
        String(O[i] ?? "—"),
        String(T[i] ?? "—"),
      ]);
    }
    return rows;
  }, [swot]);

  const scenario = b?.scenario_simulation && typeof b.scenario_simulation === "object" ? b.scenario_simulation : {};
  const plRows = Array.isArray(scenario.pl_rows) ? scenario.pl_rows : [];
  const plHeaders = plRows.length ? plRows[0].map((c) => String(c ?? "")) : [];
  const plBody = plRows.length > 1 ? plRows.slice(1).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [])) : [];

  const chartData = useMemo(() => {
    const labels = Array.isArray(scenario.chart_series?.labels) ? scenario.chart_series.labels : [];
    const rev = Array.isArray(scenario.chart_series?.revenue) ? scenario.chart_series.revenue : [];
    if (!labels.length || !rev.length) return null;
    return {
      labels,
      datasets: [
        { label: "Revenue", data: rev, borderColor: "rgb(251, 191, 36)", backgroundColor: "rgba(251,191,36,0.25)" },
      ],
    };
  }, [scenario]);

  const radar = b?.competitor_radar && typeof b.competitor_radar === "object" ? b.competitor_radar : {};
  const axes = radar.axes && typeof radar.axes === "object" ? radar.axes : {};
  const rawHtml = b && typeof b.canvas_html === "string" ? b.canvas_html.trim() : "";
  const htmlDoc = useMemo(() => wrapHtmlForPreview(rawHtml), [rawHtml]);

  const overviewText = useMemo(() => stripExecutiveSummary(typeof b?.narrative_summary === "string" ? b.narrative_summary : ""), [b]);

  const actionNotes =
    b && typeof b._action_user_notes === "string" && b._action_user_notes.trim() ? b._action_user_notes.trim() : "";

  const livePageUrl = (shareUrl || publishedLiveUrl).trim();

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
    void onApplyRevision?.(t);
    setRevision("");
  }, [revision, busy, onApplyRevision]);

  if (!open) return null;

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      className={["relative z-[60] flex min-h-0 w-full flex-col lg:max-w-[60%] lg:basis-[60%]", SHELL].join(" ")}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.03] px-3 py-2.5 backdrop-blur-md">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90">Business Agent</p>
          <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>
          {b?.search_status ? (
            <p className="mt-0.5 text-[10px] text-slate-500">
              Live search: <span className="text-cyan-300/90">{String(b.search_status)}</span>
              {b?.confidence ? (
                <>
                  {" "}
                  · confidence <span className="text-emerald-300/90">{String(b.confidence)}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={busy || !b}
            className={HEADER_PILL_SHARE}
            title="Publish full report (radar, SWOT, financials) and copy link"
          >
            Share page
          </button>
          {livePageUrl ? (
            <span className="group/tooltip inline-flex">
              <button type="button" onClick={handleOpenLive} className={HEADER_PILL_LIVE}>
                <span aria-hidden>🌐</span>
                Open live
              </button>
              <span className={TOOLTIP_POP} role="tooltip">
                Opens the published report in a new tab
              </span>
            </span>
          ) : null}
          <button type="button" onClick={onClose} className={HEADER_PILL_GHOST}>
            Close
          </button>
        </div>
      </header>

      {shareMsg ? (
        <p className="shrink-0 border-b border-slate-800/80 bg-slate-900/50 px-3 py-1.5 text-[11px] text-emerald-300/90">{shareMsg}</p>
      ) : null}

      {actionNotes ? (
        <div className="shrink-0 border-b border-emerald-900/40 bg-emerald-950/25 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Your toolkit instructions</p>
          <p className="mt-1 text-[12px] leading-relaxed text-emerald-100/90">{actionNotes}</p>
        </div>
      ) : null}

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.05] bg-slate-950/50 px-2 py-2">
        {["overview", "swot", "competitors", "radar", "financials", "outlook", "page"].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              TAB_BTN,
              tab === id
                ? "border-amber-500/45 bg-amber-500/15 text-amber-100"
                : "border-slate-700/80 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200",
            ].join(" ")}
          >
            {id === "page" ? "Web page" : id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {busy ? (
          <p className="text-center text-sm text-slate-400">Running business analysis…</p>
        ) : null}
        {!b && !busy ? <p className="text-center text-sm text-slate-500">No business payload loaded.</p> : null}
        {b && tab === "overview" ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-6 ring-1 ring-slate-800/60">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Executive overview</p>
              <div className="mt-4 font-serif text-[15px] leading-[1.75] tracking-tight text-slate-100 [&_p]:my-3">
                {overviewText ? (
                  overviewText.split(/\n{2,}/).map((chunk, i) => (
                    <p key={i} className="whitespace-pre-wrap">
                      {chunk.trim()}
                    </p>
                  ))
                ) : (
                  <p className="text-slate-500">No narrative summary.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
        {b && tab === "swot" ? (
          <CanvasTable
            headers={["Strengths", "Weaknesses", "Opportunities", "Threats"]}
            rows={swotRows}
            subtitle="Interactive SWOT"
            title="Strategic balance"
            highlightMetrics
          />
        ) : null}
        {b && tab === "competitors" ? (
          <div className="space-y-4">
            {Array.isArray(b.competitor_analysis?.players) && b.competitor_analysis.players.length ? (
              b.competitor_analysis.players.map((pl, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4 shadow-inner ring-1 ring-slate-800/50"
                >
                  <p className="text-sm font-semibold text-slate-100">{String(pl.name || `Player ${idx + 1}`)}</p>
                  {Array.isArray(pl.strengths) && pl.strengths.length ? (
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/90">Strengths</p>
                  ) : null}
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-slate-200">
                    {(pl.strengths || []).map((x, i) => (
                      <li key={`s-${i}`}>{String(x)}</li>
                    ))}
                  </ul>
                  {Array.isArray(pl.weaknesses) && pl.weaknesses.length ? (
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-amber-300/90">Weaknesses</p>
                  ) : null}
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-slate-200">
                    {(pl.weaknesses || []).map((x, i) => (
                      <li key={`w-${i}`}>{String(x)}</li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No competitor rows in this payload.</p>
            )}
            {b.review_sentiment && typeof b.review_sentiment === "object" ? (
              <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-200/90">Review sentiment</p>
                <p className="mt-2 text-[13px] text-slate-200">{String(b.review_sentiment.summary || "")}</p>
                {Array.isArray(b.review_sentiment.gaps) && b.review_sentiment.gaps.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-slate-300">
                    {b.review_sentiment.gaps.map((g, i) => (
                      <li key={i}>{String(g)}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {b && tab === "radar" ? (
          <CompetitiveRadarMap points={radar.points} xLabel={String(axes.x || "X axis")} yLabel={String(axes.y || "Y axis")} />
        ) : null}
        {b && tab === "financials" ? (
          <div className="space-y-4">
            {plHeaders.length ? (
              <CanvasTable headers={plHeaders} rows={plBody} subtitle="Scenario P/L" title="What-if projection" highlightMetrics />
            ) : (
              <p className="text-sm text-slate-500">No P/L rows — run a full business query or call /tools/business/simulate.</p>
            )}
            {chartData ? (
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/35 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">Revenue path</p>
                <DataChart chartData={chartData} chartType="line" colorTheme="orange" />
              </div>
            ) : null}
            {b.market_cap && typeof b.market_cap === "object" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/25 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/90">Market value band</p>
                  <p className="mt-2 text-[18px] font-semibold tabular-nums text-emerald-100">
                    {String(b.market_cap.niche_value_band || "—")}
                  </p>
                  <p className="mt-3 text-[12px] leading-relaxed text-slate-300">{String(b.market_cap.methodology || "")}</p>
                </div>
              </div>
            ) : null}
            {b.smart_accounting && typeof b.smart_accounting === "object" ? (
              <div id="tunde-business-tax-report" className="rounded-xl border border-amber-800/35 bg-amber-950/20 p-4">
                <SmartAccountingPanel data={b.smart_accounting} />
              </div>
            ) : null}
          </div>
        ) : null}
        {b && tab === "outlook" ? (
          <OutlookRoadmap milestones={b.future_outlook?.milestones} />
        ) : null}
        {b && tab === "page" && rawHtml ? (
          <iframe
            title="Business canvas HTML"
            className="h-[min(70vh,720px)] w-full rounded-xl border border-slate-700/80 bg-white"
            srcDoc={htmlDoc}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : null}
        {b && tab === "page" && !rawHtml ? (
          <p className="mt-2 text-center text-[12px] text-slate-500">Generate a web page from the chat toolkit to preview HTML here.</p>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] bg-slate-950/90 px-3 py-3 backdrop-blur-md">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reference / adjustment</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Ask Business Agent to refine layout or tone. Uses the global canvas generate API with your full report as context.</p>
        <textarea
          value={revision}
          onChange={(e) => setRevision(e.target.value)}
          placeholder="e.g. Shorten the executive overview, emphasize EU compliance, tighten the radar axis labels…"
          rows={3}
          disabled={busy || !b}
          className="mt-2 w-full resize-y rounded-lg border border-white/[0.08] bg-black/35 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-600 focus:border-amber-500/45 focus:outline-none focus:ring-1 focus:ring-amber-500/30 disabled:opacity-40"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy || !revision.trim() || !b}
            onClick={applyRevision}
            className="rounded-lg border border-amber-500/45 bg-amber-500/15 px-4 py-1.5 text-[12px] font-semibold text-amber-50 hover:bg-amber-500/25 disabled:opacity-40"
          >
            {busy ? "Applying…" : "Apply revision"}
          </button>
        </div>
      </div>
    </aside>
  );
});

export default BusinessAnalysisCanvas;
