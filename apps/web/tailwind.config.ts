import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rooted: {
          green: "#81A780",
          "green-dark": "#5E8A5D",
          "green-light": "#A8C5A7",
          gray: "#ECECEC",
          "gray-dark": "#D4D4D4",
          "gray-light": "#F5F5F5",
        },
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
    },
  },
  plugins: [],
};

export default config;
