// tunde_webapp_frontend/src/constants/uiuxWorkflow.js

export const UIUX_STEPS = [
    {
      id: 1,
      title: "Product Info",
      hint: "Product name, type, and description",
    },
    {
      id: 2,
      title: "Platform & Style",
      hint: "Target platform and visual style",
    },
    {
      id: 3,
      title: "Screens & Components",
      hint: "Choose what to include in the prototype",
    },
    {
      id: 4,
      title: "Confirm & Generate",
      hint: "Review your choices and generate the prototype",
    },
  ];
  
  export const PRODUCT_TYPE_OPTIONS = [
    "Dashboard",
    "Mobile App",
    "SaaS Product",
    "Admin Panel",
    "E-commerce",
    "Landing Page UI Kit",
  ];
  
  export const INDUSTRY_OPTIONS = [
    "Tech",
    "Finance",
    "Health",
    "Education",
    "E-commerce",
    "Marketing",
    "Real Estate",
    "Other",
  ];
  
  export const PLATFORM_OPTIONS = [
    "Web App",
    "Mobile (iOS)",
    "Mobile (Android)",
    "Desktop App",
    "Tablet",
  ];
  
  export const UI_STYLE_OPTIONS = [
    "Modern Minimal",
    "Bold & Colorful",
    "Corporate & Clean",
    "Dark Mode",
    "Glassmorphism",
    "Neumorphism",
  ];
  
  export const COLOR_THEME_OPTIONS = [
    "Purple & Dark",
    "Blue & White",
    "Green & Light",
    "Orange & Warm",
    "Monochrome",
    "Custom Gradient",
  ];
  
  export const SCREEN_OPTIONS_BY_TYPE = {
    Dashboard:   ["Overview", "Analytics", "Users", "Reports", "Settings", "Notifications"],
    "Mobile App": ["Onboarding", "Home", "Profile", "Feed", "Explore", "Checkout"],
    "SaaS Product": ["Landing", "Features", "Pricing", "Login", "Dashboard", "Settings"],
    "Admin Panel": ["Dashboard", "Users Table", "Data Table", "Logs", "Settings", "Reports"],
    "E-commerce": ["Product Grid", "Product Detail", "Cart", "Checkout", "Profile", "Orders"],
    "Landing Page UI Kit": ["Hero", "Features", "Pricing", "Testimonials", "FAQ", "CTA"],
  };
  
  export const COMPONENT_OPTIONS = [
    "Navigation Bar",
    "Sidebar",
    "Stat Cards",
    "Data Table",
    "Charts",
    "Modal",
    "Form",
    "Buttons",
    "Search Bar",
    "Notifications",
    "Avatar",
    "Breadcrumbs",
  ];
  
  export const PRIMARY_ACTION_OPTIONS = [
    "Get Started",
    "Sign Up Free",
    "Book a Demo",
    "View Dashboard",
    "Add to Cart",
    "Contact Sales",
  ];
  
  export const INITIAL_FORM = {
    product_name:   "",
    product_type:   "Dashboard",
    industry:       "Tech",
    description:    "",
    platform:       "Web App",
    ui_style:       "",
    color_theme:    "",
    screens:        ["Overview", "Analytics", "Settings"],
    components:     ["Navigation Bar", "Stat Cards", "Data Table"],
    primary_action: "Get Started",
  };