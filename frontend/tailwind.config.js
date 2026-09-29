/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Premium Dark Creator Studio palette. Named by role, not by hue
        // family, so usage sites read as intent ("bg-surface-raised") not
        // arbitrary color picks.
        base: "#05070D",
        surface: "#0B0F1A",
        "surface-raised": "#121828",
        "surface-hover": "#171E31",
        border: {
          DEFAULT: "#1E2536",
          strong: "#2A3349",
        },
        ink: {
          primary: "#F3F5FA",
          secondary: "#8B93A7",
          muted: "#5B6478",
        },
        indigo: {
          50: "#EEF0FE",
          100: "#DCE0FD",
          300: "#A9B3FA",
          400: "#7C89F7",
          500: "#5B6EF5",
          600: "#4451DE",
          700: "#343EB0",
        },
        violet: {
          300: "#C9AFFF",
          400: "#B389FF",
          500: "#9B6BFF",
          600: "#7F4FE0",
        },
        cyan: {
          400: "#5CE6F0",
          500: "#34D9E8",
        },
        // Status colors stay outside the brand accent family entirely, so
        // they're the only saturated signal on a project list.
        status: {
          draft: "#5B6478",
          progress: "#E8A23D",
          ready: "#3DD68C",
          published: "#9B6BFF",
          failed: "#F0556B",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 20px 40px -24px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(91,110,245,0.4), 0 0 32px -4px rgba(91,110,245,0.55)",
      },
      backgroundImage: {
        "aurora": "radial-gradient(80% 60% at 15% 0%, rgba(91,110,245,0.18) 0%, rgba(91,110,245,0) 60%), radial-gradient(60% 50% at 85% 10%, rgba(155,107,255,0.14) 0%, rgba(155,107,255,0) 60%)",
      },
    },
  },
  darkMode: "class",
  plugins: [],
};
