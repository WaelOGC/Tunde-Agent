/** Shared client for Canvas export flows (generate + publish). Used by workspace landing and Business Agent canvas. */

export function backendHttpBase() {
  return import.meta.env.VITE_BACKEND_HTTP_BASE || "http://localhost:8001";
}

function parseDetail(raw) {
  const slice = String(raw || "").slice(0, 400);
  try {
    const ej = JSON.parse(slice);
    if (ej && typeof ej.detail === "string") return ej.detail;
  } catch {
    /* ignore */
  }
  return slice;
}

/**
 * POST /api/pages/generate
 * @returns {{ ok: true, html: string, title: string } | { ok: false, detail: string }}
 */
export async function generatePage({
  userId,
  source,
  context = "",
  title_hint = "",
  existing_html = "",
  revision_notes = "",
}) {
  const base = backendHttpBase().replace(/\/$/, "");
  const payload = {
    user_id: userId,
    source,
    context: context || "",
  };
  const th = String(title_hint || "").trim();
  const ex = String(existing_html || "").trim();
  const rn = String(revision_notes || "").trim();
  if (th) payload.title_hint = th;
  if (ex) payload.existing_html = ex;
  if (rn) payload.revision_notes = rn;

  try {
    const r = await fetch(`${base}/api/pages/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await r.text();
    if (!r.ok) {
      return { ok: false, detail: parseDetail(raw), raw };
    }
    const data = JSON.parse(raw);
    const html = typeof data.html === "string" ? data.html : "";
    const title =
      typeof data.title === "string" && data.title.trim() ? data.title.trim() : "";
    return { ok: true, html, title, data };
  } catch {
    return { ok: false, detail: "Could not reach the server.", raw: "" };
  }
}

/**
 * POST /api/pages/publish
 * @returns {{ ok: true, share_url: string } | { ok: false, detail: string }}
 */
export async function publishPage({ userId, title, html }) {
  const base = backendHttpBase().replace(/\/$/, "");
  const body = {
    user_id: userId,
    title: title || "Tunde Report",
    html: html || "",
  };
  try {
    const r = await fetch(`${base}/api/pages/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await r.text();
    if (!r.ok) {
      return { ok: false, detail: parseDetail(raw), raw };
    }
    const j = JSON.parse(raw);
    const share_url = typeof j.share_url === "string" ? j.share_url.trim() : "";
    return { ok: true, share_url };
  } catch {
    return { ok: false, detail: "Could not reach the server.", raw: "" };
  }
}
