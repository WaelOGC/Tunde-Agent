/**
 * Builds a single publishable HTML document covering the full business payload
 * (summary, SWOT, competitors, radar narrative, financials, outlook).
 * Embedded `canvas_html` fragment is appended when present so live links mirror the Canvas.
 */

import { stripExecutiveSummary } from "./executiveText";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowsFromSwot(swot) {
  const S = Array.isArray(swot?.strengths) ? swot.strengths : [];
  const W = Array.isArray(swot?.weaknesses) ? swot.weaknesses : [];
  const O = Array.isArray(swot?.opportunities) ? swot.opportunities : [];
  const T = Array.isArray(swot?.threats) ? swot.threats : [];
  const n = Math.max(S.length, W.length, O.length, T.length, 1);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push([
      escapeHtml(S[i] ?? "—"),
      escapeHtml(W[i] ?? "—"),
      escapeHtml(O[i] ?? "—"),
      escapeHtml(T[i] ?? "—"),
    ]);
  }
  return rows;
}

/** @param {Record<string, unknown>} block */
export function buildFullBusinessReportHtml(block) {
  if (!block || typeof block !== "object") {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Business Agent</title></head><body></body></html>`;
  }

  const query = typeof block.query === "string" ? escapeHtml(block.query.trim()) : "";
  const summaryRaw = typeof block.narrative_summary === "string" ? block.narrative_summary : "";
  const summary = escapeHtml(stripExecutiveSummary(summaryRaw)).replace(/\n/g, "<br/>");

  const swot = block.swot && typeof block.swot === "object" ? block.swot : {};
  const swotRows = rowsFromSwot(swot);

  const players = Array.isArray(block.competitor_analysis?.players) ? block.competitor_analysis.players : [];

  const radar = block.competitor_radar && typeof block.competitor_radar === "object" ? block.competitor_radar : {};
  const axes = radar.axes && typeof radar.axes === "object" ? radar.axes : {};
  const rx = escapeHtml(String(axes.x || "X"));
  const ry = escapeHtml(String(axes.y || "Y"));
  const pts = Array.isArray(radar.points) ? radar.points : [];

  let radarRows = "";
  pts.forEach((p, i) => {
    const name = escapeHtml(typeof p?.name === "string" ? p.name : `Player ${i + 1}`);
    const x = typeof p?.x === "number" ? p.x : Number(p?.x) || 0;
    const y = typeof p?.y === "number" ? p.y : Number(p?.y) || 0;
    const hint = escapeHtml(typeof p?.share_hint === "string" ? p.share_hint : "");
    radarRows += `<tr><td>${name}</td><td>${escapeHtml(String(x))}</td><td>${escapeHtml(String(y))}</td><td>${hint || "—"}</td></tr>`;
  });

  const scenario = block.scenario_simulation && typeof block.scenario_simulation === "object" ? block.scenario_simulation : {};
  const plRows = Array.isArray(scenario.pl_rows) ? scenario.pl_rows : [];
  let plHead = "";
  let plBody = "";
  if (plRows.length) {
    const headers = plRows[0].map((c) => `<th>${escapeHtml(String(c ?? ""))}</th>`).join("");
    plHead = `<thead><tr>${headers}</tr></thead>`;
    const bodyLines = plRows.slice(1).map((row) => {
      const cells = (Array.isArray(row) ? row : []).map((c) => `<td>${escapeHtml(String(c ?? ""))}</td>`).join("");
      return `<tr>${cells}</tr>`;
    });
    plBody = `<tbody>${bodyLines.join("")}</tbody>`;
  }

  const mc = block.market_cap && typeof block.market_cap === "object" ? block.market_cap : null;
  const band = mc ? escapeHtml(String(mc.niche_value_band || "—")) : "";
  const meth = mc ? escapeHtml(String(mc.methodology || "")) : "";

  const sa = block.smart_accounting && typeof block.smart_accounting === "object" ? block.smart_accounting : null;
  let taxTable = "";
  if (sa?.quarterly_tax_report_stub && typeof sa.quarterly_tax_report_stub === "object") {
    const q = sa.quarterly_tax_report_stub;
    ["Q1", "Q2", "Q3", "Q4"].forEach((k) => {
      const v = escapeHtml(String(q[k] ?? "—"));
      taxTable += `<tr><th>${k}</th><td>${v}</td></tr>`;
    });
  }
  const saNotes = sa && typeof sa.notes === "string" ? escapeHtml(sa.notes) : "";

  const outlook = block.future_outlook && typeof block.future_outlook === "object" ? block.future_outlook : {};
  const milestones = Array.isArray(outlook.milestones) ? outlook.milestones : [];
  let mileHtml = "";
  milestones.forEach((m, i) => {
    const y = escapeHtml(String(m?.year ?? i + 1));
    const t = escapeHtml(String(m?.title ?? ""));
    const d = escapeHtml(String(m?.detail ?? ""));
    mileHtml += `<div class="milestone"><span class="y">${y}</span><div><strong>${t}</strong><p>${d}</p></div></div>`;
  });

  let playersHtml = "";
  players.forEach((pl, idx) => {
    const nm = escapeHtml(String(pl?.name || `Player ${idx + 1}`));
    const strengths = Array.isArray(pl?.strengths)
      ? pl.strengths.map((x) => `<li>${escapeHtml(String(x))}</li>`).join("")
      : "";
    const weaknesses = Array.isArray(pl?.weaknesses)
      ? pl.weaknesses.map((x) => `<li>${escapeHtml(String(x))}</li>`).join("")
      : "";
    playersHtml += `<article class="player"><h4>${nm}</h4>${
      strengths ? `<p class="lbl">Strengths</p><ul>${strengths}</ul>` : ""
    }${weaknesses ? `<p class="lbl">Weaknesses</p><ul>${weaknesses}</ul>` : ""}</article>`;
  });

  const canvasHtml = typeof block.canvas_html === "string" ? block.canvas_html.trim() : "";

  const title = query || "Business Agent · Business performance";

  const css = `
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0b0f14; color: #e2e8f0; line-height: 1.55; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 32px 20px 48px; }
    h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; color: #f8fafc; }
    .sub { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; margin-bottom: 28px; }
    section { margin-bottom: 36px; }
    h2 { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8; margin: 0 0 12px; }
    .card { border-radius: 14px; border: 1px solid rgba(148,163,184,0.18); background: rgba(15,23,42,0.55); padding: 18px 20px; }
    .summary { font-size: 1.05rem; color: #cbd5e1; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { border-bottom: 1px solid rgba(148,163,184,0.15); padding: 10px 12px; text-align: left; vertical-align: top; }
    th { color: #94a3b8; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .player { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(148,163,184,0.12); }
    .player h4 { margin: 0 0 8px; font-size: 1rem; color: #f1f5f9; }
    .lbl { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 10px 0 4px; }
    ul { margin: 4px 0 0 18px; padding: 0; }
    .milestone { display: grid; grid-template-columns: 52px 1fr; gap: 12px; margin-bottom: 14px; align-items: start; }
    .milestone .y { font-weight: 700; color: #38bdf8; font-size: 0.85rem; }
    .milestone p { margin: 4px 0 0; font-size: 0.875rem; color: #94a3b8; }
    .embed { margin-top: 12px; padding: 16px; border-radius: 12px; background: rgba(0,0,0,0.35); border: 1px solid rgba(245,158,11,0.25); overflow-x: auto; }
    footer { margin-top: 40px; font-size: 0.75rem; color: #64748b; }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
  <div class="wrap">
    <p class="sub">Business Agent · Business Performance Dashboard</p>
    <h1>${query || "Business intelligence report"}</h1>

    <section>
      <h2>Executive summary</h2>
      <div class="card summary">${summary || "<em>No summary provided.</em>"}</div>
    </section>

    <section>
      <h2>SWOT</h2>
      <div class="card">
        <table>
          <thead><tr><th>Strengths</th><th>Weaknesses</th><th>Opportunities</th><th>Threats</th></tr></thead>
          <tbody>
            ${swotRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Competitive landscape</h2>
      <div class="card">${playersHtml || "<p>No competitor rows in this payload.</p>"}</div>
    </section>

    <section>
      <h2>Competitor radar (${rx} · ${ry})</h2>
      <div class="card">
        <table>
          <thead><tr><th>Player</th><th>${rx}</th><th>${ry}</th><th>Share hint</th></tr></thead>
          <tbody>${radarRows || "<tr><td colspan=\"4\">No radar points.</td></tr>"}</tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Financials</h2>
      <div class="card">
        ${plHead ? `<table>${plHead}${plBody}</table>` : "<p>No P/L projection in this payload.</p>"}
        ${
          mc
            ? `<p style="margin-top:16px;font-size:0.9rem;"><strong>Market value band:</strong> ${band}</p><p style="font-size:0.85rem;color:#94a3b8;">${meth}</p>`
            : ""
        }
      </div>
    </section>

    <section>
      <h2>Smart accounting (illustrative)</h2>
      <div class="card">
        ${taxTable ? `<table>${taxTable}</table>` : "<p>No quarterly stub in this payload.</p>"}
        ${saNotes ? `<p style="margin-top:12px;font-size:0.85rem;color:#94a3b8;">${saNotes}</p>` : ""}
      </div>
    </section>

    <section>
      <h2>Five-year outlook</h2>
      <div class="card">${mileHtml || "<p>No milestones in this payload.</p>"}</div>
    </section>

    ${
      canvasHtml
        ? `<section><h2>Generated web canvas</h2><div class="embed">${canvasHtml}</div></section>`
        : ""
    }

    <footer>Generated by Business Agent · For decision support; verify material facts independently.</footer>
  </div>
</body>
</html>`;
}
