export function researchCredibilityLabel(credRaw) {
  const c = (credRaw || "").toLowerCase();
  if (c === "high") return "High";
  if (c === "low") return "Low";
  return "Medium";
}

/** Credibility badges on light paper (research report document) — dark text only */
export function researchCredibilityDocBadgeClasses(credRaw) {
  const c = (credRaw || "").toLowerCase();
  if (c === "high") return "border border-[#0d4d2a] bg-white text-[#0d4d2a]";
  if (c === "low") return "border border-[#7c2d12] bg-white text-[#7c2d12]";
  return "border border-[#333333] bg-white text-[#1a1a1a]";
}

export function researchSourceTypeLabel(typeRaw) {
  const x = (typeRaw || "").toLowerCase();
  if (x === "academic") return "Academic";
  if (x === "news") return "News";
  if (x === "official") return "Official";
  return "Web";
}

export function buildResearchReportPlainText(b) {
  const topic = typeof b.topic === "string" ? b.topic : "";
  const summary = typeof b.summary === "string" ? b.summary : "";
  const keyFindings = Array.isArray(b.key_findings) ? b.key_findings : [];
  const sources = Array.isArray(b.sources) ? b.sources : [];
  const citations = Array.isArray(b.citations) ? b.citations : [];
  const conflictingViews = Array.isArray(b.conflicting_views) ? b.conflicting_views : [];
  const disclaimer = typeof b.disclaimer === "string" ? b.disclaimer : "";
  const confidence = typeof b.confidence === "string" ? b.confidence : "";

  const lines = [];
  lines.push("RESEARCH REPORT");
  lines.push("=".repeat(44));
  lines.push("");
  lines.push(topic);
  lines.push("");
  lines.push("EXECUTIVE SUMMARY");
  lines.push("-".repeat(44));
  lines.push(summary);
  lines.push("");
  lines.push("KEY FINDINGS");
  lines.push("-".repeat(44));
  keyFindings.forEach((kf, i) => {
    lines.push(`${i + 1}. ${typeof kf === "string" ? kf : String(kf)}`);
  });
  lines.push("");
  lines.push("SOURCES");
  lines.push("-".repeat(44));
  sources.forEach((src) => {
    const t = typeof src?.title === "string" ? src.title : "";
    const stype = typeof src?.type === "string" ? src.type : "web";
    const cred = typeof src?.credibility === "string" ? src.credibility : "medium";
    lines.push(`[${researchSourceTypeLabel(stype)}] [${researchCredibilityLabel(cred)}] ${t}`);
  });
  lines.push("");
  lines.push("CITATIONS");
  lines.push("-".repeat(44));
  citations.forEach((c) => lines.push(typeof c === "string" ? c : String(c)));
  if (conflictingViews.length) {
    lines.push("");
    lines.push("CONFLICTING VIEWS");
    lines.push("-".repeat(44));
    conflictingViews.forEach((cv) => lines.push(`• ${typeof cv === "string" ? cv : String(cv)}`));
  }
  if (confidence) {
    lines.push("");
    lines.push(`Confidence: ${confidence}`);
  }
  lines.push("");
  lines.push("DISCLAIMER");
  lines.push("-".repeat(44));
  lines.push(disclaimer || "");
  return lines.join("\n");
}

export function researchReportFilenameSlug(topic) {
  const t = (topic || "research-report").slice(0, 56);
  const s = t.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  return s || "research-report";
}
