/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter"', "system-ui", "sans-serif"] },
      colors: {
        surface: "rgb(var(--surface) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-2": "rgb(var(--ink-2) / <alpha-value>)",
        "ink-3": "rgb(var(--ink-3) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        s1: "rgb(var(--s1) / <alpha-value>)",
        s2: "rgb(var(--s2) / <alpha-value>)",
        good: "#0ca30c",
        warn: "#fab219",
        serious: "#ec835a",
        critical: "#d03b3b",
      },
    },
  },
  plugins: [],
};
