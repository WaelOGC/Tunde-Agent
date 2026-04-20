import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/** px — sync with Tailwind min/max classes on the composer textarea */
const COMPOSER_TEXTAREA_MIN_PX = 48;
const COMPOSER_TEXTAREA_MAX_PX = 280;
import { CanvasImage, CanvasImageError, CanvasImagePending } from "./canvas/CanvasImage";
import CanvasTable from "./canvas/CanvasTable";
import ImageGenerationWizard from "./ImageGenerationWizard";
import DataAnalystWizard from "./DataAnalystWizard";
import MoleculeHologram from "./MoleculeHologram";
import SpaceHologram from "./SpaceHologram";
import AnatomyVisual from "./AnatomyVisual";
import CodeBlock from "./CodeBlock";
import ResearchReportDocument from "./ResearchReportDocument";
import DataChart, { chartDataScatterConvertible } from "./DataChart";
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

/** Backend domain slug → short display label */
function scienceDomainBadgeLabel(domain) {
  const d = String(domain || "").toLowerCase();
  if (d === "physics") return "Physics";
  if (d === "biology") return "Biology";
  if (d === "earth_science") return "Earth Science";
  return "General";
}

function reactionTypeLabel(rt) {
  const r = String(rt || "").toLowerCase().replace(/-/g, "_");
  if (r === "organic") return "Organic";
  if (r === "inorganic") return "Inorganic";
  if (r === "acid_base") return "Acid–base";
  if (r === "redox") return "Redox";
  if (r === "general") return "General";
  return typeof rt === "string" && rt.trim() ? rt : "General";
}

function spaceTopicBadgeLabel(topic) {
  const t = String(topic || "").toLowerCase().replace(/-/g, "_");
  if (t === "solar_system") return "Solar System";
  if (t === "stars") return "Stars";
  if (t === "galaxies") return "Galaxies";
  if (t === "black_holes") return "Black Holes";
  if (t === "cosmology") return "Cosmology";
  if (t === "missions") return "Missions";
  return typeof topic === "string" && topic.trim() ? topic : "Space";
}

function healthCategoryBadgeLabel(category) {
  const c = String(category || "").toLowerCase().replace(/-/g, "_");
  if (c === "anatomy") return "Anatomy";
  if (c === "disease") return "Disease";
  if (c === "nutrition") return "Nutrition";
  if (c === "mental_health") return "Mental Health";
  if (c === "first_aid") return "First Aid";
  if (c === "medication") return "Medication";
  if (c === "general") return "General";
  return typeof category === "string" && category.trim() ? category : "General";
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

function translationToneBadgeClasses(toneRaw) {
  const t = (toneRaw || "").toLowerCase();
  if (t === "formal") {
    return "border-slate-500/45 bg-slate-500/10 text-slate-200/95";
  }
  if (t === "informal") {
    return "border-amber-500/45 bg-amber-500/10 text-amber-100/95";
  }
  return "border-slate-600/50 bg-slate-600/10 text-slate-300/95";
}

function translationToneLabel(toneRaw) {
  const t = (toneRaw || "").toLowerCase();
  if (t === "formal") return "Formal";
  if (t === "informal") return "Informal";
  return "Neutral";
}

function TranslationCopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const label = typeof text === "string" ? text : "";
  const copy = async () => {
    if (!label.trim()) return;
    try {
      await navigator.clipboard.writeText(label);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      disabled={!label.trim()}
      className="rounded-md border border-indigo-500/35 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-200/95 transition-colors hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {copied ? "Copied" : "Copy translation"}
    </button>
  );
}

function documentToneLabel(toneRaw) {
  const t = String(toneRaw || "").toLowerCase();
  if (t === "formal") return "Formal";
  if (t === "informal") return "Informal";
  if (t === "semi-formal" || t === "semi_formal") return "Semi-formal";
  return toneRaw ? String(toneRaw) : "Tone";
}

function formatDocumentTypeLabel(raw) {
  const s = String(raw || "other").replace(/_/g, " ");
  if (!s) return "Document";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** GitHub-style pipe tables on white paper (segmentMarkdownPipeTables output). */
function DocumentPipeTable({ headers, rows }) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) return null;
  const h = headers.map((x) => String(x ?? "").trim());
  const safeRows = rows.map((r) => {
    const row = Array.isArray(r) ? r : [];
    const copy = row.map((c) => String(c ?? "").trim());
    while (copy.length < h.length) copy.push("");
    return copy.slice(0, h.length);
  });
  return (
    <div className="my-4 w-full overflow-x-auto">
      <table
        className="w-full border-collapse text-left text-[#1a1a1a]"
        style={{ borderCollapse: "collapse", margin: "16px 0" }}
      >
        <thead>
          <tr>
            {h.map((cell, i) => (
              <th
                key={`th-${i}`}
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm font-semibold text-[#111111]"
                style={{ padding: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 600 }}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row, ri) => (
            <tr key={`tr-${ri}`}>
              {row.map((cell, ci) => (
                <td
                  key={`td-${ri}-${ci}`}
                  className="border border-slate-200 px-2 py-2 text-sm text-[#1a1a1a]"
                  style={{ padding: "8px", border: "1px solid #e2e8f0" }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderDocumentChunkMarkdown(chunk) {
  const prepared = prepareAssistantMarkdown(chunk || "");
  const segments = segmentMarkdownPipeTables(prepared);
  return segments.map((seg, si) => {
    if (seg.type === "table" && Array.isArray(seg.headers) && Array.isArray(seg.rows)) {
      return <DocumentPipeTable key={`dw-tbl-${si}`} headers={seg.headers} rows={seg.rows} />;
    }
    if (seg.type === "hr") {
      return (
        <hr
          key={`dw-hr-${si}`}
          className="my-6 border-0 border-t border-slate-300"
        />
      );
    }
    const t = typeof seg.text === "string" ? seg.text : "";
    return <AssistantFormattedText key={`dw-txt-${si}`} text={t} paper />;
  });
}

function DocumentSolutionBlock({ block, animationIndex = 0, messageId, onExportCanvas }) {
  const title = typeof block.title === "string" ? block.title : "";
  const content = typeof block.content === "string" ? block.content : "";
  const documentType = typeof block.document_type === "string" ? block.document_type : "other";
  const tone = typeof block.tone === "string" ? block.tone : "";
  const language = typeof block.language === "string" ? block.language : "";
  const confidence = typeof block.confidence === "string" ? block.confidence : "";
  const wordCount = Number(block.word_count) || 0;
  const sections = Array.isArray(block.sections) ? block.sections : [];
  const safeMid = String(messageId || "doc").replace(/[^a-zA-Z0-9_-]/g, "") || "doc";

  const fullText = [title.trim() ? `# ${title.trim()}` : "", content.trim()].filter(Boolean).join("\n\n");

  const parts = useMemo(() => {
    const c = content || "";
    if (!c.trim()) return [];
    const bits = c.split(/\n(?=#{1,3}\s+)/);
    const out = bits.map((t) => String(t).trim()).filter(Boolean);
    return out.length ? out : [c.trim()];
  }, [content]);

  const [copied, setCopied] = useState(false);
  const copyDoc = async () => {
    if (!fullText.trim()) return;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const downloadTxt = () => {
    if (!fullText.trim()) return;
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = (title || "document")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 80) || "document";
    a.href = url;
    a.download = `${slug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToSection = (idx) => {
    const el = document.getElementById(`dw-sec-${safeMid}-${idx}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const navEntries = useMemo(() => {
    if (parts.length > 1) {
      return parts.map((_, pi) => ({
        idx: pi,
        label: (sections[pi] && String(sections[pi]).trim()) || `Section ${pi + 1}`,
      }));
    }
    if (sections.length > 0) {
      return sections.map((s, si) => ({
        idx: 0,
        label: String(s).trim() || `Section ${si + 1}`,
      }));
    }
    return [];
  }, [parts, sections]);

  const metaBadge =
    "rounded-md border border-white/[0.12] bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/75";

  return (
    <div
      className="canvas-block-enter mt-4 overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_24px_48px_rgba(0,0,0,0.55)] first:mt-0"
      style={{ animationDelay: `${animationIndex * 50}ms`, backgroundColor: "#0d0f14" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5" style={{ backgroundColor: "#0d0f14" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-100/95">
            📝 Document Writer
          </span>
          <span className={metaBadge}>{formatDocumentTypeLabel(documentType)}</span>
          <span className={metaBadge}>{documentToneLabel(tone)}</span>
          {wordCount > 0 ? (
            <span className={metaBadge}>{wordCount.toLocaleString()} words</span>
          ) : null}
          {language.trim() ? <span className={metaBadge}>{language.trim()}</span> : null}
          {confidence ? <span className={metaBadge}>Confidence: {confidence}</span> : null}
        </div>
      </div>
      {navEntries.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-b border-white/[0.06] px-3 py-2.5" style={{ backgroundColor: "#0b0c10" }}>
          {navEntries.map((nav, pi) => (
            <button
              key={`sec-pill-${pi}-${nav.idx}`}
              type="button"
              onClick={() => scrollToSection(nav.idx)}
              className="rounded-full border border-violet-500/30 bg-violet-500/[0.08] px-3 py-1 text-[11px] font-medium text-violet-100/90 transition hover:border-violet-400/45 hover:bg-violet-500/15"
            >
              {nav.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="border-b border-white/[0.06] px-4 py-3" style={{ backgroundColor: "#0d0f14" }}>
        {title.trim() ? (
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-white/95 md:text-xl">{title.trim()}</h2>
        ) : null}
      </div>
      <div className="max-h-[min(70vh,520px)] overflow-y-auto px-3 py-3" style={{ backgroundColor: "#0d0f14" }}>
        <div
          className="document-paper-shell rounded-xl border border-slate-300/90 shadow-[0_4px_24px_rgba(15,23,42,0.12)]"
          style={{
            background: "white",
            color: "#1c1c1e",
            fontFamily: 'Georgia, "Times New Roman", serif',
            padding: "40px 48px",
          }}
        >
          {parts.map((chunk, ci) => (
            <div
              key={`part-${ci}`}
              id={`dw-sec-${safeMid}-${ci}`}
              className={ci > 0 ? "mt-6 border-t border-slate-200 pt-6" : ""}
            >
              <div className="min-w-0 text-[15px] leading-[1.75] text-[#1c1c1e]">{renderDocumentChunkMarkdown(chunk)}</div>
            </div>
          ))}
        </div>
      </div>
      <div
        className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-3 py-3"
        style={{ backgroundColor: "#0d0f14" }}
      >
        <button
          type="button"
          onClick={copyDoc}
          disabled={!fullText.trim()}
          className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-[12px] font-medium text-white/85 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? "Copied" : "📋 Copy Document"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof onExportCanvas !== "function") return;
            onExportCanvas(block, messageId);
          }}
          disabled={typeof onExportCanvas !== "function"}
          className="rounded-lg border border-violet-500/40 bg-violet-600/25 px-3 py-1.5 text-[12px] font-medium text-violet-50 transition hover:border-violet-400/55 hover:bg-violet-600/35 disabled:cursor-not-allowed disabled:opacity-40"
        >
          📄 Export to Canvas
        </button>
        <button
          type="button"
          onClick={downloadTxt}
          disabled={!fullText.trim()}
          className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-[12px] font-medium text-white/85 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
        >
          📥 Download TXT
        </button>
      </div>
    </div>
  );
}

function studyDifficultyTone(diffRaw) {
  const d = String(diffRaw || "").toLowerCase();
  if (d === "beginner") {
    return {
      badge: "border-emerald-500/50 bg-emerald-500/15 text-emerald-100/95",
      label: "Beginner",
    };
  }
  if (d === "advanced") {
    return {
      badge: "border-red-500/50 bg-red-500/15 text-red-100/95",
      label: "Advanced",
    };
  }
  return {
    badge: "border-amber-500/50 bg-amber-500/15 text-amber-100/95",
    label: "Intermediate",
  };
}

function StudyPlanChecklist({ steps }) {
  const [done, setDone] = useState(() => ({}));
  const toggle = (idx) => {
    setDone((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };
  if (!steps.length) {
    return <p className="px-3 py-2 text-sm text-slate-500">No study plan returned.</p>;
  }
  return (
    <ol className="list-decimal space-y-2.5 px-5 py-3 text-[13px] leading-relaxed text-slate-200 marker:text-sky-400/90">
      {steps.map((step, si) => (
        <li key={si} className="pl-1">
          <div className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={Boolean(done[si])}
              onChange={() => toggle(si)}
              className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-slate-600 bg-slate-900/80 text-sky-500 focus:ring-sky-500"
              aria-label={`Mark step ${si + 1} done`}
            />
            <span className={done[si] ? "text-slate-500 line-through decoration-slate-600" : ""}>
              {typeof step === "string" ? step : String(step)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function StudySolutionBlock({ block, animationIndex = 0 }) {
  const topic = typeof block.topic === "string" ? block.topic : "Study topic";
  const summary = typeof block.summary === "string" ? block.summary : "";
  const keyConcepts = Array.isArray(block.key_concepts) ? block.key_concepts : [];
  const studyPlan = Array.isArray(block.study_plan) ? block.study_plan : [];
  const memoryTips = Array.isArray(block.memory_tips) ? block.memory_tips : [];
  const practiceQs = Array.isArray(block.practice_questions) ? block.practice_questions : [];
  const practiceHints = Array.isArray(block.practice_hints) ? block.practice_hints : [];
  const diff = typeof block.difficulty_level === "string" ? block.difficulty_level : "intermediate";
  const est = typeof block.estimated_time === "string" ? block.estimated_time : "";
  const confidence = typeof block.confidence === "string" ? block.confidence : "";
  const diffTone = studyDifficultyTone(diff);

  return (
    <div
      className="canvas-block-enter mt-4 overflow-hidden rounded-xl border border-sky-900/45 bg-gradient-to-br from-sky-950/35 via-indigo-950/30 to-slate-950/90 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-indigo-800/25 first:mt-0"
      style={{ animationDelay: `${animationIndex * 50}ms` }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-sky-900/35 px-3 py-3">
        <h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-white">{topic}</h3>
        <span
          className={[
            "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            diffTone.badge,
          ].join(" ")}
        >
          {diffTone.label}
        </span>
        {est.trim() ? (
          <span className="shrink-0 rounded-md border border-indigo-500/35 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-100/95">
            ⏱ {est}
          </span>
        ) : null}
        {confidence ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Confidence: {confidence}
          </span>
        ) : null}
      </div>
      {summary.trim() ? (
        <div className="border-b border-sky-900/25 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-400/90">Summary</p>
          <div className="mt-2 text-[13px] leading-relaxed text-slate-200 [&_p]:my-2">
            <AssistantFormattedText text={summary} />
          </div>
        </div>
      ) : null}
      {keyConcepts.length ? (
        <div className="border-b border-sky-900/25 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-400/90">Key concepts</p>
          <ol className="mt-3 space-y-2">
            {keyConcepts.map((c, ci) => (
              <li
                key={ci}
                className="flex gap-3 rounded-lg border border-sky-800/35 bg-sky-950/25 px-3 py-2.5 text-[13px] leading-snug text-slate-100"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/20 text-xs font-bold text-sky-100">
                  {ci + 1}
                </span>
                <span className="min-w-0 pt-0.5">{typeof c === "string" ? c : String(c)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="border-b border-sky-900/25">
        <p className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-wider text-sky-400/90">Study plan</p>
        <StudyPlanChecklist steps={studyPlan} />
      </div>
      {memoryTips.length ? (
        <div className="border-b border-sky-900/25 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-400/90">Memory tips</p>
          <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-slate-200">
            {memoryTips.map((tip, ti) => (
              <li key={ti} className="flex gap-2">
                <span className="shrink-0" aria-hidden>
                  💡
                </span>
                <span>{typeof tip === "string" ? tip : String(tip)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {practiceQs.length ? (
        <div className="px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-400/90">Practice</p>
          <div className="mt-2 space-y-2">
            {practiceQs.map((q, qi) => {
              const hint =
                typeof practiceHints[qi] === "string" && practiceHints[qi].trim()
                  ? practiceHints[qi].trim()
                  : "Recall the key terms from the summary and explain them in your own words.";
              const qtext = typeof q === "string" ? q : String(q);
              return (
                <details
                  key={qi}
                  className="group overflow-hidden rounded-lg border border-indigo-800/40 bg-indigo-950/20"
                >
                  <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-medium leading-snug text-slate-100 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="mr-2 inline-block text-sky-400/90 transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    {qtext}
                  </summary>
                  <div className="border-t border-indigo-900/35 bg-slate-950/40 px-3 py-2.5 text-[12px] leading-relaxed text-indigo-100/95">
                    <span className="font-semibold text-sky-300/95">Hint · </span>
                    {hint}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const DATA_INSIGHT_ICONS = ["💡", "📌", "📊", "🔎", "✨"];

function dataQualityBadgeTone(scoreRaw) {
  const s = String(scoreRaw || "").toLowerCase();
  if (s === "good") {
    return {
      badge: "border-emerald-500/55 bg-emerald-500/15 text-emerald-100/95",
      label: "Good",
    };
  }
  if (s === "poor") {
    return {
      badge: "border-red-500/55 bg-red-500/15 text-red-100/95",
      label: "Poor",
    };
  }
  return {
    badge: "border-amber-500/55 bg-amber-500/15 text-amber-100/95",
    label: "Fair",
  };
}

const DATA_DEEP_DIVE_PROMPT =
  "Provide a deeper statistical interpretation of this dataset: how columns relate, caveats from the aggregates, and what a stakeholder should verify next. Stay grounded in the given statistics and insights only.";

function stripMarkdown(text) {
  const s = typeof text === "string" ? text : String(text ?? "");
  return s
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/^\s*[-*+]\s/gm, "• ");
}

function trendArrow(direction) {
  const d = String(direction || "").toLowerCase();
  if (d === "up") return "↑";
  if (d === "down") return "↓";
  return "→";
}

function DataSolutionBlock({
  block,
  blockIndex = 0,
  animationIndex = 0,
  messageId,
  connected,
  onExportCanvas,
  onDataAnalystFollowUp,
}) {
  const [exportBusy, setExportBusy] = useState(false);
  const [deepBusy, setDeepBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [showTrends, setShowTrends] = useState(false);
  const [chartHighlight, setChartHighlight] = useState(false);
  const chartRef = useRef(null);

  const chartData = block.chart_data && typeof block.chart_data === "object" ? block.chart_data : {};
  const suggested =
    typeof chartData.suggested_chart === "string" ? chartData.suggested_chart.toLowerCase() : "bar";
  const [chartType, setChartType] = useState(
    ["bar", "line", "pie", "scatter"].includes(suggested) ? suggested : "bar"
  );
  const [colorTheme, setColorTheme] = useState("purple");

  useEffect(() => {
    const cd = block.chart_data && typeof block.chart_data === "object" ? block.chart_data : {};
    const s = typeof cd.suggested_chart === "string" ? cd.suggested_chart.toLowerCase() : "bar";
    setChartType(["bar", "line", "pie", "scatter"].includes(s) ? s : "bar");
  }, [block.chart_data]);

  const name = typeof block.dataset_name === "string" ? block.dataset_name : "Dataset";
  const rowCount = Number(block.row_count) || 0;
  const colCount = Number(block.column_count) || 0;
  const columns = Array.isArray(block.columns) ? block.columns : [];
  const stats = block.summary_stats && typeof block.summary_stats === "object" ? block.summary_stats : {};
  const insights = Array.isArray(block.key_insights) ? block.key_insights : [];
  const narrative = typeof block.ai_narrative === "string" ? block.ai_narrative : "";
  const alerts = Array.isArray(block.smart_alerts) ? block.smart_alerts : [];
  const dq = block.data_quality && typeof block.data_quality === "object" ? block.data_quality : {};
  const dqScore = typeof dq.score === "string" ? dq.score : "fair";
  const dqNotes = typeof dq.notes === "string" ? dq.notes : "";
  const confidence = typeof block.confidence === "string" ? block.confidence : "";
  const dqTone = dataQualityBadgeTone(dqScore);
  const sourceData = typeof block.source_data === "string" ? block.source_data : "";
  const trends = Array.isArray(block.trends) ? block.trends : [];
  const predictions = Array.isArray(block.predictions) ? block.predictions : [];
  const followUps = Array.isArray(block.follow_up_history) ? block.follow_up_history : [];
  const scatterOk = chartDataScatterConvertible(chartData);
  const hasChart = Array.isArray(chartData.datasets) && chartData.datasets.length > 0;

  const handleDownload = () => {
    setFollowUpOpen(false);
    if (!sourceData.trim()) return;
    const blob = new Blob([sourceData], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const slug = (name || "dataset")
      .trim()
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 48);
    a.href = URL.createObjectURL(blob);
    a.download = `${slug || "dataset"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleExport = async () => {
    if (!onExportCanvas || exportBusy || !connected) return;
    setFollowUpOpen(false);
    setExportBusy(true);
    try {
      await onExportCanvas(block, messageId);
    } finally {
      setExportBusy(false);
    }
  };

  const runFollowUp = async (question) => {
    const q = (question || "").trim();
    if (!q || !onDataAnalystFollowUp || !connected || !messageId) return;
    setFollowBusy(true);
    setDeepBusy(false);
    try {
      await onDataAnalystFollowUp(messageId, q, block, blockIndex);
    } finally {
      setFollowBusy(false);
    }
  };

  const handleDeepDive = async () => {
    if (!onDataAnalystFollowUp || deepBusy || !connected) return;
    setDeepBusy(true);
    try {
      await onDataAnalystFollowUp(messageId, DATA_DEEP_DIVE_PROMPT, block, blockIndex);
    } finally {
      setDeepBusy(false);
    }
  };

  const handleFollowSubmit = (e) => {
    e.preventDefault();
    const q = followUpText.trim();
    if (!q || followBusy) return;
    void runFollowUp(q).then(() => setFollowUpText(""));
  };

  return (
    <div
      className="canvas-block-enter mt-4 overflow-hidden rounded-xl border border-cyan-900/50 bg-gradient-to-br from-cyan-950/40 via-teal-950/25 to-slate-950/90 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-teal-800/30 first:mt-0"
      style={{ animationDelay: `${animationIndex * 50}ms` }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-cyan-900/35 px-3 py-3">
        <h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-white">{name}</h3>
        <span className="shrink-0 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100/95">
          {rowCount} rows
        </span>
        <span className="shrink-0 rounded-md border border-teal-500/40 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-100/95">
          {colCount} cols
        </span>
        <span
          className={[
            "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            dqTone.badge,
          ].join(" ")}
        >
          Quality · {dqTone.label}
        </span>
        {confidence ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Confidence: {confidence}
          </span>
        ) : null}
      </div>
      {dqNotes.trim() ? (
        <div className="border-b border-cyan-900/25 px-3 py-2 text-[12px] leading-snug text-slate-400">
          {dqNotes}
        </div>
      ) : null}
      {narrative.trim() ? (
        <div className="border-b border-cyan-900/25 bg-cyan-500/[0.08] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/95">AI narrative</p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-100">{narrative}</p>
        </div>
      ) : null}
      {insights.length ? (
        <div className="border-b border-cyan-900/25 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-300/95">Key insights</p>
          <ol className="mt-3 space-y-2">
            {insights.map((ins, ii) => {
              const ic = DATA_INSIGHT_ICONS[ii % DATA_INSIGHT_ICONS.length];
              const text = typeof ins === "string" ? ins : String(ins);
              return (
                <li
                  key={ii}
                  className="flex gap-3 rounded-lg border border-teal-800/40 bg-teal-950/20 px-3 py-2.5 text-[13px] leading-snug text-slate-100"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-500/20 text-sm" aria-hidden>
                    {ic}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="mr-2 font-bold text-cyan-300/95">{ii + 1}.</span>
                    {text}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
      {alerts.length ? (
        <div className="border-b border-cyan-900/25 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-300/95">Smart alerts</p>
          <ul className="mt-2 space-y-2">
            {alerts.map((al, ai) => (
              <li
                key={ai}
                className="rounded-lg border border-orange-600/45 bg-orange-950/35 px-3 py-2 text-[13px] leading-relaxed text-orange-100/95"
              >
                {typeof al === "string" ? al : String(al)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {columns.length ? (
        <div className="border-b border-cyan-900/25 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/95">Summary statistics</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-cyan-900/40 bg-slate-950/50">
            <table className="min-w-full text-left text-[12px] text-slate-200">
              <thead>
                <tr className="border-b border-cyan-900/50 bg-slate-900/80 text-[10px] font-semibold uppercase tracking-wide text-cyan-200/90">
                  <th className="px-3 py-2">Column</th>
                  <th className="px-3 py-2">Min</th>
                  <th className="px-3 py-2">Max</th>
                  <th className="px-3 py-2">Mean</th>
                  <th className="px-3 py-2">Median</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col) => {
                  const st = stats[col];
                  const row = st && typeof st === "object" ? st : {};
                  const fmt = (v) => (v === null || v === undefined || Number.isNaN(v) ? "—" : String(v));
                  return (
                    <tr key={col} className="border-b border-cyan-950/40 last:border-b-0">
                      <td className="px-3 py-2 font-medium text-cyan-100/95">{col}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-300">{fmt(row.min)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-300">{fmt(row.max)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-300">{fmt(row.mean)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-300">{fmt(row.median)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {hasChart ? (
        <div
          ref={chartRef}
          className={[
            "border-b border-cyan-900/25 px-3 py-3 transition-shadow duration-300",
            chartHighlight ? "rounded-lg ring-2 ring-cyan-400/80 ring-offset-2 ring-offset-slate-950" : "",
          ].join(" ")}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/95">Interactive chart</p>
          <div className="mt-2">
            <DataChart chartData={chartData} chartType={chartType} colorTheme={colorTheme} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["bar", "line", "pie", "scatter"].map((t) => (
              <button
                key={t}
                type="button"
                disabled={t === "scatter" && !scatterOk}
                onClick={() => setChartType(t)}
                className={[
                  "rounded-md border px-2.5 py-1 text-[11px] font-semibold capitalize transition",
                  chartType === t
                    ? "border-cyan-400/60 bg-cyan-500/25 text-white"
                    : "border-cyan-900/50 bg-slate-950/50 text-slate-400 hover:border-cyan-700/50 hover:text-slate-200",
                  t === "scatter" && !scatterOk ? "cursor-not-allowed opacity-35" : "",
                ].join(" ")}
                title={t === "scatter" && !scatterOk ? "Scatter needs labels plus a numeric series (or x/y points)" : t}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Theme</span>
            {[
              { id: "purple", label: "Purple" },
              { id: "blue", label: "Blue" },
              { id: "green", label: "Green" },
              { id: "orange", label: "Orange" },
            ].map((th) => (
              <button
                key={th.id}
                type="button"
                onClick={() => setColorTheme(th.id)}
                className={[
                  "rounded-md border px-2.5 py-1 text-[11px] font-medium transition",
                  colorTheme === th.id
                    ? "border-violet-400/55 bg-violet-500/20 text-violet-100"
                    : "border-slate-700/60 bg-slate-900/60 text-slate-400 hover:border-slate-600",
                ].join(" ")}
              >
                {th.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showTrends ? (
        <div className="border-b border-cyan-900/25 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-300/95">Trends & predictions</p>
          {!trends.length && !predictions.length ? (
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
              No trend signals or projections were returned for this dataset.
            </p>
          ) : null}
          {trends.length ? (
            <ul className="mt-2 space-y-2">
              {trends.map((tr, ti) => {
                const metric = typeof tr.metric === "string" ? tr.metric : "Metric";
                const dir = typeof tr.direction === "string" ? tr.direction : "stable";
                const detail = typeof tr.detail === "string" ? tr.detail : "";
                return (
                  <li
                    key={ti}
                    className="rounded-lg border border-teal-800/40 bg-teal-950/25 px-3 py-2 text-[12px] text-slate-200"
                  >
                    <span className="font-mono text-sm text-cyan-300" aria-hidden>
                      {trendArrow(dir)}
                    </span>{" "}
                    <span className="font-semibold text-cyan-100/95">{metric}</span>
                    <span className="text-slate-500"> · </span>
                    <span className="text-slate-300">{detail}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {predictions.length ? (
            <ul className="mt-3 space-y-2">
              {predictions.map((pr, pi) => (
                <li
                  key={pi}
                  className="rounded-lg border border-violet-800/35 bg-violet-950/20 px-3 py-2 text-[12px] leading-relaxed text-violet-100/95"
                >
                  {typeof pr.text === "string" ? pr.text : String(pr.text ?? "")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {followUps.length ? (
        <div className="border-b border-cyan-900/25 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Follow-up</p>
          <div className="mt-2 space-y-3">
            {followUps.map((fu, fi) => (
              <div key={fi} className="rounded-lg border border-slate-700/50 bg-slate-950/40 px-3 py-2">
                <p className="text-[11px] font-medium text-cyan-300/90">
                  Q: {typeof fu.question === "string" ? fu.question : ""}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-slate-200 whitespace-pre-wrap">
                  {typeof fu.answer === "string"
                    ? String(fu.question || "").trim() === DATA_DEEP_DIVE_PROMPT.trim()
                      ? stripMarkdown(fu.answer)
                      : fu.answer
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 border-b border-cyan-900/25 px-3 py-3">
        <button
          type="button"
          onClick={() => {
            chartRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            setChartHighlight(true);
            window.setTimeout(() => setChartHighlight(false), 2200);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/50 bg-slate-900/60 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-cyan-600/40"
        >
          🔄 Change Chart
        </button>
        <button
          type="button"
          disabled={!onDataAnalystFollowUp || deepBusy || !connected}
          onClick={() => void handleDeepDive()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/50 bg-slate-900/60 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-cyan-600/40 disabled:opacity-40"
        >
          {deepBusy ? "⏳ …" : "🔍 Deep Dive"}
        </button>
        <button
          type="button"
          onClick={() => setShowTrends((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/50 bg-slate-900/60 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-cyan-600/40"
        >
          📈 {showTrends ? "Hide Trends" : "Show Trends"}
        </button>
        <button
          type="button"
          onClick={() => setFollowUpOpen((o) => !o)}
          disabled={!onDataAnalystFollowUp || !connected}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/50 bg-slate-900/60 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-cyan-600/40 disabled:opacity-40"
        >
          💬 Ask Follow-up
        </button>
        <button
          type="button"
          disabled={!connected || exportBusy}
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/45 bg-cyan-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100/95 hover:bg-cyan-500/25 disabled:opacity-40"
        >
          {exportBusy ? "⏳ …" : "📄 Export Canvas"}
        </button>
        <button
          type="button"
          disabled={!sourceData.trim()}
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/45 bg-teal-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-teal-100/95 hover:bg-teal-500/20 disabled:opacity-40"
        >
          📥 Download Excel
        </button>
      </div>
      {followUpOpen ? (
        <form onSubmit={handleFollowSubmit} className="border-b border-cyan-900/25 px-3 py-3">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Your question about this data
          </label>
          <textarea
            value={followUpText}
            onChange={(e) => setFollowUpText(e.target.value)}
            rows={2}
            className="mt-1.5 w-full resize-y rounded-lg border border-cyan-900/50 bg-slate-950/80 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
            placeholder="e.g. Which column looks most volatile?"
            disabled={followBusy || !connected}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFollowUpOpen(false)}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-[12px] text-slate-300 hover:bg-slate-800/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={followBusy || !followUpText.trim() || !connected}
              className="rounded-lg border border-violet-500/50 bg-violet-500/20 px-3 py-1.5 text-[12px] font-semibold text-violet-100 disabled:opacity-40"
            >
              {followBusy ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
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
      {
        id: "code_assistant",
        label: "Code Assistant",
        hint: "Write, debug, explain, review — syntax-highlighted output",
        live: true,
      },
      {
        id: "translation_agent",
        label: "Translation",
        hint: "50+ languages — detection, tone, transliteration & alternatives",
        live: true,
      },
      {
        id: "research_agent",
        label: "Research Agent",
        hint: "Multi-source summaries, citations, credibility & debates",
        live: true,
      },
      {
        id: "data_analyst",
        label: "Data Analyst",
        hint: "CSV / JSON — stats, insights, narrative, alerts & Canvas export",
        live: true,
      },
    ],
  },
  {
    category: "Education",
    items: [
      { id: "math_solver", label: "Math Solver", hint: "Step-by-step algebra, calculus & more", live: true },
      {
        id: "science_agent",
        label: "Science Agent",
        hint: "Physics, biology, earth science & more",
        live: true,
      },
      {
        id: "chemistry_agent",
        label: "Chemistry Agent",
        hint: "Reactions, balancing & 3D molecules",
        live: true,
      },
      {
        id: "space_agent",
        label: "Space Agent",
        hint: "Astronomy, missions, 3D solar system & cosmic views",
        live: true,
      },
      {
        id: "health_agent",
        label: "Health Agent",
        hint: "Education only — anatomy, wellness, terminology (not medical advice)",
        live: true,
      },
      {
        id: "study_assistant",
        label: "Study Assistant",
        hint: "Summaries, study plans, memory tips & practice — learning-focused",
        live: true,
      },
    ],
  },
  {
    category: "Business",
    items: [
      { id: "simulation", label: "Simulation", live: false },
      { id: "voice", label: "Voice", live: false },
      {
        id: "document_writer",
        label: "Document Writer",
        hint: "Reports, proposals, emails, letters — professional drafts",
        live: true,
      },
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
  { id: "data", label: "Analyze data" },
  { id: "image", label: "Generate image" },
  { id: "science", label: "Science question" },
  { id: "chemistry", label: "Chemistry" },
  { id: "space", label: "Space" },
  { id: "health", label: "Health" },
  { id: "study", label: "Study topic" },
  { id: "math", label: "Math problem" },
  { id: "document", label: "Write document" },
];

function canvasCardKindMeta(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "web_page") return { icon: "🌐", label: "Web page" };
  if (k === "infographic") return { icon: "📊", label: "Infographic" };
  if (k === "data_export") return { icon: "📊", label: "Data report" };
  if (k === "document_export") return { icon: "📝", label: "Document" };
  return { icon: "📄", label: "Canvas" };
}

function formatCanvasCardTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CanvasSavedCard({ block, onOpen, animationIndex = 0 }) {
  const title = typeof block.title === "string" ? block.title.trim() : "Canvas";
  const ck = typeof block.kind === "string" ? block.kind : "";
  const messageId = typeof block.messageId === "string" ? block.messageId : "";
  const generatedAt = typeof block.generatedAt === "string" ? block.generatedAt : "";
  const meta = canvasCardKindMeta(ck);
  const sub = formatCanvasCardTime(generatedAt);
  return (
    <div
      className="canvas-block-enter mt-3 max-w-md overflow-hidden rounded-xl border border-slate-700/70 bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-3 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-slate-700/40"
      style={{ animationDelay: `${animationIndex * 50}ms` }}
    >
      <p className="text-[12px] font-medium leading-snug text-slate-100">
        <span className="text-slate-300" aria-hidden>
          {meta.icon}
        </span>{" "}
        <span className="text-slate-400">{meta.label}</span>
        <span className="text-slate-600"> · </span>
        <span>{title}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">Generated{sub ? ` · ${sub}` : ""}</p>
        <button
          type="button"
          onClick={() => onOpen?.(messageId, ck)}
          className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-100 transition hover:border-violet-400/60 hover:bg-violet-500/25"
        >
          Open
        </button>
      </div>
    </div>
  );
}

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
        if (seg.type === "hr") {
          return <hr key={`hr-${i}`} className="my-4 border-0 border-t border-white/15" />;
        }
        return (
          <AssistantFormattedText key={`txt-${i}`} text={seg.text} />
        );
      })}
    </div>
  );
}

function MessageBlocks({
  blocks,
  messageId,
  canvasOpen = false,
  canvasView = "landing",
  canvasLinkedMessageId = null,
  onCanvasChipFocus,
  onRetryLastPrompt,
  onScienceReadingTopic,
  connected = true,
  onDataAnalystExportCanvas,
  onDocumentWriterExportCanvas,
  onCanvasCardOpen,
  onDataAnalystFollowUp,
}) {
  if (!blocks || !blocks.length) return null;
  const canvasChipActive =
    Boolean(canvasOpen) &&
    typeof messageId === "string" &&
    canvasLinkedMessageId != null &&
    messageId === canvasLinkedMessageId;
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
        if (kind === "math_solution") {
          const steps = Array.isArray(b.steps) ? b.steps : [];
          const answer = typeof b.answer === "string" ? b.answer : String(b.answer ?? "");
          const topic = typeof b.topic === "string" ? b.topic : "Math";
          const confidence = typeof b.confidence === "string" ? b.confidence : "";
          return (
            <div
              key={i}
              className="canvas-block-enter mt-4 overflow-hidden rounded-xl border border-amber-900/45 bg-gradient-to-br from-amber-950/30 to-slate-950/80 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-amber-800/25 first:mt-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-amber-900/30 px-3 py-2">
                <span className="rounded-md border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200/95">
                  {topic}
                </span>
                {confidence ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Confidence: {confidence}
                  </span>
                ) : null}
              </div>
              {steps.length ? (
                <ol className="list-decimal space-y-2 px-5 py-3 text-[13px] leading-relaxed text-slate-200 marker:text-amber-500/80">
                  {steps.map((line, si) => (
                    <li key={si} className="pl-1">
                      {line}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-3 py-2 text-sm text-slate-500">No steps returned.</p>
              )}
              {answer ? (
                <div className="border-t border-amber-900/30 bg-amber-500/[0.07] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">Final answer</p>
                  <p className="mt-1.5 text-base font-semibold tracking-tight text-white">{answer}</p>
                </div>
              ) : null}
            </div>
          );
        }
        if (kind === "science_solution") {
          const explanation = typeof b.explanation === "string" ? b.explanation : "";
          const concepts = Array.isArray(b.key_concepts) ? b.key_concepts : [];
          const example = typeof b.real_world_example === "string" ? b.real_world_example : "";
          const reading = Array.isArray(b.further_reading) ? b.further_reading : [];
          const domainSlug = typeof b.domain === "string" ? b.domain : "general";
          const confidence = typeof b.confidence === "string" ? b.confidence : "";
          const debated = Boolean(b.is_debated);
          const domainBadge = scienceDomainBadgeLabel(domainSlug);

          return (
            <div
              key={i}
              className="canvas-block-enter mt-4 overflow-hidden rounded-xl border border-emerald-900/45 bg-gradient-to-br from-emerald-950/35 via-teal-950/25 to-slate-950/80 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-emerald-800/25 first:mt-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-emerald-900/35 px-3 py-2">
                <span className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200/95">
                  {domainBadge}
                </span>
                {confidence ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Confidence: {confidence}
                  </span>
                ) : null}
                {debated ? (
                  <span className="rounded-md border border-amber-600/45 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/95">
                    Debated topic
                  </span>
                ) : null}
              </div>
              {explanation.trim() ? (
                <div className="border-b border-emerald-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/90">
                    Explanation
                  </p>
                  <div className="mt-2 text-[13px] leading-relaxed text-slate-200 [&_p]:my-2">
                    <AssistantFormattedText text={explanation} />
                  </div>
                </div>
              ) : null}
              {concepts.length ? (
                <div className="border-b border-emerald-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/90">
                    Key concepts
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {concepts.map((c, ci) => (
                      <span
                        key={ci}
                        className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-[12px] text-teal-100/95"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {example.trim() ? (
                <div className="border-b border-emerald-900/25 bg-emerald-500/[0.07] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">
                    Real-world example
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-100">{example}</p>
                </div>
              ) : null}
              {reading.length ? (
                <div className="px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/90">
                    Further reading
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {reading.map((topic, ri) => (
                      <button
                        key={ri}
                        type="button"
                        onClick={() => onScienceReadingTopic?.(topic)}
                        className="rounded-lg border border-teal-500/35 bg-teal-500/10 px-3 py-1.5 text-left text-[12px] font-medium text-teal-100/95 transition-colors hover:border-teal-400/55 hover:bg-teal-500/15"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        }
        if (kind === "chemistry_solution") {
          const reactionSlug = typeof b.reaction_type === "string" ? b.reaction_type : "general";
          const explanation = typeof b.explanation === "string" ? b.explanation : "";
          const balanced = typeof b.balanced_equation === "string" ? b.balanced_equation : "";
          const molecules = Array.isArray(b.molecules) ? b.molecules : [];
          const hazardLevel = String(b.hazard_level || "none").toLowerCase();
          const hazardWarning = typeof b.hazard_warning === "string" ? b.hazard_warning : "";
          const safetyTips = Array.isArray(b.safety_tips) ? b.safety_tips : [];
          const confidence = typeof b.confidence === "string" ? b.confidence : "";
          const showHazardBanner = hazardLevel === "medium" || hazardLevel === "high";

          return (
            <div
              key={i}
              className="canvas-block-enter mt-4 overflow-hidden rounded-xl border border-orange-900/45 bg-gradient-to-br from-orange-950/35 via-amber-950/25 to-slate-950/80 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-orange-800/25 first:mt-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-orange-900/35 px-3 py-2">
                <span className="rounded-md border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-200/95">
                  {reactionTypeLabel(reactionSlug)}
                </span>
                {confidence ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Confidence: {confidence}
                  </span>
                ) : null}
                <span className="rounded-md border border-orange-700/35 bg-orange-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-orange-400/90">
                  Hazard: {hazardLevel}
                </span>
              </div>
              {balanced.trim() ? (
                <div className="border-b border-orange-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-500/90">
                    Balanced equation
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-orange-900/40 bg-slate-950/80 px-3 py-2 font-mono text-[13px] leading-relaxed text-orange-100/95">
                    {balanced}
                  </pre>
                </div>
              ) : null}
              {showHazardBanner && hazardWarning.trim() ? (
                <div className="border-b border-red-900/40 bg-red-950/35 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Hazard warning</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-red-100/95">{hazardWarning}</p>
                </div>
              ) : null}
              {explanation.trim() ? (
                <div className="border-b border-orange-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-500/90">
                    Explanation
                  </p>
                  <div className="mt-2 text-[13px] leading-relaxed text-slate-200 [&_p]:my-2">
                    <AssistantFormattedText text={explanation} />
                  </div>
                </div>
              ) : null}
              {molecules.length ? (
                <div className="border-b border-orange-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-500/90">
                    3D structures
                  </p>
                  <div className="mt-3 flex flex-wrap gap-5">
                    {molecules.map((mol, mi) => (
                      <MoleculeHologram
                        key={`mol-${i}-${mi}`}
                        name={typeof mol?.name === "string" ? mol.name : ""}
                        formula={typeof mol?.formula === "string" ? mol.formula : ""}
                        atoms={Array.isArray(mol?.atoms) ? mol.atoms : []}
                        bonds={Array.isArray(mol?.bonds) ? mol.bonds : []}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              {safetyTips.length ? (
                <div className="px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-500/90">
                    Safety tips
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-slate-200">
                    {safetyTips.map((tip, ti) => (
                      <li key={ti}>{typeof tip === "string" ? tip : String(tip)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        }
        if (kind === "health_solution") {
          const catSlug = typeof b.category === "string" ? b.category : "general";
          const explanation = typeof b.explanation === "string" ? b.explanation : "";
          const keyFacts = Array.isArray(b.key_facts) ? b.key_facts : [];
          const whenDoctor = typeof b.when_to_see_doctor === "string" ? b.when_to_see_doctor : "";
          const emergency = Boolean(b.emergency_warning);
          const sources = Array.isArray(b.sources) ? b.sources : [];
          const confidence = typeof b.confidence === "string" ? b.confidence : "";
          const disclaimer = typeof b.disclaimer === "string" ? b.disclaimer : "";
          const catBadge = healthCategoryBadgeLabel(catSlug);

          return (
            <div
              key={i}
              className="canvas-block-enter mt-4 overflow-hidden rounded-xl border border-green-900/45 bg-gradient-to-br from-green-950/35 via-emerald-950/25 to-slate-950/85 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-green-800/25 first:mt-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-green-900/35 px-3 py-2">
                <span className="rounded-md border border-green-500/45 bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-green-100/95">
                  {catBadge}
                </span>
                {confidence ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Confidence: {confidence}
                  </span>
                ) : null}
              </div>
              {emergency ? (
                <div className="border-b border-red-700/50 bg-red-950/55 px-3 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-300">
                    🚨 EMERGENCY: Please call emergency services immediately (112/911)
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-red-100/95">
                    If you or someone else may be having a medical emergency, contact local emergency services
                    now. This assistant cannot provide emergency triage or diagnosis.
                  </p>
                </div>
              ) : null}
              {explanation.trim() ? (
                <div className="border-b border-green-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-green-400/90">
                    Explanation
                  </p>
                  <div className="mt-2 text-[13px] leading-relaxed text-slate-200 [&_p]:my-2">
                    <AssistantFormattedText text={explanation} />
                  </div>
                </div>
              ) : null}
              <div className="border-b border-green-900/25 px-3 py-3">
                <AnatomyVisual category={catSlug} explanation={explanation} />
              </div>
              {keyFacts.length ? (
                <div className="border-b border-green-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-green-400/90">
                    Key facts
                  </p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-slate-200 marker:text-green-400/90">
                    {keyFacts.map((fact, fi) => (
                      <li key={fi}>{typeof fact === "string" ? fact : String(fact)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {whenDoctor.trim() ? (
                <div className="border-b border-amber-700/35 bg-amber-950/35 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/95">
                    When to see a doctor
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-amber-50/95">{whenDoctor}</p>
                </div>
              ) : null}
              {sources.length ? (
                <div className="border-b border-green-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-green-400/90">
                    Reliable sources
                  </p>
                  <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-slate-200">
                    {sources.map((src, si) => {
                      const line = typeof src === "string" ? src.trim() : String(src ?? "");
                      const isUrl = /^https?:\/\//i.test(line);
                      return (
                        <li key={si}>
                          {isUrl ? (
                            <a
                              href={line}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-green-300 underline decoration-green-500/50 underline-offset-2 hover:text-green-200"
                            >
                              {line}
                            </a>
                          ) : (
                            line
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <div className="border-t border-slate-800/80 bg-slate-950/55 px-3 py-3">
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {disclaimer.trim()
                    ? disclaimer
                    : "This is educational information only. Always consult a qualified healthcare professional."}
                </p>
              </div>
            </div>
          );
        }
        if (kind === "code_solution") {
          const language = typeof b.language === "string" ? b.language : "plaintext";
          const taskType = typeof b.task_type === "string" ? b.task_type : "write";
          const code = typeof b.code === "string" ? b.code : "";
          const explanation = typeof b.explanation === "string" ? b.explanation : "";
          const complexity = typeof b.complexity === "string" ? b.complexity : "";
          const bestPractices = Array.isArray(b.best_practices) ? b.best_practices : [];
          const warnings = Array.isArray(b.warnings) ? b.warnings : [];
          const confidence = typeof b.confidence === "string" ? b.confidence : "";

          if (canvasChipActive && canvasView === "code") {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onCanvasChipFocus?.()}
                className={`${PREVIEW_CANVAS_CHIP} mt-4 w-full max-w-md justify-between border-blue-500/35 hover:border-blue-400/55`}
              >
                <span className="text-left">💻 Code — View in Canvas →</span>
              </button>
            );
          }

          return (
            <div
              key={i}
              className="canvas-block-enter mt-4 overflow-hidden rounded-xl border border-blue-900/45 bg-gradient-to-br from-blue-950/35 via-slate-950/80 to-slate-950/90 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-blue-800/25 first:mt-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-blue-900/35 px-3 py-2">
                <span className="rounded-md border border-blue-500/40 bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-100/95">
                  💻 Code Assistant
                </span>
                {confidence ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Confidence: {confidence}
                  </span>
                ) : null}
              </div>
              <div className="border-b border-blue-900/25 px-3 py-3">
                <CodeBlock code={code} language={language} taskType={taskType} complexity={complexity} />
              </div>
              {explanation.trim() ? (
                <details className="group border-b border-blue-900/25 px-3 py-2">
                  <summary className="cursor-pointer list-none py-2 text-[11px] font-semibold uppercase tracking-wider text-blue-400/95 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="mr-2 inline-block text-slate-500 transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    Explanation
                  </summary>
                  <div className="pb-3 pt-1 text-[13px] leading-relaxed text-slate-200 [&_p]:my-2">
                    <AssistantFormattedText text={explanation} />
                  </div>
                </details>
              ) : null}
              {bestPractices.length ? (
                <div className="border-b border-blue-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">
                    Best practices
                  </p>
                  <ul className="mt-2 space-y-1.5 text-[13px] text-emerald-100/95">
                    {bestPractices.map((tip, ti) => (
                      <li key={ti} className="flex gap-2 leading-relaxed">
                        <span className="shrink-0 text-emerald-400" aria-hidden>
                          ✓
                        </span>
                        <span>{typeof tip === "string" ? tip : String(tip)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {warnings.length ? (
                <div className="border-b border-amber-700/35 bg-amber-950/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/95">
                    Warnings
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-amber-50/95 marker:text-amber-500">
                    {warnings.map((w, wi) => (
                      <li key={wi}>{typeof w === "string" ? w : String(w)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        }
        if (kind === "translation_solution") {
          const sourceLanguage = typeof b.source_language === "string" ? b.source_language : "";
          const targetLanguage = typeof b.target_language === "string" ? b.target_language : "";
          const originalText = typeof b.original_text === "string" ? b.original_text : "";
          const translatedText = typeof b.translated_text === "string" ? b.translated_text : "";
          const transliteration = typeof b.transliteration === "string" ? b.transliteration : "";
          const tone = typeof b.tone === "string" ? b.tone : "neutral";
          const confidence = typeof b.confidence === "string" ? b.confidence : "";
          const alternatives = Array.isArray(b.alternative_translations) ? b.alternative_translations : [];

          return (
            <div
              key={i}
              className="canvas-block-enter mt-4 overflow-hidden rounded-xl border border-indigo-900/50 bg-gradient-to-br from-indigo-950/40 via-slate-950/70 to-slate-950/90 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-indigo-800/25 first:mt-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-900/35 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-indigo-500/45 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-100/95">
                    🌐 Translation
                  </span>
                  <span
                    className={[
                      "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      translationToneBadgeClasses(tone),
                    ].join(" ")}
                  >
                    {translationToneLabel(tone)}
                  </span>
                  {confidence ? (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Confidence: {confidence}
                    </span>
                  ) : null}
                </div>
                <TranslationCopyButton text={translatedText} />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-b border-indigo-900/25 px-3 py-2.5">
                <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-slate-200">
                  {sourceLanguage.trim() || "Source"}
                </span>
                <span className="text-sm text-indigo-300/90" aria-hidden>
                  →
                </span>
                <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-slate-200">
                  {targetLanguage.trim() || "Target"}
                </span>
              </div>
              <div className="grid gap-3 border-b border-indigo-900/25 px-3 py-3 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Original</p>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200">{originalText}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/90">Translated</p>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-100">{translatedText}</p>
                  {transliteration.trim() ? (
                    <p className="mt-2 text-[12px] italic leading-relaxed text-indigo-200/85">{transliteration}</p>
                  ) : null}
                </div>
              </div>
              {alternatives.length ? (
                <details className="group px-3 py-2">
                  <summary className="cursor-pointer list-none py-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-400/95 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="mr-2 inline-block text-slate-500 transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    Alternative translations ({alternatives.length})
                  </summary>
                  <ul className="space-y-2 pb-3 pl-6 text-[13px] leading-relaxed text-slate-200 marker:text-indigo-400">
                    {alternatives.map((alt, ai) => (
                      <li key={ai} className="list-disc">
                        {typeof alt === "string" ? alt : String(alt)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          );
        }
        if (kind === "study_solution") {
          return <StudySolutionBlock key={i} block={b} animationIndex={i} />;
        }
        if (kind === "document_solution") {
          return (
            <DocumentSolutionBlock
              key={i}
              block={b}
              animationIndex={i}
              messageId={messageId}
              onExportCanvas={onDocumentWriterExportCanvas}
            />
          );
        }
        if (kind === "data_solution") {
          return (
            <DataSolutionBlock
              key={i}
              block={b}
              blockIndex={i}
              animationIndex={i}
              messageId={messageId}
              connected={connected}
              onExportCanvas={onDataAnalystExportCanvas}
              onDataAnalystFollowUp={onDataAnalystFollowUp}
            />
          );
        }
        if (kind === "canvas_card") {
          return (
            <CanvasSavedCard
              key={`canvas-card-${b.kind}-${i}`}
              block={b}
              onOpen={onCanvasCardOpen}
              animationIndex={i}
            />
          );
        }
        if (kind === "research_solution") {
          if (canvasChipActive && canvasView === "research") {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onCanvasChipFocus?.()}
                className={`${PREVIEW_CANVAS_CHIP} mt-4 w-full max-w-md justify-between border-amber-500/35 hover:border-amber-400/55`}
              >
                <span className="text-left">📋 Research Report — View in Canvas →</span>
              </button>
            );
          }
          return <ResearchReportDocument key={i} block={b} animationIndex={i} />;
        }
        if (kind === "space_solution") {
          const topicSlug = typeof b.topic === "string" ? b.topic : "solar_system";
          const explanation = typeof b.explanation === "string" ? b.explanation : "";
          const keyFacts = Array.isArray(b.key_facts) ? b.key_facts : [];
          const scaleText = typeof b.scale === "string" ? b.scale : "";
          const missions = Array.isArray(b.missions) ? b.missions : [];
          const confidence = typeof b.confidence === "string" ? b.confidence : "";
          const isTheoretical = Boolean(b.is_theoretical);
          const visualization = b.visualization && typeof b.visualization === "object" ? b.visualization : null;

          return (
            <div
              key={i}
              className="canvas-block-enter mt-4 overflow-hidden rounded-xl border border-indigo-900/50 bg-gradient-to-br from-indigo-950/40 via-violet-950/25 to-slate-950/80 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-indigo-800/30 first:mt-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-indigo-900/35 px-3 py-2">
                <span className="rounded-md border border-indigo-500/45 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-100/95">
                  🚀 {spaceTopicBadgeLabel(topicSlug)}
                </span>
                {confidence ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Confidence: {confidence}
                  </span>
                ) : null}
                {isTheoretical ? (
                  <span className="rounded-md border border-amber-600/45 bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/95">
                    Theoretical / debated
                  </span>
                ) : null}
              </div>
              {explanation.trim() ? (
                <div className="border-b border-indigo-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/90">
                    Explanation
                  </p>
                  <div className="mt-2 text-[13px] leading-relaxed text-slate-200 [&_p]:my-2">
                    <AssistantFormattedText text={explanation} />
                  </div>
                </div>
              ) : null}
              {keyFacts.length ? (
                <div className="border-b border-indigo-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/90">
                    Key facts
                  </p>
                  <ul className="mt-2 space-y-1.5 text-[13px] text-slate-200">
                    {keyFacts.map((fact, fi) => (
                      <li key={fi} className="flex gap-2 leading-relaxed">
                        <span className="shrink-0 text-indigo-400/90" aria-hidden>
                          ✦
                        </span>
                        <span>{typeof fact === "string" ? fact : String(fact)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {scaleText.trim() ? (
                <div className="border-b border-indigo-900/35 bg-indigo-500/[0.08] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">
                    Cosmic scale
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-100">{scaleText}</p>
                </div>
              ) : null}
              {missions.length ? (
                <div className="border-b border-indigo-900/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/90">
                    Related missions
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {missions.map((m, mi) => (
                      <span
                        key={mi}
                        className="rounded-full border border-indigo-500/35 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-100/95"
                      >
                        {typeof m === "string" ? m : String(m)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {visualization ? (
                <div className="px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/90">
                    3D visualization
                  </p>
                  <div className="mt-3 max-w-full">
                    <SpaceHologram visualization={visualization} />
                  </div>
                </div>
              ) : null}
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
  enabledTools = {
    search: true,
    analysis: false,
    vision: false,
    memory: false,
    file_analyst: false,
    math_solver: false,
    science_agent: false,
    chemistry_agent: false,
    space_agent: false,
    health_agent: false,
    code_assistant: false,
    translation_agent: false,
    research_agent: false,
    study_assistant: false,
    data_analyst: false,
    document_writer: false,
  },
  onToggleTool,
  onMathSolve,
  onScienceSolve,
  onChemistrySolve,
  onSpaceSolve,
  onHealthSolve,
  onCodeSolve,
  onTranslationSolve,
  onResearchSolve,
  onStudySolve,
  onDocumentWriterSolve,
  onDataAnalystSolve,
  onDataAnalystExportCanvas,
  onDocumentWriterExportCanvas,
  onCanvasCardOpen,
  onDataAnalystFollowUp,
  imageGenWizard = null,
  onImageStyleSelect,
  onImageRatioSelect,
  fileAnalystContext = null,
  onAnalystFile,
  onDataWizardAction,
  onCanvasOpen,
  canvasBusy = false,
  canvasOpen = false,
  canvasView = "landing",
  canvasLinkedMessageId = null,
  onCanvasChipFocus,
}) {
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [input, setInput] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const toolsRef = useRef(null);
  const [researchThinkingStep, setResearchThinkingStep] = useState(0);

  useEffect(() => {
    if (
      !processing ||
      (!enabledTools.research_agent &&
        !enabledTools.study_assistant &&
        !enabledTools.data_analyst &&
        !enabledTools.document_writer)
    ) {
      setResearchThinkingStep(0);
      return undefined;
    }
    const id = window.setInterval(() => {
      setResearchThinkingStep((s) => (s + 1) % 3);
    }, 2000);
    return () => window.clearInterval(id);
  }, [
    processing,
    enabledTools.research_agent,
    enabledTools.study_assistant,
    enabledTools.data_analyst,
    enabledTools.document_writer,
  ]);

  const researchProgressFilled = Math.min(16, Math.round(((researchThinkingStep + 1) / 3) * 16));

  const handleScienceReadingTopic = useCallback((topic) => {
    const t = (topic || "").trim();
    if (!t) return;
    setInput((prev) => (prev?.trim() ? `${prev.trim()}\n${t}` : t));
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

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
    if (enabledTools.math_solver) {
      return "Enter your math problem — equation, expression, or word problem…";
    }
    if (enabledTools.science_agent) {
      return "Ask a science question — physics, biology, earth science, or general…";
    }
    if (enabledTools.chemistry_agent) {
      return "Ask a chemistry question — equation, molecule, or reaction…";
    }
    if (enabledTools.space_agent) {
      return "Ask a space question — planets, stars, missions, or cosmology…";
    }
    if (enabledTools.health_agent) {
      return "Ask a health question — education only, not a substitute for a clinician…";
    }
    if (enabledTools.code_assistant) {
      return "Paste code, errors, or ask for refactors and reviews — Code Assistant…";
    }
    if (enabledTools.translation_agent) {
      return "Paste text to translate — optional first line \"Target language: …\" …";
    }
    if (enabledTools.document_writer) {
      return "Describe the document you need — audience, purpose, tone, sections…";
    }
    if (enabledTools.data_analyst) {
      return "Paste CSV, TSV, or JSON (array of objects) for a Data Analyst report…";
    }
    if (enabledTools.study_assistant) {
      return "What topic do you want to study — goals, level, or sub-area…";
    }
    if (enabledTools.research_agent) {
      return "Describe your research topic — scope, comparison, or angle…";
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
    } else if (pillId === "science") {
      if (!enabledTools.science_agent) onToggleTool?.("science_agent");
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else if (pillId === "chemistry") {
      if (!enabledTools.chemistry_agent) onToggleTool?.("chemistry_agent");
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else if (pillId === "space") {
      if (!enabledTools.space_agent) onToggleTool?.("space_agent");
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else if (pillId === "health") {
      if (!enabledTools.health_agent) onToggleTool?.("health_agent");
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else if (pillId === "study") {
      if (!enabledTools.study_assistant) onToggleTool?.("study_assistant");
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else if (pillId === "math") {
      if (!enabledTools.math_solver) onToggleTool?.("math_solver");
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else if (pillId === "data") {
      if (!enabledTools.data_analyst) onToggleTool?.("data_analyst");
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else if (pillId === "document") {
      if (!enabledTools.document_writer) onToggleTool?.("document_writer");
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || processing || !connected) return;
    if (enabledTools.math_solver && typeof onMathSolve === "function") {
      onMathSolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.science_agent && typeof onScienceSolve === "function") {
      onScienceSolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.chemistry_agent && typeof onChemistrySolve === "function") {
      onChemistrySolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.space_agent && typeof onSpaceSolve === "function") {
      onSpaceSolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.health_agent && typeof onHealthSolve === "function") {
      onHealthSolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.code_assistant && typeof onCodeSolve === "function") {
      onCodeSolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.translation_agent && typeof onTranslationSolve === "function") {
      onTranslationSolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.document_writer && typeof onDocumentWriterSolve === "function") {
      onDocumentWriterSolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.data_analyst && typeof onDataAnalystSolve === "function") {
      onDataAnalystSolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.study_assistant && typeof onStudySolve === "function") {
      onStudySolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
    if (enabledTools.research_agent && typeof onResearchSolve === "function") {
      onResearchSolve(text);
      setInput("");
      setToolsOpen(false);
      return;
    }
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
          <div className="mt-2 flex flex-wrap gap-2">
            {enabledTools.file_analyst ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] font-medium text-emerald-400/90">
                <span aria-hidden>📊</span>
                File Analyst
                {fileAnalystContext?.fileId ? <span className="text-emerald-500/70">· file attached</span> : null}
              </p>
            ) : null}
            {enabledTools.math_solver ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/5 px-2 py-1 text-[10px] font-medium text-amber-400/95">
                <span aria-hidden>∑</span>
                Math Solver
              </p>
            ) : null}
            {enabledTools.science_agent ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400/95">
                <span aria-hidden>🔬</span>
                Science Agent
              </p>
            ) : null}
            {enabledTools.chemistry_agent ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-orange-500/35 bg-orange-500/10 px-2 py-1 text-[10px] font-medium text-orange-400/95">
                <span aria-hidden>⚗️</span>
                Chemistry Agent
              </p>
            ) : null}
            {enabledTools.space_agent ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-[10px] font-medium text-indigo-300/95">
                <span aria-hidden>🚀</span>
                Space Agent
              </p>
            ) : null}
            {enabledTools.health_agent ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-green-500/40 bg-green-500/10 px-2 py-1 text-[10px] font-medium text-green-300/95">
                <span aria-hidden>🏥</span>
                Health Agent
              </p>
            ) : null}
            {enabledTools.code_assistant ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-300/95">
                <span aria-hidden>💻</span>
                Code Assistant
              </p>
            ) : null}
            {enabledTools.translation_agent ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-indigo-500/45 bg-indigo-500/10 px-2 py-1 text-[10px] font-medium text-indigo-200/95">
                <span aria-hidden>🌐</span>
                Translation
              </p>
            ) : null}
            {enabledTools.research_agent ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-amber-500/45 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-200/95">
                <span aria-hidden>🔬</span>
                Research Agent
              </p>
            ) : null}
            {enabledTools.study_assistant ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-sky-500/45 bg-indigo-500/10 px-2 py-1 text-[10px] font-medium text-sky-200/95">
                <span aria-hidden>📚</span>
                Study Assistant
              </p>
            ) : null}
            {enabledTools.data_analyst ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-cyan-500/45 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-100/95">
                <span aria-hidden>📊</span>
                Data Analyst
              </p>
            ) : null}
            {enabledTools.document_writer ? (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-500/45 bg-blue-950/35 px-2 py-1 text-[10px] font-medium text-slate-100/95">
                <span aria-hidden>📝</span>
                Document Writer
              </p>
            ) : null}
          </div>
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
                  {isUser ? m.text : (m.text || "").trim() ? <AssistantRichText text={m.text} /> : null}
                  {!isUser ? (
                    <MessageBlocks
                      blocks={m.blocks}
                      messageId={m.id}
                      canvasOpen={canvasOpen}
                      canvasView={canvasView}
                      canvasLinkedMessageId={canvasLinkedMessageId}
                      onCanvasChipFocus={onCanvasChipFocus}
                      onRetryLastPrompt={onRetryLastPrompt}
                      onScienceReadingTopic={handleScienceReadingTopic}
                      connected={connected}
                      onDataAnalystExportCanvas={onDataAnalystExportCanvas}
                      onDocumentWriterExportCanvas={onDocumentWriterExportCanvas}
                      onCanvasCardOpen={onCanvasCardOpen}
                      onDataAnalystFollowUp={onDataAnalystFollowUp}
                    />
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
                {enabledTools.document_writer ? (
                  <div className="overflow-hidden rounded-xl rounded-tl-sm border border-slate-600/50 bg-gradient-to-br from-slate-950/80 via-blue-950/40 to-slate-950/90 px-4 py-5 shadow-xl ring-1 ring-blue-900/30">
                    <p className="text-[14px] font-medium tracking-tight text-white">📝 Drafting your document…</p>
                    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] leading-none text-white sm:text-[11px]">
                      <span className="min-w-0 break-all">
                        <span className="text-blue-400">{"█".repeat(researchProgressFilled)}</span>
                        <span className="text-[#3d4354]">{"░".repeat(16 - researchProgressFilled)}</span>
                      </span>
                      <span className="shrink-0 text-slate-200/95">Step {researchThinkingStep + 1}/3</span>
                    </div>
                    <p className="mt-4 text-[13px] leading-snug text-slate-100/95">
                      {
                        ["Understanding purpose and audience", "Structuring sections and tone", "Polishing the full draft"][
                          researchThinkingStep
                        ]
                      }
                    </p>
                    <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-black/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-slate-600 via-blue-600 to-sky-500 transition-[width] duration-500 ease-out"
                        style={{ width: `${((researchThinkingStep + 1) / 3) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : enabledTools.data_analyst ? (
                  <div className="overflow-hidden rounded-xl rounded-tl-sm border border-cyan-800/45 bg-gradient-to-br from-cyan-950/45 to-teal-950/35 px-4 py-5 shadow-xl ring-1 ring-teal-800/25">
                    <p className="text-[14px] font-medium tracking-tight text-white">📊 Analyzing your dataset…</p>
                    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] leading-none text-white sm:text-[11px]">
                      <span className="min-w-0 break-all">
                        <span className="text-cyan-400">{"█".repeat(researchProgressFilled)}</span>
                        <span className="text-[#3d4354]">{"░".repeat(16 - researchProgressFilled)}</span>
                      </span>
                      <span className="shrink-0 text-teal-200/95">Step {researchThinkingStep + 1}/3</span>
                    </div>
                    <p className="mt-4 text-[13px] leading-snug text-cyan-100/95">
                      {
                        ["Parsing columns and types", "Computing statistics and anomaly checks", "Writing insights and narrative"][
                          researchThinkingStep
                        ]
                      }
                    </p>
                    <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-black/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-600 via-teal-500 to-emerald-400 transition-[width] duration-500 ease-out"
                        style={{ width: `${((researchThinkingStep + 1) / 3) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : enabledTools.study_assistant ? (
                  <div className="overflow-hidden rounded-xl rounded-tl-sm border border-sky-800/40 bg-gradient-to-br from-sky-950/50 to-indigo-950/40 px-4 py-5 shadow-xl ring-1 ring-indigo-800/25">
                    <p className="text-[14px] font-medium tracking-tight text-white">
                      📚 Building your study guide…
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] leading-none text-white sm:text-[11px]">
                      <span className="min-w-0 break-all">
                        <span className="text-sky-400">{"█".repeat(researchProgressFilled)}</span>
                        <span className="text-[#3d4354]">{"░".repeat(16 - researchProgressFilled)}</span>
                      </span>
                      <span className="shrink-0 text-indigo-200/95">
                        Step {researchThinkingStep + 1}/3
                      </span>
                    </div>
                    <p className="mt-4 text-[13px] leading-snug text-sky-100/95">
                      {
                        ["Mapping your topic and level", "Structuring concepts and a study plan", "Adding memory tips and practice checks"][
                          researchThinkingStep
                        ]
                      }
                    </p>
                    <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-black/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-600 via-indigo-500 to-indigo-400 transition-[width] duration-500 ease-out"
                        style={{ width: `${((researchThinkingStep + 1) / 3) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : enabledTools.research_agent ? (
                  <div className="overflow-hidden rounded-xl rounded-tl-sm border border-white/[0.06] bg-[#0f1117] px-4 py-5 shadow-xl">
                    <p className="text-[14px] font-medium tracking-tight text-white">
                      🧠 Tunde is researching...
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] leading-none text-white sm:text-[11px]">
                      <span className="min-w-0 break-all">
                        <span className="text-amber-400">{"█".repeat(researchProgressFilled)}</span>
                        <span className="text-[#3d4354]">{"░".repeat(16 - researchProgressFilled)}</span>
                      </span>
                      <span className="shrink-0 text-amber-300/95">
                        Step {researchThinkingStep + 1}/3
                      </span>
                    </div>
                    <p className="mt-4 text-[13px] leading-snug text-amber-100/95">
                      {
                        ["Searching for sources", "Analyzing sources and findings", "Writing your research report"][
                          researchThinkingStep
                        ]
                      }
                    </p>
                    <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-black/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 transition-[width] duration-500 ease-out"
                        style={{ width: `${((researchThinkingStep + 1) / 3) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
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
                )}
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
          {enabledTools.math_solver ? (
            <p className="mb-2 text-[11px] leading-snug text-amber-500/85">
              Math Solver is on — type a problem below for step-by-step working and a highlighted answer.
            </p>
          ) : null}
          {enabledTools.science_agent &&
          !enabledTools.math_solver &&
          !enabledTools.chemistry_agent &&
          !enabledTools.space_agent &&
          !enabledTools.health_agent &&
          !enabledTools.code_assistant &&
          !enabledTools.translation_agent &&
          !enabledTools.research_agent &&
          !enabledTools.study_assistant &&
          !enabledTools.data_analyst &&
          !enabledTools.document_writer ? (
            <p className="mb-2 text-[11px] leading-snug text-emerald-500/85">
              Science Agent is on — structured explanations, examples, and topic suggestions below.
            </p>
          ) : null}
          {enabledTools.chemistry_agent &&
          !enabledTools.math_solver &&
          !enabledTools.science_agent &&
          !enabledTools.space_agent &&
          !enabledTools.health_agent &&
          !enabledTools.code_assistant &&
          !enabledTools.translation_agent &&
          !enabledTools.research_agent &&
          !enabledTools.study_assistant &&
          !enabledTools.data_analyst &&
          !enabledTools.document_writer ? (
            <p className="mb-2 text-[11px] leading-snug text-orange-500/85">
              Chemistry Agent is on — equations, explanations, and 3D molecule views when returned.
            </p>
          ) : null}
          {enabledTools.space_agent &&
          !enabledTools.math_solver &&
          !enabledTools.science_agent &&
          !enabledTools.chemistry_agent &&
          !enabledTools.health_agent &&
          !enabledTools.code_assistant &&
          !enabledTools.translation_agent &&
          !enabledTools.research_agent &&
          !enabledTools.study_assistant &&
          !enabledTools.data_analyst &&
          !enabledTools.document_writer ? (
            <p className="mb-2 text-[11px] leading-snug text-indigo-400/90">
              Space Agent is on — structured answers plus an interactive 3D cosmic view when returned.
            </p>
          ) : null}
          {enabledTools.health_agent &&
          !enabledTools.math_solver &&
          !enabledTools.science_agent &&
          !enabledTools.chemistry_agent &&
          !enabledTools.space_agent &&
          !enabledTools.code_assistant &&
          !enabledTools.translation_agent &&
          !enabledTools.research_agent &&
          !enabledTools.study_assistant &&
          !enabledTools.data_analyst &&
          !enabledTools.document_writer ? (
            <p className="mb-2 text-[11px] leading-snug text-green-400/90">
              Health Agent is on — educational information only; not a substitute for professional medical
              care.
            </p>
          ) : null}
          {enabledTools.code_assistant &&
          !enabledTools.math_solver &&
          !enabledTools.science_agent &&
          !enabledTools.chemistry_agent &&
          !enabledTools.space_agent &&
          !enabledTools.health_agent &&
          !enabledTools.translation_agent &&
          !enabledTools.research_agent &&
          !enabledTools.study_assistant &&
          !enabledTools.data_analyst &&
          !enabledTools.document_writer ? (
            <p className="mb-2 text-[11px] leading-snug text-blue-400/90">
              Code Assistant is on — paste snippets or errors for highlighted code, explanations, and checks.
            </p>
          ) : null}
          {enabledTools.translation_agent &&
          !enabledTools.math_solver &&
          !enabledTools.science_agent &&
          !enabledTools.chemistry_agent &&
          !enabledTools.space_agent &&
          !enabledTools.health_agent &&
          !enabledTools.code_assistant &&
          !enabledTools.research_agent &&
          !enabledTools.study_assistant &&
          !enabledTools.data_analyst &&
          !enabledTools.document_writer ? (
            <p className="mb-2 text-[11px] leading-snug text-indigo-300/95">
              Translation is on — paste text to translate; add a target language on the first line if needed.
            </p>
          ) : null}
          {enabledTools.document_writer &&
          !enabledTools.math_solver &&
          !enabledTools.science_agent &&
          !enabledTools.chemistry_agent &&
          !enabledTools.space_agent &&
          !enabledTools.health_agent &&
          !enabledTools.code_assistant &&
          !enabledTools.translation_agent ? (
            <p className="mb-2 text-[11px] leading-snug text-slate-300/95">
              Document Writer is on — describe audience, purpose, tone, and must-have sections for a ready-to-edit
              draft.
            </p>
          ) : null}
          {enabledTools.research_agent &&
          !enabledTools.math_solver &&
          !enabledTools.science_agent &&
          !enabledTools.chemistry_agent &&
          !enabledTools.space_agent &&
          !enabledTools.health_agent &&
          !enabledTools.code_assistant &&
          !enabledTools.translation_agent &&
          !enabledTools.study_assistant &&
          !enabledTools.data_analyst &&
          !enabledTools.document_writer ? (
            <p className="mb-2 text-[11px] leading-snug text-amber-400/95">
              Research Agent is on — citations are assistive; verify against primary sources.
            </p>
          ) : null}
          {enabledTools.study_assistant &&
          !enabledTools.math_solver &&
          !enabledTools.science_agent &&
          !enabledTools.chemistry_agent &&
          !enabledTools.space_agent &&
          !enabledTools.health_agent &&
          !enabledTools.code_assistant &&
          !enabledTools.translation_agent &&
          !enabledTools.research_agent &&
          !enabledTools.data_analyst &&
          !enabledTools.document_writer ? (
            <p className="mb-2 text-[11px] leading-snug text-sky-300/95">
              Study Assistant is on — summaries, plans, and practice are for learning; verify important facts with
              your course materials.
            </p>
          ) : null}
          {enabledTools.data_analyst &&
          !enabledTools.math_solver &&
          !enabledTools.science_agent &&
          !enabledTools.chemistry_agent &&
          !enabledTools.space_agent &&
          !enabledTools.health_agent &&
          !enabledTools.code_assistant &&
          !enabledTools.translation_agent &&
          !enabledTools.research_agent &&
          !enabledTools.study_assistant &&
          !enabledTools.document_writer ? (
            <p className="mb-2 text-[11px] leading-snug text-cyan-400/95">
              Data Analyst is on — paste tabular data for stats, insights, smart alerts, and optional Canvas export.
            </p>
          ) : null}
          <div
            className={[
              "relative flex w-full items-end gap-2 rounded-xl border bg-white/[0.03] px-2 py-1.5",
              enabledTools.math_solver
                ? "border-amber-500/35 shadow-[inset_0_1px_0_rgba(251,191,36,0.06)] focus-within:border-amber-500/50 focus-within:shadow-[0_0_0_3px_rgba(245,158,11,0.12)]"
                : enabledTools.science_agent
                  ? "border-emerald-500/35 shadow-[inset_0_1px_0_rgba(52,211,153,0.06)] focus-within:border-emerald-500/45 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.14)]"
                  : enabledTools.chemistry_agent
                    ? "border-orange-500/35 shadow-[inset_0_1px_0_rgba(251,146,60,0.06)] focus-within:border-orange-500/45 focus-within:shadow-[0_0_0_3px_rgba(249,115,22,0.14)]"
                    : enabledTools.space_agent
                      ? "border-indigo-500/40 shadow-[inset_0_1px_0_rgba(99,102,241,0.07)] focus-within:border-indigo-500/50 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.16)]"
                      : enabledTools.health_agent
                        ? "border-green-500/40 shadow-[inset_0_1px_0_rgba(74,222,128,0.07)] focus-within:border-green-500/50 focus-within:shadow-[0_0_0_3px_rgba(34,197,94,0.18)]"
                        : enabledTools.code_assistant
                          ? "border-blue-500/40 shadow-[inset_0_1px_0_rgba(96,165,250,0.08)] focus-within:border-blue-500/55 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.2)]"
                          : enabledTools.translation_agent
                            ? "border-indigo-500/45 shadow-[inset_0_1px_0_rgba(129,140,248,0.09)] focus-within:border-indigo-500/55 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.2)]"
                            : enabledTools.document_writer
                              ? "border-slate-500/50 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)] focus-within:border-blue-500/50 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.18)]"
                            : enabledTools.data_analyst
                              ? "border-cyan-500/45 shadow-[inset_0_1px_0_rgba(34,211,238,0.08)] focus-within:border-teal-400/50 focus-within:shadow-[0_0_0_3px_rgba(20,184,166,0.2)]"
                              : enabledTools.study_assistant
                                ? "border-sky-500/45 shadow-[inset_0_1px_0_rgba(56,189,248,0.08)] focus-within:border-indigo-500/50 focus-within:shadow-[0_0_0_3px_rgba(14,165,233,0.16)]"
                                : enabledTools.research_agent
                                  ? "border-amber-400/45 shadow-[inset_0_1px_0_rgba(250,204,21,0.07)] focus-within:border-amber-400/55 focus-within:shadow-[0_0_0_3px_rgba(250,204,21,0.15)]"
                                  : "border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-violet-500/40 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.15)]",
              "transition-[box-shadow,border-color] duration-200 ease-out",
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
