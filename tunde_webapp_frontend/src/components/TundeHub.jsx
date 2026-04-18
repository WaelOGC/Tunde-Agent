import { useCallback, useEffect, useState } from "react";

const TILES = [
  {
    id: "google_drive",
    name: "Google Drive",
    description: "Access your files and documents",
    icon: "📁",
    oauthProvider: "google",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Read and summarize your emails",
    icon: "📧",
    oauthProvider: "google",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Manage your schedule",
    icon: "📅",
    oauthProvider: "google",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Connect your repositories",
    icon: "🐙",
    oauthProvider: "github",
  },
];

function badgeClasses(status) {
  if (status === "connected") {
    return "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/35";
  }
  if (status === "error") {
    return "bg-red-500/15 text-red-400 ring-1 ring-red-500/35";
  }
  return "bg-slate-700/50 text-slate-400 ring-1 ring-slate-600/60";
}

function badgeLabel(status) {
  if (status === "connected") return "Connected";
  if (status === "error") return "Error";
  return "Disconnected";
}

export default function TundeHub({ open, onClose, apiBase }) {
  const base = (apiBase || "http://127.0.0.1:8001").replace(/\/$/, "");
  const [integrations, setIntegrations] = useState({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${base}/auth/status`);
      if (!r.ok) throw new Error("status failed");
      const j = await r.json();
      setIntegrations(j.integrations && typeof j.integrations === "object" ? j.integrations : {});
    } catch {
      setIntegrations({});
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (!open) return undefined;
    loadStatus();
    const onVis = () => {
      if (document.visibilityState === "visible") loadStatus();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, loadStatus]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const connect = (provider) => {
    const path = provider === "github" ? "/auth/github/start" : "/auth/google/start";
    window.location.href = `${base}${path}`;
  };

  const disconnect = async (tile) => {
    const path =
      tile.oauthProvider === "github" ? "/auth/github/disconnect" : "/auth/google/disconnect";
    setBusyId(tile.id);
    try {
      const r = await fetch(`${base}${path}`, { method: "DELETE" });
      if (!r.ok) throw new Error("disconnect failed");
      await loadStatus();
    } catch {
      await loadStatus();
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative max-h-[min(90vh,840px)] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-800/90 bg-tunde-bg shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tunde-hub-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 px-5 py-4 md:px-6">
          <div>
            <h2 id="tunde-hub-title" className="text-lg font-semibold tracking-tight text-white">
              Tunde Hub
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Connect memory sources for Tunde Agent. Google services share one sign-in.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-white"
            aria-label="Close Tunde Hub"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="max-h-[min(72vh,680px)] overflow-y-auto px-5 py-5 md:px-6">
          {loading && Object.keys(integrations).length === 0 ? (
            <p className="text-center text-sm text-slate-500">Loading connections…</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
            {TILES.map((tile) => {
              const meta = integrations[tile.id];
              const status =
                meta && typeof meta.status === "string" ? meta.status : "disconnected";
              const isConnected = status === "connected";
              const isError = status === "error";
              const busy = busyId === tile.id;

              return (
                <article
                  key={tile.id}
                  className="flex flex-col rounded-xl border border-slate-800/90 bg-tunde-surface/90 p-4 shadow-inner shadow-black/20"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900/80 text-xl"
                      aria-hidden
                    >
                      {tile.icon}
                    </span>
                    <span
                      className={[
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        badgeClasses(status),
                      ].join(" ")}
                    >
                      {badgeLabel(status)}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">{tile.name}</h3>
                  <p className="mt-1 flex-1 text-[11px] leading-snug text-slate-500 md:text-xs">
                    {tile.description}
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    {isConnected ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => disconnect(tile)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800/60 disabled:opacity-50"
                      >
                        {busy ? "…" : "Disconnect"}
                      </button>
                    ) : isError ? (
                      <>
                        <button
                          type="button"
                          onClick={() => connect(tile.oauthProvider)}
                          className="w-full rounded-lg bg-tunde-accent px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-violet-950/30 transition-colors hover:bg-tunde-accentHover"
                        >
                          Connect
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => disconnect(tile)}
                          className="w-full rounded-lg border border-slate-600 bg-transparent px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800/60 disabled:opacity-50"
                        >
                          {busy ? "…" : "Disconnect"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => connect(tile.oauthProvider)}
                        className="w-full rounded-lg bg-tunde-accent px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-violet-950/30 transition-colors hover:bg-tunde-accentHover"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-800/80 px-5 py-3 md:px-6">
          <p className="text-center text-[10px] text-slate-600">
            Sessions use encrypted tokens on the server. Reconnect if you see an error badge.
          </p>
        </div>
      </div>
    </div>
  );
}
