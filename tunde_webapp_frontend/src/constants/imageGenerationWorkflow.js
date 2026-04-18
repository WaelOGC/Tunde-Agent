/**
 * Interactive image generation wizard — style & aspect presets (UI + API payload).
 * "comic_book" reserved for future text-to-comic pipeline.
 */

export const IMAGE_STYLES = [
  { id: "realistic_photo", label: "Realistic Photo", short: "Photo-real" },
  { id: "digital_illustration", label: "Digital Illustration", short: "Digital art" },
  { id: "cinematic_scene", label: "Cinematic Scene", short: "Cinematic" },
  { id: "surreal_fantasy", label: "Surreal / Fantasy Art", short: "Fantasy" },
  { id: "anime_manga", label: "Anime / Manga Style", short: "Anime" },
  {
    id: "comic_book",
    label: "Comic Book Style",
    short: "Comic",
    note: "text-to-comic ready",
  },
  { id: "watercolor", label: "Watercolor Painting", short: "Watercolor" },
  { id: "pencil_sketch", label: "Pencil Sketch", short: "Sketch" },
  { id: "abstract_art", label: "Abstract Art", short: "Abstract" },
  { id: "ui_ux_prototype", label: "UI/UX Prototype Layout", short: "UI mock" },
];

export const ASPECT_RATIOS = [
  { id: "1_1", label: "1:1 (Square)", ratio: "1:1" },
  { id: "16_9", label: "16:9 (Landscape · Desktop/TV)", ratio: "16:9" },
  { id: "9_16", label: "9:16 (Portrait · Stories/Reels)", ratio: "9:16" },
  { id: "4_3", label: "4:3 (Classic TV)", ratio: "4:3" },
  { id: "3_4", label: "3:4 (Portrait · Classic)", ratio: "3:4" },
  { id: "21_9", label: "21:9 (Ultrawide)", ratio: "21:9" },
];

/** Accent classes per style button (Tailwind) — vibrant but readable on dark UI */
export const STYLE_BUTTON_ACCENTS = [
  "from-amber-500/25 to-orange-600/20 border-amber-500/40 hover:border-amber-400/70 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)]",
  "from-violet-500/25 to-fuchsia-600/20 border-violet-500/40 hover:border-violet-400/70 hover:shadow-[0_0_20px_rgba(167,139,250,0.15)]",
  "from-rose-500/25 to-red-600/20 border-rose-500/40 hover:border-rose-400/70 hover:shadow-[0_0_20px_rgba(251,113,133,0.15)]",
  "from-indigo-500/25 to-blue-600/20 border-indigo-500/40 hover:border-indigo-400/70 hover:shadow-[0_0_20px_rgba(129,140,248,0.15)]",
  "from-pink-500/25 to-rose-600/20 border-pink-500/40 hover:border-pink-400/70 hover:shadow-[0_0_20px_rgba(244,114,182,0.15)]",
  "from-yellow-400/20 to-amber-600/25 border-yellow-500/45 hover:border-yellow-400/80 hover:shadow-[0_0_20px_rgba(250,204,21,0.18)]",
  "from-sky-500/25 to-cyan-600/20 border-sky-500/40 hover:border-sky-400/70 hover:shadow-[0_0_20px_rgba(56,189,248,0.15)]",
  "from-slate-400/20 to-slate-600/25 border-slate-500/45 hover:border-slate-400/70 hover:shadow-[0_0_16px_rgba(148,163,184,0.12)]",
  "from-teal-500/25 to-emerald-600/20 border-teal-500/40 hover:border-teal-400/70 hover:shadow-[0_0_20px_rgba(45,212,191,0.15)]",
  "from-emerald-500/25 to-green-600/20 border-emerald-500/40 hover:border-emerald-400/70 hover:shadow-[0_0_20px_rgba(52,211,153,0.15)]",
];

export const RATIO_BUTTON_ACCENTS = [
  "border-cyan-500/40 bg-gradient-to-br from-cyan-500/15 to-slate-900/40 hover:border-cyan-400/70",
  "border-blue-500/40 bg-gradient-to-br from-blue-500/15 to-slate-900/40 hover:border-blue-400/70",
  "border-purple-500/40 bg-gradient-to-br from-purple-500/15 to-slate-900/40 hover:border-purple-400/70",
  "border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-slate-900/40 hover:border-amber-400/70",
  "border-orange-500/40 bg-gradient-to-br from-orange-500/15 to-slate-900/40 hover:border-orange-400/70",
  "border-lime-500/40 bg-gradient-to-br from-lime-500/15 to-slate-900/40 hover:border-lime-400/70",
];
