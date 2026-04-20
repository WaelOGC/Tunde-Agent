/**
 * Parse free-form user text into a read-only "Business Brief" field map.
 * Recognizes lines like `Niche: …`, `Market — …`, `- Budget: …`.
 */

const KEY_ALIASES = [
  ["niche", /^niche|vertical|segment|category|space$/i],
  ["market", /^market|industry|sector|audience|icp$/i],
  ["budget", /^budget|spend|funding|capital|investment|price\s*point$/i],
  ["geography", /^geo|region|country|location|market\s*area$/i],
  ["timeline", /^timeline|horizon|deadline|timeframe|quarter$/i],
  ["goal", /^goal|objective|outcome|hypothesis|success$/i],
];

function normalizeKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");
}

function matchCanonicalKey(keyNorm) {
  const compact = keyNorm.replace(/\s+/g, "_");
  for (const [canon, re] of KEY_ALIASES) {
    if (re.test(compact) || re.test(keyNorm)) return canon;
  }
  return null;
}

export function parseBusinessBrief(raw) {
  const text = String(raw ?? "").trim();
  const fields = {
    niche: "",
    market: "",
    budget: "",
    geography: "",
    timeline: "",
    goal: "",
    notes: "",
  };
  if (!text) return { fields, linesUsed: 0 };

  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const consumed = new Set();
  let matched = 0;

  for (const line of lines) {
    let m = line.match(/^\*\*([^*]+)\*\*\s*[:|\-]\s*(.+)$/);
    if (!m) m = line.match(/^[-*]\s*\*\*([^*]+)\*\*\s*[:|\-]\s*(.+)$/);
    if (!m) m = line.match(/^[-*]\s*([^:|\-]{1,48})\s*[:|\-]\s*(.+)$/);
    if (!m) m = line.match(/^([^:|\-\n]{1,48})\s*[:|\-]\s*(.+)$/);
    if (!m) continue;
    const keyNorm = normalizeKey(m[1]);
    const val = String(m[2] ?? "").trim();
    if (!val) continue;
    const canon = matchCanonicalKey(keyNorm);
    if (canon && fields[canon] !== undefined) {
      if (!fields[canon]) {
        fields[canon] = val;
        matched += 1;
      } else {
        fields[canon] = `${fields[canon]}; ${val}`;
      }
      consumed.add(line);
    }
  }

  const leftover = lines.filter((l) => !consumed.has(l));
  fields.notes = leftover.join("\n").trim();

  if (matched === 0 && !fields.notes && text.length <= 600) {
    fields.niche = text;
  } else if (matched === 0 && !fields.niche && leftover.length) {
    fields.notes = leftover.join("\n").trim();
  }

  return { fields, linesUsed: lines.length };
}
