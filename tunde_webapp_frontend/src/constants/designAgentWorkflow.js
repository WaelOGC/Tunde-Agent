/** Design Agent wizard — steps and selectable options (spec §2). */

export const DESIGN_STEPS = [
  {
    id: "business",
    title: "Business Info",
    hint: "Brand name, industry, and one-line description",
  },
  {
    id: "audience_tone",
    title: "Audience & Tone",
    hint: "Who you serve and the voice you want",
  },
  {
    id: "style",
    title: "Style Preferences",
    hint: "Color mood and logo direction",
  },
  {
    id: "confirm",
    title: "Confirm & Generate",
    hint: "Review and generate your brand pack",
  },
];

export const TONE_OPTIONS = [
  "Minimal",
  "Bold",
  "Elegant",
  "Playful",
  "Corporate",
  "Futuristic",
  "Natural",
  "Retro",
];

export const COLOR_MOOD_OPTIONS = [
  "Dark & Dramatic",
  "Light & Clean",
  "Warm & Earthy",
  "Cool & Professional",
  "Vibrant & Energetic",
  "Pastel & Soft",
];

export const LOGO_STYLE_OPTIONS = ["Wordmark", "Lettermark", "Abstract", "Geometric"];

export const INDUSTRY_OPTIONS = ["Tech", "Food", "Fashion", "Health", "Finance", "Education", "Other"];
