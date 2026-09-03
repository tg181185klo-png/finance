import type { Config } from "tailwindcss";

/** Theme-aware zinc: inverted under html[data-theme="light"] via CSS vars */
const zinc = {
  50: "rgb(var(--z-50) / <alpha-value>)",
  100: "rgb(var(--z-100) / <alpha-value>)",
  200: "rgb(var(--z-200) / <alpha-value>)",
  300: "rgb(var(--z-300) / <alpha-value>)",
  400: "rgb(var(--z-400) / <alpha-value>)",
  500: "rgb(var(--z-500) / <alpha-value>)",
  600: "rgb(var(--z-600) / <alpha-value>)",
  700: "rgb(var(--z-700) / <alpha-value>)",
  800: "rgb(var(--z-800) / <alpha-value>)",
  900: "rgb(var(--z-900) / <alpha-value>)",
  950: "rgb(var(--z-950) / <alpha-value>)",
};

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { zinc },
    },
  },
  plugins: [],
};

export default config;
