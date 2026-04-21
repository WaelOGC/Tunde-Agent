// tunde_webapp_frontend/src/components/ArchitectureCanvas.jsx
import { useState } from "react";
import { GRADE_COLORS, RATING_COLORS } from "../constants/architectureWorkflow";

const TABS = ["3D View", "Sustainability", "Materials", "Assessment", "Export"];

export default function ArchitectureCanvas({ project, onClose }) {
  const [activeTab, setActiveTab] = useState("3D View");
  const [copied, setCopied] = useState(false);

  if (!project) return null;

  const {
    project_name, building_type, style, structure_type,
    facade_material, roof_type, total_area, floors,
    location_climate, sustainability, materials_report,
    disaster_assessment, threejs_code, created_at,
  } = project;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadGLTF = () => {
    alert("GLTF export: Install THREE.GLTFExporter in production build.\nFor now, download the Three.js code and import to Blender via the Three.js add-on.");
  };

  const downloadOBJ = () => {
    alert("OBJ export: Install THREE.OBJExporter in production build.\nFor now, download the Three.js code and use online converters.");
  };

  const downloadCode = () => {
    downloadFile(
      threejs_code,
      `${project_name.replace(/\s+/g, "_")}_3d.js`,
      "text/javascript"
    );
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  };

  // ── Tab button ────────────────────────────────────────────────────────────
  const TabBtn = ({ label }) => (
    <button
      onClick={() => setActiveTab(label)}
      className={`px-3 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
        activeTab === label
          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {label}
    </button>
  );

  // ── Grade badge ───────────────────────────────────────────────────────────
  const GradeBadge = ({ grade, size = "normal" }) => {
    const color = GRADE_COLORS[grade] || "#6b7280";
    return (
      <span
        style={{
          background: color + "22",
          color,
          border: `1px solid ${color}55`,
          padding: size === "large" ? "8px 20px" : "2px 8px",
          borderRadius: "8px",
          fontSize: size === "large" ? "28px" : "12px",
          fontWeight: "700",
        }}
      >
        {grade}
      </span>
    );
  };

  // ── Rating badge ──────────────────────────────────────────────────────────
  const RatingBadge = ({ rating }) => {
    const color = RATING_COLORS[rating] || "#6b7280";
    return (
      <span
        style={{
          background: color + "22",
          color,
          border: `1px solid ${color}55`,
          padding: "3px 10px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: "600",
        }}
      >
        {rating}
      </span>
    );
  };

  // ── Score bar ─────────────────────────────────────────────────────────────
  const ScoreBar = ({ label, value, max = 100, color = "#f59e0b" }) => (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-medium">{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${(value / max) * 100}%`, background: color }}
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#060b14" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b border-white/8 shrink-0"
        style={{ background: "#0a0f1a" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏛️</span>
          <div>
            <h2 className="text-white font-bold text-base leading-tight">
              {project_name}
            </h2>
            <p className="text-gray-500 text-xs">
              {building_type} · {style} · {location_climate} · {total_area}m² · {floors} floors
            </p>
          </div>
        </div>

        <div className="flex gap-1 bg-white/5 rounded-xl p-1 overflow-x-auto">
          {TABS.map((t) => <TabBtn key={t} label={t} />)}
        </div>

        <button
          onClick={onClose}
          className="ml-4 text-gray-500 hover:text-white text-xl leading-none transition"
        >
          ×
        </button>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">

        {activeTab === "3D View" && (
          <div style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            textAlign: "center",
          }}
          >
            <span style={{ fontSize: "64px" }}>🏛️</span>
            <h3 style={{
              color: "white",
              fontWeight: "600",
              fontSize: "20px",
            }}
            >
              3D Visualization Coming Soon
            </h3>
            <p style={{
              color: "#6b7280",
              fontSize: "14px",
              maxWidth: "360px",
              lineHeight: "1.6",
            }}
            >
              We are integrating professional 3D rendering
              for architects. For now, download the project
              file to view in Blender or your preferred
              3D software.
            </p>
            <button
              type="button"
              onClick={downloadCode}
              style={{
                padding: "10px 24px",
                borderRadius: "10px",
                background: "linear-gradient(to right, #f59e0b, #f97316)",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
                marginTop: "8px",
              }}
            >
              Download Three.js File
            </button>
          </div>
        )}

        {/* Sustainability */}
        {activeTab === "Sustainability" && (
          <div className="h-full overflow-auto p-8">
            <div className="max-w-2xl mx-auto">

              {/* Overall grade */}
              <div
                className="rounded-2xl p-6 mb-6 flex items-center justify-between"
                style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div>
                  <p className="text-gray-500 text-sm mb-1">Overall Sustainability Score</p>
                  <GradeBadge grade={sustainability?.overall_grade || "C"} size="large" />
                  <p className="text-gray-400 text-xs mt-2">
                    Climate: {sustainability?.climate_rating || "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 text-xs mb-3">Energy Rating</p>
                  <div
                    style={{
                      fontSize: "36px",
                      fontWeight: "700",
                      color: GRADE_COLORS[sustainability?.energy_rating] || "#6b7280",
                    }}
                  >
                    {sustainability?.energy_rating || "C"}
                  </div>
                </div>
              </div>

              {/* Score bars */}
              <div
                className="rounded-xl p-5 mb-6"
                style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p className="text-white font-semibold text-sm mb-4">Metrics</p>
                <ScoreBar label="Carbon Efficiency" value={sustainability?.carbon_score || 65} color="#10b981" />
                <ScoreBar label="Natural Light"     value={sustainability?.light_score  || 70} color="#f59e0b" />
              </div>

              {/* Recommendations */}
              {sustainability?.recommendations?.length > 0 && (
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <p className="text-white font-semibold text-sm mb-3">
                    🌱 Recommendations
                  </p>
                  <div className="space-y-2">
                    {sustainability.recommendations.map((r, i) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="text-amber-400 shrink-0">→</span>
                        <span className="text-gray-300">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Materials */}
        {activeTab === "Materials" && (
          <div className="h-full overflow-auto p-8">
            <div className="max-w-3xl mx-auto">
              <h3 className="text-white font-bold text-lg mb-4">Materials Report</h3>

              <div
                className="rounded-xl overflow-hidden mb-4"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#0d1117" }}>
                      {["Material", "Quantity", "Cost Range", "CO₂ (tons)", "Eco Alternative"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-gray-400 text-xs font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {materials_report?.items?.map((item, i) => (
                      <tr
                        key={i}
                        style={{
                          background: i % 2 === 0 ? "#0a0f1a" : "#0d1117",
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <td className="px-4 py-3 text-white font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-gray-300">{item.quantity_m2} m²</td>
                        <td className="px-4 py-3 text-gray-300">{item.cost_range}</td>
                        <td className="px-4 py-3">
                          <span className={item.co2_tons < 0 ? "text-green-400" : "text-amber-400"}>
                            {item.co2_tons < 0 ? "−" : "+"}{Math.abs(item.co2_tons)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs italic">
                          {item.eco_alternative}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-gray-600 text-xs">
                * Cost ranges are industry averages — not contractor quotes.
                CO₂ values are estimates; negative values indicate carbon sequestration.
              </p>
            </div>
          </div>
        )}

        {/* Assessment */}
        {activeTab === "Assessment" && (
          <div className="h-full overflow-auto p-8">
            <div className="max-w-2xl mx-auto">

              {/* Disclaimer */}
              <div
                className="rounded-xl p-4 mb-6 flex gap-3"
                style={{ background: "#1c0a00", border: "1px solid rgba(249,115,22,0.3)" }}
              >
                <span className="text-orange-400 text-lg shrink-0">⚠️</span>
                <p className="text-orange-300 text-xs leading-relaxed">
                  {disaster_assessment?.disclaimer ||
                    "Indicative only — consult a licensed structural engineer for real projects."}
                </p>
              </div>

              {/* Ratings */}
              <div className="grid grid-cols-1 gap-4 mb-6">
                {[
                  {
                    icon: "🌍",
                    label: "Earthquake Resistance",
                    rating: disaster_assessment?.earthquake_rating || "Moderate",
                    note: "Based on structure type and building configuration",
                  },
                  {
                    icon: "💨",
                    label: "Wind Resistance",
                    rating: disaster_assessment?.wind_rating || "Good",
                    note: "Based on building form and structural system",
                  },
                  {
                    icon: "🌊",
                    label: "Flood Considerations",
                    rating: null,
                    note: disaster_assessment?.flood_considerations || "Consider local flood risk",
                  },
                ].map(({ icon, label, rating, note }) => (
                  <div
                    key={label}
                    className="rounded-xl p-4 flex items-start gap-4"
                    style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <span className="text-2xl">{icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="text-white font-medium text-sm">{label}</p>
                        {rating && <RatingBadge rating={rating} />}
                      </div>
                      <p className="text-gray-500 text-xs">{note}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recommendations */}
              {disaster_assessment?.recommendations?.length > 0 && (
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <p className="text-white font-semibold text-sm mb-3">Recommendations</p>
                  <div className="space-y-2">
                    {disaster_assessment.recommendations.map((r, i) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="text-amber-400 shrink-0">→</span>
                        <span className="text-gray-300">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Export */}
        {activeTab === "Export" && (
          <div className="h-full overflow-auto p-8">
            <h3 className="text-white font-bold text-lg mb-6">Export Options</h3>
            <div className="grid grid-cols-1 gap-4 max-w-lg">

              {[
                {
                  icon: "🎮",
                  title: "Three.js Scene Code",
                  desc: "JavaScript file — open in browser or import to Three.js projects",
                  action: downloadCode,
                  label: "Download .js",
                  primary: true,
                },
                {
                  icon: "🎨",
                  title: "GLTF / GLB (Blender)",
                  desc: "3D model for Blender, Unity, Unreal Engine",
                  action: downloadGLTF,
                  label: "Download GLTF",
                  primary: false,
                  soon: true,
                },
                {
                  icon: "📐",
                  title: "OBJ (AutoCAD / SketchUp)",
                  desc: "Universal 3D format for CAD software",
                  action: downloadOBJ,
                  label: "Download OBJ",
                  primary: false,
                  soon: true,
                },
                {
                  icon: "📋",
                  title: "Copy Three.js Code",
                  desc: "Paste directly into your project",
                  action: () => copyToClipboard(threejs_code),
                  label: copied ? "✓ Copied!" : "Copy",
                  primary: false,
                },
              ].map(({ icon, title, desc, action, label, primary, soon }) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/10 p-5 flex items-center justify-between"
                  style={{ background: "#0d1117" }}
                >
                  <div className="flex gap-3 items-start">
                    <span className="text-xl">{icon}</span>
                    <div>
                      <p className="text-white font-semibold text-sm flex items-center gap-2">
                        {title}
                        {soon && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                            Coming Soon
                          </span>
                        )}
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={action}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition ml-4 shrink-0
                      ${primary
                        ? "text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90"
                        : "border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                      }`}
                  >
                    {label}
                  </button>
                </div>
              ))}

              {/* Project info */}
              <div
                className="rounded-xl border border-white/5 p-5 mt-2"
                style={{ background: "#0a0f1a" }}
              >
                <p className="text-gray-600 text-xs uppercase tracking-wider mb-3">Project info</p>
                {[
                  ["Project",   project_name],
                  ["Type",      building_type],
                  ["Style",     style],
                  ["Structure", structure_type],
                  ["Facade",    facade_material],
                  ["Roof",      roof_type],
                  ["Area",      `${total_area} m²`],
                  ["Floors",    `${floors}`],
                  ["Climate",   location_climate],
                  ["Generated", created_at ? new Date(created_at).toLocaleString() : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-xs mb-1.5">
                    <span className="text-gray-600 w-20 shrink-0">{k}</span>
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
