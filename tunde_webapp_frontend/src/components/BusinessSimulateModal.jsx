import { useCallback, useState } from "react";

const BTN_ROW =
  "flex flex-wrap justify-end gap-2 border-t border-white/[0.06] bg-slate-950/60 px-4 py-3 backdrop-blur-sm";

/**
 * Lightweight modal: POST /tools/business/simulate and return merged scenario payload.
 */
export default function BusinessSimulateModal({
  open,
  messageId = null,
  sessionNotes = "",
  onClose,
  onApplied,
  backendBase,
}) {
  const [label, setLabel] = useState("Growth scenario");
  const [baseRevenue, setBaseRevenue] = useState("1000000");
  const [growth, setGrowth] = useState("0.12");
  const [cogs, setCogs] = useState("0.42");
  const [opex, setOpex] = useState("0.28");
  const [tax, setTax] = useState("0.21");
  const [periods, setPeriods] = useState("4");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = useCallback(async () => {
    setErr("");
    setBusy(true);
    const base = (backendBase || "").replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/tools/business/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || "Scenario",
          base_revenue: Number(baseRevenue) || 0,
          revenue_growth_yoy: Number(growth) || 0,
          cogs_ratio: Number(cogs) || 0,
          opex_ratio: Number(opex) || 0,
          tax_rate: Number(tax) || 0,
          periods: Math.min(12, Math.max(1, parseInt(periods, 10) || 4)),
        }),
      });
      const raw = await r.text();
      if (!r.ok) {
        let d = raw.slice(0, 240);
        try {
          const j = JSON.parse(raw);
          if (typeof j.detail === "string") d = j.detail;
        } catch {
          /* ignore */
        }
        setErr(d);
        return;
      }
      const data = JSON.parse(raw);
      onApplied?.(data, messageId);
      onClose?.();
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }, [backendBase, cogs, growth, label, messageId, opex, onApplied, onClose, periods, tax, baseRevenue]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => !busy && onClose?.()}
      />
      <div className="relative z-[1] w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.1] bg-slate-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-emerald-900/30 backdrop-blur-xl">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300/90">Business Agent · Scenario simulation</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">What-if P/L (deterministic)</p>
          {(sessionNotes || "").trim() ? (
            <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-950/30 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Instructions from chat</p>
              <p className="mt-1 text-[12px] leading-snug text-emerald-50/95">{(sessionNotes || "").trim()}</p>
            </div>
          ) : null}
        </div>
        <div className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto px-4 py-4 text-[13px] text-slate-200">
          {err ? (
            <p className="rounded-lg border border-rose-500/35 bg-rose-950/40 px-3 py-2 text-[12px] text-rose-100">{err}</p>
          ) : null}
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500">Base revenue ($)</span>
            <input
              value={baseRevenue}
              onChange={(e) => setBaseRevenue(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-slate-100"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500">YoY growth</span>
              <input
                value={growth}
                onChange={(e) => setGrowth(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500">Periods</span>
              <input
                value={periods}
                onChange={(e) => setPeriods(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-slate-100"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500">COGS ratio</span>
              <input value={cogs} onChange={(e) => setCogs(e.target.value)} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-slate-100" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500">OpEx ratio</span>
              <input value={opex} onChange={(e) => setOpex(e.target.value)} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-slate-100" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500">Tax rate</span>
              <input value={tax} onChange={(e) => setTax(e.target.value)} className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-slate-100" />
            </label>
          </div>
        </div>
        <div className={BTN_ROW}>
          <button
            type="button"
            disabled={busy}
            onClick={() => !busy && onClose?.()}
            className="rounded-lg border border-slate-600 px-3 py-2 text-[12px] font-medium text-slate-300 hover:bg-slate-800/80 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-3 py-2 text-[12px] font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-40"
          >
            {busy ? "Running…" : "Apply to pack"}
          </button>
        </div>
      </div>
    </div>
  );
}
