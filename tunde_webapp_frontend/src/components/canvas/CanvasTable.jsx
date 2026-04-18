import { useCallback, useEffect, useMemo } from "react";

function escapeCsvCell(s) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function toCsv(headers, rows) {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map(escapeCsvCell).join(",")),
  ];
  return lines.join("\r\n");
}

function toTsv(headers, rows) {
  return [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
}

export default function CanvasTable({
  headers,
  rows,
  title,
  subtitle = "Table",
  delayMs = 0,
}) {
  const csvBlobUrl = useMemo(() => {
    if (!Array.isArray(headers) || !Array.isArray(rows)) return null;
    const csv = `\ufeff${toCsv(headers, rows)}`;
    return URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }, [headers, rows]);

  useEffect(() => {
    return () => {
      if (csvBlobUrl) URL.revokeObjectURL(csvBlobUrl);
    };
  }, [csvBlobUrl]);

  const copyTsv = useCallback(async () => {
    if (!Array.isArray(headers) || !Array.isArray(rows)) return;
    const tsv = toTsv(headers, rows);
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      /* ignore */
    }
  }, [headers, rows]);

  const exportCsv = useCallback(() => {
    if (!csvBlobUrl) return;
    const a = document.createElement("a");
    a.href = csvBlobUrl;
    a.download = `tunde-table-${Date.now()}.csv`;
    a.click();
  }, [csvBlobUrl]);

  const exportExcel = useCallback(() => {
    if (!csvBlobUrl) return;
    const a = document.createElement("a");
    a.href = csvBlobUrl;
    a.download = `tunde-table-${Date.now()}.xls`;
    a.click();
  }, [csvBlobUrl]);

  if (!Array.isArray(headers) || !Array.isArray(rows)) return null;

  return (
    <div
      className="canvas-block-enter my-4 w-full max-w-none overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/50 shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-1 ring-slate-800/80 first:mt-0"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-cyan-950/50 bg-gradient-to-r from-cyan-950/50 via-slate-900/80 to-emerald-950/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/90">
            {subtitle}
          </p>
          {title ? <p className="mt-0.5 truncate text-xs font-medium text-slate-300">{title}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <button
            type="button"
            onClick={copyTsv}
            className="rounded-md border border-slate-700/80 bg-slate-900/80 px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            title="Copy as tab-separated (Excel-ready)"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-slate-700/80 bg-slate-900/80 px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            title="Download CSV"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="rounded-md border border-slate-700/80 bg-slate-900/80 px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            title="Download Excel-compatible spreadsheet (.xls)"
          >
            Excel
          </button>
        </div>
      </div>
      <div className="overflow-x-auto px-0 py-1 sm:px-0">
        <table className="w-full min-w-full border-collapse text-left text-sm leading-snug text-slate-300">
          <thead className="sticky top-0 z-[1] backdrop-blur-sm">
            <tr
              className="shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]"
              style={{
                background: "linear-gradient(to bottom, #4a6fa5 0%, #3d5a80 55%, #2f4f73 100%)",
              }}
            >
              {headers.map((h, j) => (
                <th
                  key={j}
                  className="border-b border-white/15 border-r border-white/10 px-3 py-3 text-left align-bottom text-[0.875rem] font-bold tracking-tight text-white last:border-r-0 sm:text-[0.9375rem]"
                >
                  <span className="text-cyan-100">{h}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-slate-800/60 bg-slate-900/15 transition-colors odd:bg-slate-900/25 hover:bg-slate-800/40"
              >
                {row.map((c, ci) => (
                  <td
                    key={ci}
                    className="border-r border-slate-800/50 px-3 py-2.5 align-top text-[0.8125rem] text-slate-200/95 last:border-r-0 sm:text-sm"
                  >
                    <span className="block whitespace-pre-wrap break-words">{c}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
