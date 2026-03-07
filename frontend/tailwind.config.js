/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6",
        "primary-hover": "#2563eb",
        "bg-app": "#F5F7F8",
        "bg-card": "#FFFFFF",
        "bg-surface": "#F8F9FC",
        "text-main": "#0d131c",
        "text-muted": "#49699c",
        "border-col": "#E7ECF4",
        "border-input": "#CED8E8",
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)",
        "card-hover": "0 10px 15px -3px rgba(0,0,0,0.07), 0 4px 6px -2px rgba(0,0,0,0.03)",
      },
    },
  },
  plugins: [],
};
