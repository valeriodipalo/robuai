import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d0a12",
        "ink-2": "#141019",
        plum: "#1d1626",
        card: "#1a1422",
        ember: { 1: "#ff6a5b", 2: "#ffae5c" },
        rose: "#ff8fa3",
        ok: "#76e3b0",
        muted: "#a99fab",
        faint: "#6f6675",
      },
      fontFamily: {
        display: ["var(--font-display)", "Fraunces", "serif"],
        body: ["var(--font-body)", "Hanken Grotesk", "sans-serif"],
      },
      boxShadow: {
        ember: "0 16px 34px -14px rgba(255,106,91,.35)",
      },
    },
  },
  plugins: [],
};

export default config;
