// tunde_webapp_frontend/src/constants/webPageDesignerWorkflow.js

export const WEB_PAGE_STEPS = [
    {
      id: 1,
      title: "Business Info",
      hint: "Business name, industry, and description",
    },
    {
      id: 2,
      title: "Audience & Style",
      hint: "Who is the page for and what style fits best",
    },
    {
      id: 3,
      title: "Page Structure",
      hint: "Choose sections and color scheme",
    },
    {
      id: 4,
      title: "Confirm & Generate",
      hint: "Review your choices and generate the page",
    },
  ];
  
  export const INDUSTRY_OPTIONS = [
    "Tech",
    "Food",
    "Fashion",
    "Health",
    "Finance",
    "Education",
    "Real Estate",
    "Other",
  ];
  
  export const PAGE_STYLE_OPTIONS = [
    "Modern Minimal",
    "Bold & Vibrant",
    "Elegant & Luxury",
    "Corporate & Professional",
    "Playful & Creative",
    "Futuristic & Dark",
  ];
  
  export const COLOR_SCHEME_OPTIONS = [
    "Dark",
    "Light",
    "Warm Tones",
    "Cool Tones",
    "Monochrome",
    "Gradient Pop",
  ];
  
  export const SECTION_OPTIONS = [
    "Hero",
    "Features",
    "About",
    "Pricing",
    "Testimonials",
    "FAQ",
    "Team",
    "Contact",
    "CTA",
    "Footer",
  ];
  
  export const DEFAULT_SECTIONS = ["Hero", "Features", "About", "CTA"];
  
  export const CTA_PRESETS = [
    "Get Started",
    "Book a Demo",
    "Sign Up Free",
    "Contact Us",
    "Learn More",
    "Try for Free",
  ];
  
  export const INITIAL_FORM = {
    business_name: "",
    industry: "Tech",
    description: "",
    audience: "",
    page_style: "",
    color_scheme: "",
    sections: [...DEFAULT_SECTIONS],
    cta_text: "Get Started",
  };