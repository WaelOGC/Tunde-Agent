// tunde_webapp_frontend/src/constants/architectureWorkflow.js

export const ARCHITECTURE_STEPS = [
    {
      id: 1,
      title: "Building Info",
      hint: "Building type, project name, and climate",
    },
    {
      id: 2,
      title: "Dimensions & Layout",
      hint: "Area, floors, and spaces to include",
    },
    {
      id: 3,
      title: "Style & Materials",
      hint: "Architectural style, structure, and facade",
    },
    {
      id: 4,
      title: "Confirm & Generate",
      hint: "Review your choices and generate the 3D model",
    },
  ];
  
  export const BUILDING_TYPE_OPTIONS = [
    "Villa",
    "Apartment",
    "Office",
    "Hotel",
    "School",
    "Hospital",
    "Retail",
    "Other",
  ];
  
  export const CLIMATE_OPTIONS = [
    "Hot & Dry",
    "Hot & Humid",
    "Mediterranean",
    "Temperate",
    "Cold",
    "Tropical",
  ];
  
  export const ROOM_OPTIONS = [
    "Living Room",
    "Bedroom",
    "Kitchen",
    "Bathroom",
    "Office",
    "Hall",
    "Garage",
    "Garden",
    "Pool",
    "Lobby",
    "Conference Room",
    "Other",
  ];
  
  export const STYLE_OPTIONS = [
    "Modern",
    "Minimalist",
    "Classical",
    "Contemporary",
    "Industrial",
    "Mediterranean",
    "Sustainable",
    "Futuristic",
  ];
  
  export const STRUCTURE_OPTIONS = [
    "Reinforced Concrete",
    "Steel Frame",
    "Cross-Laminated Timber",
    "Masonry",
    "Mixed",
  ];
  
  export const FACADE_OPTIONS = [
    "Glass",
    "Concrete",
    "Wood",
    "Stone",
    "Brick",
    "Metal Panels",
    "Green Wall",
  ];
  
  export const ROOF_OPTIONS = [
    "Flat",
    "Pitched",
    "Green Roof",
    "Solar Panels",
    "Dome",
    "Mixed",
  ];
  
  // Sustainability grade colors
  export const GRADE_COLORS = {
    "A+": "#059669",
    "A":  "#10b981",
    "B+": "#34d399",
    "B":  "#6ee7b7",
    "C+": "#fbbf24",
    "C":  "#f59e0b",
    "D":  "#f97316",
    "F":  "#ef4444",
  };
  
  // Disaster rating colors
  export const RATING_COLORS = {
    Excellent: "#059669",
    Good:      "#10b981",
    Moderate:  "#f59e0b",
    Poor:      "#ef4444",
  };
  
  export const INITIAL_FORM = {
    project_name:         "",
    building_type:        "Villa",
    description:          "",
    location_climate:     "Mediterranean",
    total_area:           200,
    floors:               2,
    floor_height:         3,
    rooms:                ["Living Room", "Bedroom", "Kitchen", "Bathroom"],
    special_requirements: "",
    style:                "",
    structure_type:       "",
    facade_material:      "",
    roof_type:            "",
  };