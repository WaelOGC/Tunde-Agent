/**
 * Detect GitHub-style pipe tables in plain text and split into render segments.
 * Each table: header row + separator row (---) + body rows.
 */

function trimLine(line) {
  return (line || "").replace(/\r$/, "").trimEnd();
}

function isPipeTableRow(line) {
  const s = trimLine(line);
  if (!s || !s.includes("|")) return false;
  const pipes = (s.match(/\|/g) || []).length;
  return pipes >= 2;
}

function isSeparatorRow(line) {
  const s = trimLine(line);
  if (!s.includes("-") && !s.includes(":")) return false;
  const inner = s.replace(/^\|/, "").replace(/\|$/, "");
  const cells = inner.split("|").map((c) => c.trim());
  if (cells.length < 2) return false;
  return cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function splitPipeRow(line) {
  let s = trimLine(line);
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/**
 * Unwrap ```fenced``` regions that contain pipe tables so the table parser can see them.
 * Keeps non-table fences unchanged.
 */
export function unwrapTableCodeFences(text) {
  const str = String(text ?? "");
  return str.replace(/```(?:markdown|md|tbl|table)?\s*\r?\n([\s\S]*?)\r?\n```/gi, (full, inner) => {
    const body = String(inner || "");
    if (body.includes("|") && /-{2,}/.test(body)) {
      return `\n${body}\n`;
    }
    return full;
  });
}

/**
 * Strip a single leading HTML <table>...</table> into pipe-like lines is complex; skip for now.
 * Normalize Windows newlines.
 */
export function prepareAssistantMarkdown(text) {
  let s = String(text ?? "").replace(/\r\n/g, "\n");
  s = unwrapTableCodeFences(s);
  return s;
}

/**
 * @returns {Array<{ type: 'text', text: string } | { type: 'table', headers: string[], rows: string[][] }>}
 */
export function segmentMarkdownPipeTables(text) {
  if (text == null || text === "") {
    return [{ type: "text", text: "" }];
  }
  const str = String(text);
  const lines = str.split("\n");
  const segments = [];
  let buf = [];

  function flushBuf() {
    if (!buf.length) return;
    const t = buf.join("\n");
    if (t.length) segments.push({ type: "text", text: t });
    buf = [];
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : "";

    if (isPipeTableRow(line) && isSeparatorRow(next)) {
      const headerStart = i;
      const headers = splitPipeRow(line);
      const sepCells = splitPipeRow(next);
      if (headers.length >= 2 && sepCells.length >= 2) {
        i += 2;
        const rows = [];
        while (i < lines.length && isPipeTableRow(lines[i]) && !isSeparatorRow(lines[i])) {
          const r = splitPipeRow(lines[i]);
          if (r.length > 0) rows.push(r);
          i += 1;
        }
        flushBuf();
        const width = headers.length;
        const normRows = rows.map((r) => {
          const copy = [...r];
          while (copy.length < width) copy.push("");
          return copy.slice(0, width);
        });
        segments.push({ type: "table", headers, rows: normRows });
        continue;
      }
      i = headerStart;
    }

    buf.push(lines[i]);
    i += 1;
  }

  flushBuf();
  return segments.length ? segments : [{ type: "text", text: str }];
}
