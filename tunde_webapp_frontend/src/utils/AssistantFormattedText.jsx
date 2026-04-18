import { useMemo } from "react";

/** Remove stray ** so they never appear in the UI if the model leaves them unmatched. */
function stripDoubleAsterisks(s) {
  return String(s ?? "").replace(/\*\*/g, "");
}

/**
 * Inline **bold** and *italic* → React nodes (no visible asterisks).
 * Also strips orphan `**` and converts `__bold__` to strong.
 */
export function parseInlineFormatting(text, keyPrefix = "i") {
  const segment = String(text ?? "").replace(/__([^_]+)__/g, "**$1**");
  if (!segment) return [];

  const out = [];
  let remaining = segment;
  let k = 0;

  function pushItalicsOnly(s, base) {
    if (!s) return;
    const cleaned = stripDoubleAsterisks(s);
    if (!cleaned) return;
    const re = /\*([^*]+)\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      if (m.index > last) {
        out.push(
          <span key={`${base}-t-${k++}`} className="text-slate-200/95">
            {cleaned.slice(last, m.index)}
          </span>
        );
      }
      out.push(
        <em key={`${base}-em-${k++}`} className="italic text-slate-100/90">
          {m[1]}
        </em>
      );
      last = re.lastIndex;
    }
    if (last < cleaned.length) {
      out.push(
        <span key={`${base}-t-${k++}`} className="text-slate-200/95">
          {cleaned.slice(last)}
        </span>
      );
    }
  }

  while (remaining.length) {
    const boldIdx = remaining.indexOf("**");
    if (boldIdx === -1) {
      pushItalicsOnly(remaining, `${keyPrefix}-${k}`);
      break;
    }
    if (boldIdx > 0) {
      pushItalicsOnly(remaining.slice(0, boldIdx), `${keyPrefix}-pre-${k}`);
    }
    const endBold = remaining.indexOf("**", boldIdx + 2);
    if (endBold === -1) {
      pushItalicsOnly(remaining.slice(boldIdx + 2), `${keyPrefix}-nb-${k}`);
      break;
    }
    const inner = remaining.slice(boldIdx + 2, endBold);
    out.push(
      <strong key={`${keyPrefix}-b-${k++}`} className="font-bold text-slate-50">
        {parseInlineFormatting(inner, `${keyPrefix}-in-${k}`)}
      </strong>
    );
    remaining = remaining.slice(endBold + 2);
  }

  return out.length ? out : [<span key={`${keyPrefix}-empty`} />];
}

/**
 * Build block-level nodes: headings (no # in UI), lists, paragraphs. Tables stay in CanvasTable.
 */
export function buildAssistantNodes(text) {
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
    const listClass =
      listBuf.type === "ol"
        ? "my-3 list-decimal space-y-2 pl-5 text-slate-200/95 marker:text-cyan-400/90"
        : "my-3 list-disc space-y-2 pl-5 text-slate-200/95 marker:text-emerald-400/70";
    elements.push(
      <Tag key={`${listBuf.type}-${elements.length}`} className={listClass}>
        {listBuf.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {parseInlineFormatting(item, `li-${elements.length}-${idx}`)}
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
        className="my-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-slate-200/95 first:mt-0 last:mb-0"
      >
        {parseInlineFormatting(body, `p-${elements.length}`)}
      </p>
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (!line.trim()) {
      flushList();
      flushPara();
      continue;
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
        <Tag key={`h-${elements.length}`} className="scroll-mt-4">
          {parseInlineFormatting(content, `h-${elements.length}`)}
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
          <h2 key={`h2-bold-${elements.length}`} className="scroll-mt-4">
            {title}
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

export function AssistantFormattedText({ text }) {
  const nodes = useMemo(() => buildAssistantNodes(text || ""), [text]);
  return <div className="assistant-rich min-w-0">{nodes}</div>;
}
