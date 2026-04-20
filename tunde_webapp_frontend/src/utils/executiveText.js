/** Strip common markdown/list noise for executive-facing UI (canvas + chat summary). */

export function stripExecutiveSummary(input) {
  let s = String(input ?? "");
  s = s.replace(/\r\n/g, "\n");
  s = s.replace(/\*\*([^*]*)\*\*/g, "$1");
  s = s.replace(/\*([^*]*)\*/g, "$1");
  s = s.replace(/__([^_]*)__/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*>\s?/gm, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
