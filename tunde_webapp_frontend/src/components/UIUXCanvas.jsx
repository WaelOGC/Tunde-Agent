// tunde_webapp_frontend/src/components/UIUXCanvas.jsx
import { useState } from "react";

const TABS = ["Preview", "Code", "Export"];

export default function UIUXCanvas({ prototype, onClose }) {
  const [activeTab, setActiveTab] = useState("Preview");
  const [copied, setCopied] = useState(false);

  if (!prototype) return null;

  const {
    product_name, product_type, platform,
    ui_style, color_theme, screens,
    components, created_at, html_content,
  } = prototype;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  };

  const downloadHtml = () => {
    const blob = new Blob([html_content], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${product_name.replace(/\s+/g, "_")}_prototype.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openInNewTab = () => {
    const blob = new Blob([html_content], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  };

  // ── Tab button ────────────────────────────────────────────────────────────
  const TabBtn = ({ label }) => (
    <button
      onClick={() => setActiveTab(label)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        activeTab === label
          ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#060b14" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b border-white/8 shrink-0"
        style={{ background: "#0a0f1a" }}
      >
        {/* Left */}
        <div className="flex items-center gap-3">
          <span className="text-xl">🖥️</span>
          <div>
            <h2 className="text-white font-bold text-base leading-tight">
              {product_name}
            </h2>
            <p className="text-gray-500 text-xs">
              {product_type} · {platform} · {ui_style}
            </p>
          </div>
        </div>

        {/* Center: tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {TABS.map((t) => <TabBtn key={t} label={t} />)}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <button
            onClick={openInNewTab}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10
                       text-gray-300 hover:text-white hover:border-white/30 transition"
          >
            Open ↗
          </button>
          <button
            onClick={downloadHtml}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white
                       bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition"
          >
            Download HTML
          </button>
          <button
            onClick={onClose}
            className="ml-2 text-gray-500 hover:text-white text-xl leading-none transition"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">

        {/* Preview */}
        {activeTab === "Preview" && (
          <div className="h-full" style={{ background: "#060b14" }}>
            <div style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              textAlign: "center"
            }}>
              <span style={{ fontSize: "48px" }}>🖥️</span>
              <h3 style={{ color: "white", fontWeight: "600", fontSize: "18px" }}>
                In-App Preview Coming Soon
              </h3>
              <p style={{ color: "#6b7280", fontSize: "14px", maxWidth: "320px" }}>
                {`Use "Open ↗" or "Download HTML" to view the full prototype in your browser.`}
              </p>
              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <button onClick={openInNewTab} style={{
                  padding: "8px 18px", borderRadius: "8px",
                  background: "linear-gradient(to right, #a855f7, #ec4899)",
                  color: "white", border: "none", cursor: "pointer",
                  fontSize: "13px", fontWeight: "600"
                }}>Open in Browser ↗</button>
                <button onClick={downloadHtml} style={{
                  padding: "8px 18px", borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent", color: "#d1d5db",
                  cursor: "pointer", fontSize: "13px"
                }}>Download HTML</button>
              </div>
            </div>
          </div>
        )}

        {/* Code */}
        {activeTab === "Code" && (
          <div className="h-full flex flex-col">
            <div
              className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0"
              style={{ background: "#0a0f1a" }}
            >
              <span className="text-xs text-gray-500 font-mono">HTML — self-contained prototype</span>
              <button
                onClick={() => copyToClipboard(html_content)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white
                           bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition"
              >
                {copied ? "✓ Copied!" : "Copy Code"}
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">
                {html_content}
              </pre>
            </div>
          </div>
        )}

        {/* Export */}
        {activeTab === "Export" && (
          <div className="h-full overflow-auto p-8">
            <h3 className="text-white font-bold text-lg mb-6">Export Prototype</h3>
            <div className="grid grid-cols-1 gap-4 max-w-lg">

              {[
                {
                  title: "HTML Prototype File",
                  desc:  "Complete interactive prototype — open in any browser",
                  action: downloadHtml,
                  label: "Download",
                  primary: true,
                },
                {
                  title: "Copy HTML Code",
                  desc:  "Paste into your project or code editor",
                  action: () => copyToClipboard(html_content),
                  label: copied ? "✓ Copied!" : "Copy",
                  primary: false,
                },
                {
                  title: "Preview in Browser",
                  desc:  "Open full-screen in a new tab",
                  action: openInNewTab,
                  label: "Open ↗",
                  primary: false,
                },
              ].map(({ title, desc, action, label, primary }) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/10 p-5 flex items-center justify-between"
                  style={{ background: "#0d1117" }}
                >
                  <div>
                    <p className="text-white font-semibold text-sm">{title}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                  </div>
                  <button
                    onClick={action}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition ml-4 shrink-0
                      ${primary
                        ? "text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                        : "border border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                      }`}
                  >
                    {label}
                  </button>
                </div>
              ))}

              {/* Meta info */}
              <div
                className="rounded-xl border border-white/5 p-5 mt-2"
                style={{ background: "#0a0f1a" }}
              >
                <p className="text-gray-600 text-xs uppercase tracking-wider mb-3">Prototype info</p>
                {[
                  ["Product",    product_name],
                  ["Type",       product_type],
                  ["Platform",   platform],
                  ["UI Style",   ui_style],
                  ["Colors",     color_theme],
                  ["Screens",    screens?.join(", ")],
                  ["Components", components?.join(", ")],
                  ["Generated",  created_at ? new Date(created_at).toLocaleString() : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-xs mb-1.5">
                    <span className="text-gray-600 w-24 shrink-0">{k}</span>
                    <span className="text-gray-300">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
