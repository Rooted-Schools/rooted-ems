import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ── RSF Brand Book v1.0 — Core Palette ── */
        rooted: {
          green: "#81A780",          // Primary brand color
          "green-dark": "#3D6B4E",   // Deep Green — backgrounds, emphasis
          "green-light": "#A8C5A7",  // Lighter shade
          ink: "#111111",            // Body text, headlines
          warm: "#FAF9F7",           // Warm White — page backgrounds
          stone: "#A8A29E",          // Metadata, captions
          /* Legacy aliases */
          gray: "#ECECEC",
          "gray-dark": "#D4D4D4",
          "gray-light": "#F5F5F5",
        },
        /* ── RSF Brand Book — Regional Campus Accents ── */
        campus: {
          vancouver: "#4A8C7F",      // Pacific Teal
          cleveland: "#B45A2B",      // Rust Belt Orange
          neal: "#7B2D3B",           // Carolina Garnet (C.R. Neal — Columbia, SC)
          nola: "#C4A84D",           // NOLA Gold (future)
          indy: "#3B5998",           // Indy Blue (future)
        },
        /* Flat aliases for direct use */
        "deep-green": "#3D6B4E",
        ink: "#111111",
        "warm-white": "#FAF9F7",
        stone: "#A8A29E",
        /* ── UX handoff palette additions — surfaces + semantic ── */
        sunken: "#F2EEE5",             // table headers, chrome, progress track
        line: "#E9E6DE",               // hairlines
        "light-green": "#B5E5BE",      // badges on dark, pills
        "rooted-green-700": "#6E9270", // primary hover
        /* Semantic — distinct from the accent hue */
        warn: "#F3A632",               // needs attention
        "warn-text": "#B57B12",        // accessible warn text on light
        error: "#F3403B",              // inside-72h urgency only
        info: "#486EFF",               // rare
      },
      fontFamily: {
        sans: [
          "Arial",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      lineHeight: {
        body: "1.6",   /* Brand book: minimum 150% leading for body */
      },
    },
  },
  plugins: [],
};

export default config;
