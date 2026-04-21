import { forwardRef, useCallback, useMemo, useState } from "react";

const SHELL =
  "flex h-full min-h-0 flex-col overflow-hidden rounded-l-2xl border border-white/[0.08] bg-slate-950/80 shadow-[0_12px_48px_rgba(0,0,0,0.45)] ring-1 ring-purple-900/40 backdrop-blur-xl";

const TAB_BTN =
  "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150";

const HEADER_PILL_GHOST =
  "relative inline-flex items-center gap-1.5 rounded-lg border border-slate-600/80 bg-slate-900/50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80";

const TAB_IDS = new Set(["overview", "colors", "typography", "logo", "guidelines", "export"]);

function parseHex(hex) {
  const h = String(hex || "").trim();
  const m = h.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hexToRgbHsl(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return { rgbStr: "—", hslStr: "—" };
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return {
    rgbStr: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    hslStr: `hsl(${h}, ${s}%, ${l}%)`,
  };
}

function googleFontsHref(fontName) {
  const f = String(fontName || "").trim();
  if (!f) return "";
  const q = encodeURIComponent(f).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${q}:wght@400;500;600;700&display=swap`;
}

function normalizeBulletList(val) {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.map((x) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x === "object" && typeof x.text === "string") return x.text.trim();
      try {
        return JSON.stringify(x);
      } catch {
        return String(x);
      }
    }).filter(Boolean);
  }
  if (typeof val === "string" && val.trim()) return [val.trim()];
  return [];
}

function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Prefer first palette swatch for export backdrop; otherwise Tunde canvas dark. */
function exportLogoBackgroundFill(palette) {
  const arr = Array.isArray(palette) ? palette : [];
  const hx = typeof arr[0]?.hex === "string" ? arr[0].hex.trim() : "";
  if (hx && parseHex(hx)) {
    return hx.startsWith("#") ? hx : `#${hx.replace(/^#/, "")}`;
  }
  return "#0a0f1a";
}

/** Insert a full-viewport background rect after the opening &lt;svg&gt; tag (download only; does not mutate API payload in state). */
function wrapSvgExportBackground(svgText, bgFill) {
  const bg = bgFill || "#0a0f1a";
  const raw = String(svgText || "").trim();
  if (!raw) return raw;
  const lowerStart = raw.slice(0, 512).trimStart().toLowerCase();
  if (!lowerStart.startsWith("<svg")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="240" viewBox="0 0 800 240"><rect width="100%" height="100%" fill="${bg}"/>${raw}</svg>`;
  }
  const gt = raw.indexOf(">");
  if (gt < 4) return raw;
  const openTag = raw.slice(0, gt + 1);
  return `${openTag}<rect width="100%" height="100%" fill="${bg}"/>${raw.slice(gt + 1)}`;
}

/** Rasterize logo SVG; widens viewBox ×1.5 + overflow visible so overflowing text is not clipped. */
function svgLogoToPngBlob(svgText, bgFill = "#0a0f1a") {
  return new Promise((resolve, reject) => {
    const svg = String(svgText || "").trim();
    if (!svg) {
      reject(new Error("empty svg"));
      return;
    }

    const DEFAULT_W = 800;
    const DEFAULT_H = 240;
    const WIDTH_PAD = 1.2;
    const RETINA = 1.8;

    let parsedW = DEFAULT_W;
    let parsedH = DEFAULT_H;
    let svgMarkup = svg;

    try {
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      const svgEl = doc.querySelector("svg");
      if (svgEl) {
        let minX = 0;
        let minY = 0;
        let sizeFromViewBox = false;

        const vbAttr = svgEl.getAttribute("viewBox");
        if (vbAttr) {
          const parts = vbAttr
            .trim()
            .split(/[\s,]+/)
            .map((s) => parseFloat(s, 10));
          if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0 && !Number.isNaN(parts[2]) && !Number.isNaN(parts[3])) {
            minX = parts[0];
            minY = parts[1];
            parsedW = parts[2];
            parsedH = parts[3];
            sizeFromViewBox = true;
          }
        }
        if (!sizeFromViewBox) {
          const ws = svgEl.getAttribute("width");
          const hs = svgEl.getAttribute("height");
          const pw = ws != null && ws !== "" ? parseFloat(String(ws).replace(/px|%|em/gi, "")) : NaN;
          const ph = hs != null && hs !== "" ? parseFloat(String(hs).replace(/px|%|em/gi, "")) : NaN;
          if (pw > 0 && ph > 0 && !Number.isNaN(pw) && !Number.isNaN(ph)) {
            parsedW = pw;
            parsedH = ph;
          }
        }

        const expandedW = parsedW * WIDTH_PAD;
        svgEl.setAttribute("overflow", "visible");
        svgEl.setAttribute("viewBox", `${minX} ${minY} ${expandedW} ${parsedH}`);
        svgEl.setAttribute("width", String(expandedW));
        svgEl.setAttribute("height", String(parsedH));

        svgMarkup = new XMLSerializer().serializeToString(svgEl);
      }
    } catch {
      svgMarkup = svg;
    }

    const canvasW = Math.max(1, Math.round(parsedW * WIDTH_PAD * RETINA));
    const canvasH = Math.max(1, Math.round(parsedH * RETINA));

    const img = new Image();
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("no canvas"));
          return;
        }
        ctx.fillStyle = bgFill;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (b) => {
            URL.revokeObjectURL(url);
            if (b) resolve(b);
            else reject(new Error("toBlob failed"));
          },
          "image/png",
          1
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("svg load failed"));
    };
    img.src = url;
  });
}

const DesignAgentCanvas = forwardRef(function DesignAgentCanvas({ open = true, brand = null, onClose }, ref) {
  const [tab, setTab] = useState("overview");
  const [logoBg, setLogoBg] = useState("dark");
  const [toast, setToast] = useState("");

  const b = brand && typeof brand === "object" ? brand : null;
  const title = typeof b?.brand_name === "string" && b.brand_name.trim() ? b.brand_name.trim() : "Brand identity";
  const tagline = typeof b?.tagline === "string" ? b.tagline.trim() : "";
  const palette = Array.isArray(b?.palette) ? b.palette : [];
  const typography = b?.typography && typeof b.typography === "object" ? b.typography : {};
  const heading = typography.heading && typeof typography.heading === "object" ? typography.heading : {};
  const body = typography.body && typeof typography.body === "object" ? typography.body : {};
  const accent = typography.accent && typeof typography.accent === "object" ? typography.accent : {};
  const guidelines = b?.guidelines && typeof b.guidelines === "object" ? b.guidelines : {};

  const previewName = title;

  const cssVars = typeof b?.css_variables === "string" ? b.css_variables : "";
  const logoSvg = typeof b?.logo_svg === "string" ? b.logo_svg : "";
  const iconSvg = typeof b?.logo_icon_svg === "string" ? b.logo_icon_svg : "";

  const storyItems = useMemo(() => {
    const raw = guidelines.brand_story ?? guidelines.story;
    if (typeof raw === "string") return [raw];
    return normalizeBulletList(raw);
  }, [guidelines]);

  const sectionMeta = useMemo(
    () => [
      { key: "brand_story", title: "Brand Story", field: guidelines.brand_story ?? guidelines.story },
      { key: "color_rules", title: "Color Rules", field: guidelines.color_rules },
      { key: "typography_scale", title: "Typography Scale", field: guidelines.typography_scale },
      { key: "logo_rules", title: "Logo Rules", field: guidelines.logo_rules },
      { key: "tone_of_voice", title: "Tone of Voice", field: guidelines.tone_of_voice },
    ],
    [guidelines]
  );

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const copyCss = useCallback(async () => {
    const t = cssVars.trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      showToast("Copied!");
    } catch {
      /* ignore */
    }
  }, [cssVars, showToast]);

  const downloadSvg = useCallback(
    (svgString, baseName) => {
      const raw = String(svgString || "").trim();
      if (!raw) return;
      const bg = exportLogoBackgroundFill(palette);
      const wrapped = wrapSvgExportBackground(raw, bg);
      const safe = String(baseName || "logo").replace(/[^\w\-]+/g, "_");
      downloadTextFile(`${safe}.svg`, wrapped, "image/svg+xml;charset=utf-8");
    },
    [palette]
  );

  const downloadLogoPng = useCallback(async () => {
    try {
      const bg = exportLogoBackgroundFill(palette);
      const blob = await svgLogoToPngBlob(logoSvg, bg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "_") || "logo"}_logo.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("PNG export failed");
    }
  }, [logoSvg, title, showToast, palette]);

  if (!open || !b) return null;

  const logoBgClass =
    logoBg === "light" ? "bg-white text-slate-900 border-slate-200/80" : "bg-[#0a0f1a] text-slate-100 border-white/[0.08]";

  return (
    <aside ref={ref} tabIndex={-1} className={["relative z-[60] flex min-h-0 w-full flex-col lg:max-w-[60%] lg:basis-[60%]", SHELL].join(" ")}>
      {toast ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2 rounded-full border border-purple-500/40 bg-purple-950/95 px-4 py-1.5 text-[12px] font-semibold text-purple-100 shadow-lg shadow-purple-950/50">
          {toast}
        </div>
      ) : null}

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.03] px-3 py-2.5 backdrop-blur-md">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300/90">Design Agent</p>
          <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>
          {tagline ? <p className="mt-0.5 truncate text-[11px] text-slate-500">{tagline}</p> : null}
        </div>
        <button type="button" onClick={onClose} className={HEADER_PILL_GHOST}>
          Close
        </button>
      </header>

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.05] bg-slate-950/50 px-2 py-2">
        {["overview", "colors", "typography", "logo", "guidelines", "export"].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => TAB_IDS.has(id) && setTab(id)}
            className={[
              TAB_BTN,
              tab === id
                ? "border-purple-500/45 bg-purple-500/15 text-purple-100"
                : "border-slate-700/80 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200",
            ].join(" ")}
          >
            {id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {tab === "overview" ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-purple-950/40 via-slate-950/80 to-slate-950/90 p-6 ring-1 ring-purple-500/15">
              <p className="font-serif text-2xl font-semibold tracking-tight text-slate-50">{title}</p>
              {tagline ? <p className="mt-2 text-[15px] text-purple-200/90">{tagline}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {palette.slice(0, 5).map((sw, i) => {
                  const hx = typeof sw.hex === "string" ? sw.hex : "";
                  return (
                    <span
                      key={i}
                      className="h-9 w-9 rounded-full border border-white/20 shadow-inner ring-2 ring-black/20"
                      style={{ backgroundColor: hx || "#333" }}
                      title={typeof sw.name === "string" ? sw.name : ""}
                    />
                  );
                })}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Heading font</p>
                  <p className="mt-1 text-[13px] text-slate-200">{String(heading.font || "—")}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Body font</p>
                  <p className="mt-1 text-[13px] text-slate-200">{String(body.font || "—")}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-end gap-4">
                {iconSvg ? (
                  <div
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 p-1 [&_svg]:h-full [&_svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: iconSvg }}
                  />
                ) : null}
                {logoSvg ? (
                  <div
                    className="max-h-24 max-w-[200px] overflow-hidden [&_svg]:max-h-24 [&_svg]:w-auto"
                    dangerouslySetInnerHTML={{ __html: logoSvg }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "colors" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {palette.map((sw, i) => {
              const hx = typeof sw.hex === "string" ? sw.hex : "#000000";
              const { rgbStr, hslStr } = hexToRgbHsl(hx);
              const name = typeof sw.name === "string" ? sw.name : `Swatch ${i + 1}`;
              const usage = typeof sw.usage === "string" ? sw.usage : "";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(hx);
                      showToast("Copied!");
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/40 text-left ring-1 ring-white/[0.04] transition hover:border-purple-500/35 hover:ring-purple-500/20"
                >
                  <div className="h-28 w-full border-b border-white/[0.06]" style={{ backgroundColor: hx }} />
                  <div className="space-y-1 px-4 py-3">
                    <p className="text-[13px] font-semibold text-slate-100">{name}</p>
                    <p className="font-mono text-[12px] text-purple-200/95">{hx}</p>
                    <p className="text-[11px] text-slate-500">{rgbStr}</p>
                    <p className="text-[11px] text-slate-500">{hslStr}</p>
                    {usage ? <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{usage}</p> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {tab === "typography" ? (
          <div className="space-y-6">
            {[
              { label: "Heading", spec: heading },
              { label: "Body", spec: body },
              { label: "Accent", spec: accent },
            ].map((row) => {
              const font = String(row.spec.font || "").trim() || "Inter";
              const weight = String(row.spec.weight || "400");
              const usage = String(row.spec.usage || "");
              const href = googleFontsHref(font);
              return (
                <div
                  key={row.label}
                  className="rounded-xl border border-white/[0.08] bg-slate-900/35 px-4 py-4 ring-1 ring-white/[0.04]"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300/85">{row.label}</p>
                  <p className="mt-1 text-[13px] text-slate-300">
                    <span className="font-semibold text-slate-100">{font}</span>
                    <span className="text-slate-600"> · </span>
                    weight {weight}
                  </p>
                  {usage ? <p className="mt-2 text-[12px] text-slate-500">{usage}</p> : null}
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex text-[12px] font-medium text-fuchsia-300/95 underline-offset-2 hover:text-fuchsia-200"
                    >
                      Google Fonts →
                    </a>
                  ) : null}
                  <p
                    className="mt-4 text-2xl font-semibold leading-tight text-slate-100"
                    style={{ fontFamily: `"${font}", ui-sans-serif, system-ui` }}
                  >
                    {previewName}
                  </p>
                  <p
                    className="mt-2 text-sm leading-relaxed text-slate-400"
                    style={{ fontFamily: `"${font}", ui-sans-serif, system-ui`, fontWeight: Number(weight) || 400 }}
                  >
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "logo" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLogoBg("dark")}
                className={[
                  "rounded-lg border px-3 py-1.5 text-[12px] font-semibold",
                  logoBg === "dark"
                    ? "border-purple-500/50 bg-purple-500/20 text-purple-50"
                    : "border-slate-600 bg-slate-900/50 text-slate-400",
                ].join(" ")}
              >
                Dark bg
              </button>
              <button
                type="button"
                onClick={() => setLogoBg("light")}
                className={[
                  "rounded-lg border px-3 py-1.5 text-[12px] font-semibold",
                  logoBg === "light"
                    ? "border-purple-500/50 bg-purple-500/20 text-purple-50"
                    : "border-slate-600 bg-slate-900/50 text-slate-400",
                ].join(" ")}
              >
                Light bg
              </button>
            </div>
            <div className={`flex flex-wrap items-start gap-6 rounded-2xl border p-6 ${logoBgClass}`}>
              {logoSvg ? (
                <div
                  className="max-w-full flex-1 min-w-[200px] [&_svg]:max-h-[220px] [&_svg]:w-auto"
                  dangerouslySetInnerHTML={{ __html: logoSvg }}
                />
              ) : (
                <p className="text-sm text-slate-500">No primary logo SVG.</p>
              )}
              {iconSvg ? (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="h-24 w-24 overflow-hidden rounded-xl border border-white/10 p-2 [&_svg]:h-full [&_svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: iconSvg }}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Icon</span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadSvg(logoSvg, `${title}_logo`)}
                className="rounded-lg border border-purple-500/45 bg-purple-500/15 px-4 py-2 text-[12px] font-semibold text-purple-50 hover:bg-purple-500/25"
              >
                Download SVG
              </button>
              <button
                type="button"
                onClick={() => void downloadLogoPng()}
                className="rounded-lg border border-fuchsia-500/45 bg-fuchsia-500/15 px-4 py-2 text-[12px] font-semibold text-fuchsia-50 hover:bg-fuchsia-500/25"
              >
                Download PNG
              </button>
            </div>
          </div>
        ) : null}

        {tab === "guidelines" ? (
          <div className="mx-auto max-w-2xl space-y-8 pb-8">
            {storyItems.length ? (
              <section>
                <h3 className="font-serif text-xl text-slate-100">Brand Story</h3>
                <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-slate-300">
                  {storyItems.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </section>
            ) : null}
            {sectionMeta
              .filter((s) => s.key !== "brand_story")
              .map((sec) => {
                const items = normalizeBulletList(sec.field);
                if (!items.length) return null;
                return (
                  <section key={sec.key}>
                    <h3 className="font-serif text-xl text-slate-100">{sec.title}</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-slate-300">
                      {items.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </section>
                );
              })}
          </div>
        ) : null}

        {tab === "export" ? (
          <div className="mx-auto max-w-md space-y-4">
            <button
              type="button"
              onClick={() => void copyCss()}
              className="w-full rounded-xl border border-purple-500/45 bg-gradient-to-r from-purple-500/25 to-pink-500/20 px-4 py-3 text-[13px] font-bold text-purple-50 shadow-lg shadow-purple-950/30 hover:from-purple-500/35 hover:to-pink-500/30"
            >
              Copy CSS Variables
            </button>
            <button
              type="button"
              onClick={() => downloadSvg(logoSvg, `${title}_logo`)}
              className="w-full rounded-xl border border-white/[0.1] bg-slate-900/60 px-4 py-3 text-[13px] font-semibold text-slate-100 hover:border-purple-500/35"
            >
              Download SVG Logo
            </button>
            <button
              type="button"
              onClick={() => void downloadLogoPng()}
              className="w-full rounded-xl border border-white/[0.1] bg-slate-900/60 px-4 py-3 text-[13px] font-semibold text-slate-100 hover:border-purple-500/35"
            >
              Download PNG Logo
            </button>
            <button
              type="button"
              onClick={() => downloadSvg(iconSvg, `${title}_icon`)}
              className="w-full rounded-xl border border-white/[0.1] bg-slate-900/60 px-4 py-3 text-[13px] font-semibold text-slate-100 hover:border-purple-500/35"
            >
              Download Icon SVG
            </button>
            <p className="rounded-lg border border-dashed border-slate-600/80 bg-slate-950/50 px-3 py-2 text-center text-[12px] text-slate-500">
              PDF Brand Book — coming soon
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
});

export default DesignAgentCanvas;
