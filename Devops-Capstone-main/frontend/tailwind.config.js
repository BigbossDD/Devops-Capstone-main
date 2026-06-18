/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      colors: {
        // Single sparse accent — used only for primary actions and focus states.
        brand: {
          50: "#f0f1fc",
          100: "#e1e3fa",
          200: "#c3c7f5",
          300: "#9ba1ec",
          400: "#7c84e2",
          500: "#5e6ad2",
          600: "#4853c4",
          700: "#3a44a0",
          800: "#2f3680",
          900: "#262c66",
        },
        // Monochrome neutral scale (zinc) — the base of the whole UI.
        ink: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
      },
      boxShadow: {
        // Flat by default — borders carry surfaces, shadows only appear on hover/lift.
        soft: "0 1px 2px 0 rgb(0 0 0 / 0.03)",
        card: "0 1px 2px 0 rgb(0 0 0 / 0.02)",
        lifted: "0 8px 24px -8px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.06)",
      },
      borderRadius: {
        xl2: "0.625rem",
      },
      letterSpacing: {
        tightish: "-0.015em",
      },
    },
  },
  plugins: [],
};
