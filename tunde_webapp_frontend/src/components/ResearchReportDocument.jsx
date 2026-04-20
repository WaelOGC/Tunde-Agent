import { useMemo, useState } from "react";
import { AssistantFormattedText } from "../utils/AssistantFormattedText";
import {
  buildResearchReportPlainText,
  researchCredibilityDocBadgeClasses,
  researchCredibilityLabel,
  researchReportFilenameSlug,
  researchSourceTypeLabel,
} from "../utils/researchReportUtils";

/** Inline toolbar — used in chat header and mirrored actions in Canvas. */
export function ResearchReportToolbar({
  topic,
  summary,
  keyFindings,
  sources,
  citations,
  conflictingViews,
  disclaimer,
  confidence,
}) {
  const [copied, setCopied] = useState(false);
  const plainText = useMemo(
    () =>
      buildResearchReportPlainText({
        topic,
        summary,
        key_findings: keyFindings,
        sources,
        citations,
        conflicting_views: conflictingViews,
        disclaimer,
        confidence,
      }),
    [topic, summary, keyFindings, sources, citations, conflictingViews, disclaimer, confidence]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleDownloadTxt = () => {
    const t = (topic || "report").trim();
    const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${researchReportFilenameSlug(t)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 print:hidden">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-md border border-[#333333] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#1a1a1a] shadow-sm transition-colors hover:bg-white"
      >
        {copied ? "Copied" : "Copy Report"}
      </button>
      <button
        type="button"
        onClick={handleDownloadTxt}
        className="rounded-md border border-[#111111] bg-[#111111] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-black"
      >
        Download as TXT
      </button>
    </div>
  );
}

/** Shareable plaintext for research report (clipboard / share). */
export function getResearchPlainText(block) {
  const b = block || {};
  return buildResearchReportPlainText({
    topic: typeof b.topic === "string" ? b.topic : "",
    summary: typeof b.summary === "string" ? b.summary : "",
    key_findings: Array.isArray(b.key_findings) ? b.key_findings : [],
    sources: Array.isArray(b.sources) ? b.sources : [],
    citations: Array.isArray(b.citations) ? b.citations : [],
    conflicting_views: Array.isArray(b.conflicting_views) ? b.conflicting_views : [],
    disclaimer: typeof b.disclaimer === "string" ? b.disclaimer : "",
    confidence: typeof b.confidence === "string" ? b.confidence : "",
  });
}

export function ResearchReportInner({ block, contentId }) {
  const topic = typeof block.topic === "string" ? block.topic : "";
  const summary = typeof block.summary === "string" ? block.summary : "";
  const keyFindings = Array.isArray(block.key_findings) ? block.key_findings : [];
  const sources = Array.isArray(block.sources) ? block.sources : [];
  const citations = Array.isArray(block.citations) ? block.citations : [];
  const conflictingViews = Array.isArray(block.conflicting_views) ? block.conflicting_views : [];
  const confidence = typeof block.confidence === "string" ? block.confidence : "";
  const disclaimer = typeof block.disclaimer === "string" ? block.disclaimer : "";

  const trimmedSummary = summary.trim();
  let execSummaryPart = trimmedSummary;
  let detailedSectionsPart = "";
  if (trimmedSummary.startsWith("##")) {
    execSummaryPart = "";
    detailedSectionsPart = trimmedSummary;
  } else {
    const sectionSplit = trimmedSummary.search(/\n##\s/m);
    execSummaryPart =
      sectionSplit > 0 ? trimmedSummary.slice(0, sectionSplit).trim() : trimmedSummary;
    detailedSectionsPart = sectionSplit > 0 ? trimmedSummary.slice(sectionSplit).trim() : "";
  }

  return (
    <div id={contentId} className="bg-white px-5 py-8 sm:px-10 sm:py-10 print:px-8 print:py-10">
      {topic.trim() ? (
        <h1 className="font-serif text-2xl font-bold leading-tight tracking-tight text-[#111111] md:text-[1.75rem]">
          {topic}
        </h1>
      ) : null}

      {execSummaryPart ? (
        <section className="mt-8 border-t border-neutral-200 pt-6 print:break-inside-avoid">
          <h2 className="border-b border-neutral-200 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#111111] print:border-neutral-300">
            Executive summary
          </h2>
          <div className="research-report-prose mt-4 max-w-prose font-serif text-[15px] leading-[1.65] text-[#1a1a1a] [&_ul]:my-3 [&_ul]:pl-5">
            <AssistantFormattedText text={execSummaryPart} paper />
          </div>
        </section>
      ) : null}

      {detailedSectionsPart ? (
        <section className="mt-8 border-t border-neutral-200 pt-6 print:break-inside-avoid">
          <h2 className="border-b border-neutral-200 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#111111] print:border-neutral-300">
            Report sections
          </h2>
          <div className="research-report-prose mt-4 max-w-prose font-serif text-[15px] leading-[1.65] text-[#1a1a1a]">
            <AssistantFormattedText text={detailedSectionsPart} paper />
          </div>
        </section>
      ) : null}

      {keyFindings.length ? (
        <section className="mt-8 border-t border-neutral-200 pt-6 print:break-inside-avoid">
          <h2 className="border-b border-neutral-200 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#111111] print:border-neutral-300">
            Key findings
          </h2>
          <ol className="mt-4 list-decimal space-y-2.5 pl-6 font-serif text-[14px] font-normal leading-relaxed text-[#1a1a1a] marker:font-bold marker:text-[#111111]">
            {keyFindings.map((kf, ki) => (
              <li key={ki} className="pl-1">
                {typeof kf === "string" ? kf : String(kf)}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sources.length ? (
        <section className="mt-8 border-t border-neutral-200 pt-6 print:break-inside-avoid">
          <h2 className="border-b border-neutral-200 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#111111] print:border-neutral-300">
            Sources
          </h2>
          <ul className="mt-4 space-y-3">
            {sources.map((src, si) => {
              const stitle = typeof src?.title === "string" ? src.title : "";
              const stype = typeof src?.type === "string" ? src.type : "web";
              const cred = typeof src?.credibility === "string" ? src.credibility : "medium";
              return (
                <li
                  key={si}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-[13px] leading-snug text-[#1a1a1a] print:border-neutral-300"
                >
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="rounded border border-[#333333] bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#111111]">
                      [{researchSourceTypeLabel(stype)}]
                    </span>
                    <span
                      className={[
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        researchCredibilityDocBadgeClasses(cred),
                      ].join(" ")}
                    >
                      [{researchCredibilityLabel(cred)}]
                    </span>
                    <span className="font-semibold text-[#1a1a1a]">{stitle || "Untitled source"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {citations.length ? (
        <section className="mt-8 border-t border-neutral-200 pt-6 print:break-inside-avoid">
          <h2 className="border-b border-neutral-200 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#111111] print:border-neutral-300">
            Citations
          </h2>
          <ul className="mt-4 space-y-2 font-mono text-[11.5px] leading-relaxed text-[#333333]">
            {citations.map((cit, ci) => (
              <li key={ci} className="border-l-2 border-[#333333] pl-3">
                {typeof cit === "string" ? cit : String(cit)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {conflictingViews.length ? (
        <section className="mt-8 border border-orange-200 bg-orange-50 px-4 py-4 print:break-inside-avoid print:border-orange-300 print:bg-orange-50">
          <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c2d12]">
            <span aria-hidden>⚠️</span> Conflicting views
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 font-serif text-[14px] leading-relaxed text-[#7c2d12] marker:text-[#7c2d12]">
            {conflictingViews.map((cv, vi) => (
              <li key={vi}>{typeof cv === "string" ? cv : String(cv)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {disclaimer.trim() ? (
        <footer className="mt-10 border-t border-neutral-200 pt-6 print:break-inside-avoid print:border-neutral-300">
          <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#111111]">
            <span aria-hidden>ℹ️</span> Disclaimer
          </h2>
          <p className="mt-3 text-[12px] leading-relaxed text-[#1a1a1a]">{disclaimer}</p>
        </footer>
      ) : null}
    </div>
  );
}

/**
 * Full research report card (chat). Pass `compact` for tighter outer wrapper when embedded.
 */
export default function ResearchReportDocument({ block, animationIndex = 0, showHeaderToolbar = true }) {
  const topic = typeof block.topic === "string" ? block.topic : "";
  const summary = typeof block.summary === "string" ? block.summary : "";
  const keyFindings = Array.isArray(block.key_findings) ? block.key_findings : [];
  const sources = Array.isArray(block.sources) ? block.sources : [];
  const citations = Array.isArray(block.citations) ? block.citations : [];
  const conflictingViews = Array.isArray(block.conflicting_views) ? block.conflicting_views : [];
  const confidence = typeof block.confidence === "string" ? block.confidence : "";
  const disclaimer = typeof block.disclaimer === "string" ? block.disclaimer : "";

  return (
    <div
      className="canvas-block-enter mt-4 max-w-4xl print:max-w-none first:mt-0"
      style={{ animationDelay: `${animationIndex * 50}ms` }}
    >
      <div className="overflow-hidden rounded-lg border border-neutral-300 bg-white text-[#1a1a1a] shadow-[0_12px_48px_rgba(0,0,0,0.28)] ring-1 ring-black/5 print:border-neutral-400 print:shadow-none print:ring-0">
        {showHeaderToolbar ? (
          <header className="flex flex-col gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 print:border-neutral-300 print:bg-white">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#111111]">📋 Research report</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-[#1a1a1a]">
                Status: research · {confidence ? `confidence ${confidence}` : "draft"}
              </p>
            </div>
            <ResearchReportToolbar
              topic={topic}
              summary={summary}
              keyFindings={keyFindings}
              sources={sources}
              citations={citations}
              conflictingViews={conflictingViews}
              disclaimer={disclaimer}
              confidence={confidence}
            />
          </header>
        ) : null}
        <ResearchReportInner block={block} />
      </div>
    </div>
  );
}
