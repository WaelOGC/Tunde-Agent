import { useMemo } from "react";

/** Remove stray ** so they never appear in the UI if the model leaves them unmatched. */
function stripDoubleAsterisks(s) {
  return String(s ?? "").replace(/\*\*/g, "");
}

function renderTextWithHighlights(text, keyBase, cls, { enable = false } = {}) {
  // By the time we get here, markdown markers should already be parsed out.
  // Still, we hard-strip stray asterisks so they never leak into UI.
  const s = String(text ?? "").replace(/\*/g, "");
  if (!s) return [];
  if (!enable) {
    return [
      <span key={`${keyBase}-t`} className={cls.span}>
        {s}
      </span>,
    ];
  }

  // Highlight (in this order):
  // - bracket/paren chunks
  // - Q1/Q2/Q3/Q4
  // - numbers with optional currency + %
  // - key symbols
  const re =
    /\[[^\]]*\]|\([^)]*\)|\bQ[1-4]\b|\b(?:EBITDA|TAM|SAM|SOM|YoY|CAGR|ROAS|ROIC|ROI|MCap|ARR|MRR|GMV|EBIT|COGS|OPEX|CAPEX|P\/E|EV\/EBITDA|B2B|B2C)\b|([$€£₦])?\b-?\d[\d,]*(?:\.\d+)?%?\b|[~/%$€£₦]/g;
  const out = [];
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(s)) !== null) {
    const start = m.index;
    const end = re.lastIndex;
    if (start > last) {
      out.push(
        <span key={`${keyBase}-txt-${k++}`} className={cls.span}>
          {s.slice(last, start)}
        </span>
      );
    }
    const token = s.slice(start, end);
    const isBracket = token.startsWith("[") && token.endsWith("]");
    const isParen = token.startsWith("(") && token.endsWith(")");
    const isQuarter = /^Q[1-4]$/.test(token);
    const isBizAcronym =
      /^(?:EBITDA|TAM|SAM|SOM|YoY|CAGR|ROAS|ROIC|ROI|MCap|ARR|MRR|GMV|EBIT|COGS|OPEX|CAPEX|P\/E|EV\/EBITDA|B2B|B2C)$/i.test(
        token
      );
    const isNumberLike = /([$€£₦])?\b-?\d/.test(token);
    const isPercent = isNumberLike && token.includes("%");
    const tokenClass = isBracket || isParen
      ? cls.meta
      : isBizAcronym
        ? cls.meta
        : isQuarter
          ? cls.quarter
          : isPercent
            ? cls.percent
            : isNumberLike
              ? cls.num
              : cls.sym;
    out.push(
      <span key={`${keyBase}-hl-${k++}`} className={tokenClass} style={{ fontVariantNumeric: "tabular-nums" }}>
        {token}
      </span>
    );
    last = end;
  }
  if (last < s.length) {
    out.push(
      <span key={`${keyBase}-txt-${k++}`} className={cls.span}>
        {s.slice(last)}
      </span>
    );
  }
  return out;
}

/**
 * Inline **bold** and *italic* → React nodes (no visible asterisks).
 * Also strips orphan `**` and converts `__bold__` to strong.
 * @param {{ paper?: boolean }} options — `paper`: dark text on white (research report).
 */
export function parseInlineFormatting(text, keyPrefix = "i", options = {}) {
  const paper = Boolean(options.paper);
  const segment = String(text ?? "").replace(/__([^_]+)__/g, "**$1**");
  if (!segment) return [];

  let k = 0;
  const cls = paper
    ? {
        // Use text-current so headings can apply their own color.
        span: "text-current",
        em: "italic text-current",
        strong: "font-bold text-current",
        num: "text-[#0f4c81] font-semibold",
        percent: "text-[#0f4c81] font-semibold",
        sym: "text-[#8b5a00] font-semibold",
        meta: "text-[#b45309] font-semibold",
        quarter: "text-[#0f2a5f] font-semibold",
      }
    : {
        // Dark glass mode (Tunde palette)
        span: "text-current",
        em: "italic text-current",
        strong: "font-semibold text-slate-50",
        num: "text-amber-300 font-semibold",
        percent: "text-emerald-300 font-semibold",
        sym: "text-amber-200 font-semibold",
        meta: "rounded-md bg-indigo-500/10 px-1 py-[1px] text-indigo-200 ring-1 ring-indigo-400/20",
        quarter: "text-cyan-300 font-semibold",
      };

  const highlight = Boolean(options.highlightTokens);

  function renderPlainChunk(chunk, localPrefix) {
    return renderTextWithHighlights(stripDoubleAsterisks(chunk), localPrefix, cls, { enable: highlight });
  }

  function parseSegment(input, localPrefix, depth = 0) {
    if (!input) return [];
    if (depth > 6) {
      // Safety valve for weirdly nested model output
      return renderPlainChunk(input, `${localPrefix}-d${depth}`);
    }

    const out = [];
    let i = 0;
    const s = String(input);
    while (i < s.length) {
      // Prefer bold markers first
      if (s.startsWith("**", i)) {
        const end = s.indexOf("**", i + 2);
        if (end !== -1) {
          const inner = s.slice(i + 2, end);
          out.push(
            <strong key={`${localPrefix}-b-${k++}`} className={cls.strong}>
              {parseSegment(inner, `${localPrefix}-bin-${k}`, depth + 1)}
            </strong>
          );
          i = end + 2;
          continue;
        }
        // Unmatched marker: skip it
        i += 2;
        continue;
      }

      if (s[i] === "*") {
        const end = s.indexOf("*", i + 1);
        if (end !== -1) {
          const inner = s.slice(i + 1, end);
          out.push(
            <em key={`${localPrefix}-em-${k++}`} className={cls.em}>
              {parseSegment(inner, `${localPrefix}-emin-${k}`, depth + 1)}
            </em>
          );
          i = end + 1;
          continue;
        }
        // Unmatched marker: skip it
        i += 1;
        continue;
      }

      const nextBold = s.indexOf("**", i);
      const nextEm = s.indexOf("*", i);
      const next = [nextBold, nextEm].filter((x) => x !== -1).sort((a, b) => a - b)[0];
      const end = next === undefined ? s.length : next;
      const chunk = s.slice(i, end);
      renderPlainChunk(chunk, `${localPrefix}-t-${k++}`).forEach((n) => out.push(n));
      i = end;
    }
    return out;
  }

  const nodes = parseSegment(segment, keyPrefix, 0);
  return nodes.length ? nodes : [<span key={`${keyPrefix}-empty`} />];
}

/**
 * Build block-level nodes: headings (no # in UI), lists, paragraphs. Tables stay in CanvasTable.
 * @param {{ paper?: boolean }} options
 */
export function buildAssistantNodes(text, options = {}) {
  const paper = Boolean(options.paper);
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const elements = [];
  let paraBuf = [];
  /** @type {{ type: 'ul' | 'ol', items: string[] } | null} */
  let listBuf = null;

  function flushList() {
    if (!listBuf?.items?.length) {
      listBuf = null;
      return;
    }
    const Tag = listBuf.type === "ol" ? "ol" : "ul";
    const listClass = paper
      ? listBuf.type === "ol"
        ? "my-4 list-decimal space-y-2.5 pl-5 text-[15.5px] leading-7 tracking-[0.01em] text-[#1c1c1e] marker:font-semibold marker:text-[#64748b]"
        : "my-4 list-disc space-y-2.5 pl-5 text-[15.5px] leading-7 tracking-[0.01em] text-[#1c1c1e] marker:text-[#94a3b8]"
      : listBuf.type === "ol"
        ? "my-3 list-decimal space-y-2 pl-5 text-slate-200/95 marker:text-cyan-400/90"
        : "my-3 list-disc space-y-2 pl-5 text-slate-200/95 marker:text-emerald-400/70";
    elements.push(
      <Tag key={`${listBuf.type}-${elements.length}`} className={listClass}>
        {listBuf.items.map((item, idx) => (
          <li key={idx} className={paper ? "leading-[1.75]" : "leading-relaxed"}>
            {parseInlineFormatting(item, `li-${elements.length}-${idx}`, options)}
          </li>
        ))}
      </Tag>
    );
    listBuf = null;
  }

  function flushPara() {
    if (!paraBuf.length) return;
    const body = paraBuf.join("\n");
    paraBuf = [];
    elements.push(
      <p
        key={`p-${elements.length}`}
        className={
          paper
            ? "my-4 whitespace-pre-line text-[15.5px] leading-7 tracking-[0.01em] text-[#1c1c1e] first:mt-0 last:mb-0"
            : "my-3 whitespace-pre-line text-[0.9375rem] leading-relaxed text-slate-200 first:mt-0 last:mb-0"
        }
      >
        {parseInlineFormatting(body, `p-${elements.length}`, options)}
      </p>
    );
  }

  function headingClass(level) {
    if (!paper) {
      if (level === 1) {
        return "scroll-mt-4 mb-3 mt-10 text-3xl font-extrabold leading-snug tracking-tight text-[#7c3aed] first:mt-0";
      }
      if (level === 2) {
        return "scroll-mt-4 mb-3 mt-10 text-xl font-extrabold leading-snug tracking-tight text-cyan-300";
      }
      return "scroll-mt-4 mb-2 mt-8 text-base font-bold leading-snug tracking-tight text-slate-50";
    }
    // Document Writer (paper mode): colored headings for stronger hierarchy.
    if (level === 1)
      return "scroll-mt-4 mt-7 mb-2 text-[26px] leading-tight font-extrabold tracking-tight text-[color:var(--dw-h1)] first:mt-0";
    if (level === 2)
      return "scroll-mt-4 mt-6 mb-2 text-[20px] leading-snug font-bold tracking-tight text-[color:var(--dw-h2)]";
    return "scroll-mt-4 mt-5 mb-1.5 text-[17px] leading-snug font-bold tracking-tight text-[color:var(--dw-h3)]";
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (!line.trim()) {
      flushList();
      flushPara();
      continue;
    }

    // Key-value / subheader lines like: "Market Size:" or "Market Size: $3.5B"
    // Highlight the label (before colon) in cyan to create scan-friendly hierarchy.
    const kv = line.match(/^(.{1,80}?):\s*(.*)$/);
    if (kv) {
      flushList();
      flushPara();
      const label = String(kv[1] || "").trim();
      const rest = String(kv[2] || "").trim();
      if (label) {
        if (!rest) {
          elements.push(
            <h3 key={`kv-h-${elements.length}`} className={paper ? headingClass(3) : "scroll-mt-4 mb-2 mt-8 text-base font-bold tracking-tight text-cyan-300"}>
              {parseInlineFormatting(label, `kvh-${elements.length}`, options)}
              <span className="text-cyan-300">:</span>
            </h3>
          );
        } else {
          elements.push(
            <p key={`kv-p-${elements.length}`} className={paper ? "my-4 text-[15.5px] leading-7 tracking-[0.01em] text-[#1c1c1e]" : "my-3 text-[0.9375rem] leading-relaxed text-slate-200"}>
              <span className={paper ? "font-semibold text-[#0f2a5f]" : "font-semibold text-cyan-300"}>{parseInlineFormatting(label, `kvl-${elements.length}`, options)}</span>
              <span className={paper ? "text-[#0f2a5f]" : "text-cyan-300"}>:</span>{" "}
              {parseInlineFormatting(rest, `kvr-${elements.length}`, options)}
            </p>
          );
        }
        continue;
      }
    }

    const hm = line.match(/^(\#{1,6})\s*(.*)$/);
    if (hm) {
      flushList();
      flushPara();
      const level = hm[1].length;
      const content = (hm[2] || "").trim();
      if (!content) {
        continue;
      }
      let Tag;
      if (level === 1) Tag = "h1";
      else if (level === 2) Tag = "h2";
      else Tag = "h3";
      elements.push(
        <Tag key={`h-${elements.length}`} className={headingClass(level)}>
          {parseInlineFormatting(content, `h-${elements.length}`, options)}
        </Tag>
      );
      continue;
    }

    /* Whole line is **bold** only (models often use this instead of ##) → real <h2> + heading CSS */
    const boldOnly = line.match(/^\*\*([^*]+)\*\*\s*$/);
    if (boldOnly) {
      flushList();
      flushPara();
      const title = (boldOnly[1] || "").trim();
      if (title) {
        elements.push(
          <h2
            key={`h2-bold-${elements.length}`}
            className={paper ? headingClass(2) : "scroll-mt-4 mb-2 mt-5 text-xl font-semibold leading-snug text-white/85"}
          >
            {parseInlineFormatting(title, `h2-bold-${elements.length}`, options)}
          </h2>
        );
      }
      continue;
    }

    const bullet = line.match(/^[\-\*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!listBuf || listBuf.type !== "ul") {
        flushList();
        listBuf = { type: "ul", items: [] };
      }
      listBuf.items.push(bullet[1]);
      continue;
    }

    const ordered = line.match(/^(\d+)\.\s+(.*)$/);
    if (ordered) {
      flushPara();
      if (!listBuf || listBuf.type !== "ol") {
        flushList();
        listBuf = { type: "ol", items: [] };
      }
      listBuf.items.push(ordered[2]);
      continue;
    }

    flushList();
    paraBuf.push(line);
  }

  flushList();
  flushPara();
  return elements;
}

export function AssistantFormattedText({ text, paper = false, highlightTokens = false }) {
  const nodes = useMemo(
    () => buildAssistantNodes(text || "", { paper, highlightTokens }),
    [text, paper, highlightTokens]
  );
  const rootClass = paper ? "assistant-rich document-paper min-w-0" : "assistant-rich min-w-0";
  return <div className={rootClass}>{nodes}</div>;
}
