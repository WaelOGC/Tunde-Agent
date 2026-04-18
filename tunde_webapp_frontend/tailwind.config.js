/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        tunde: {
          bg: "#0c0c0f",
          surface: "#131316",
          accent: "#7c3aed",
          accentHover: "#6d28d9",
          success: "#10b981",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
