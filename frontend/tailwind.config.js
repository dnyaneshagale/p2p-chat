/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      // ── Neo Brutalist Palette ─────────────────────────────────────────────
      colors: {
        brut: {
          bg:     "#FFFDF0",   // cream background
          black:  "#0A0A0A",   // near-black
          yellow: "#FFE500",   // brutal yellow
          pink:   "#FF2D78",   // hot pink
          lime:   "#AAFF00",   // acid lime
          cyan:   "#00CFFF",   // electric cyan
          white:  "#FFFFFF",
          gray:   "#F0EDDE",   // slightly darker cream for panels
          border: "#0A0A0A",   // always-black border
        },
      },
      // ── Typography ───────────────────────────────────────────────────────
      fontFamily: {
        sans:  ["'Space Grotesk'", "system-ui", "sans-serif"],
        mono:  ["'Space Mono'", "'Courier New'", "monospace"],
      },
      fontWeight: {
        black: "900",
      },
      // ── Brutal offset box shadows ─────────────────────────────────────────
      boxShadow: {
        brut:   "4px 4px 0px #0A0A0A",
        "brut-lg": "6px 6px 0px #0A0A0A",
        "brut-sm": "2px 2px 0px #0A0A0A",
        "brut-yellow": "4px 4px 0px #FFE500",
        "brut-pink":   "4px 4px 0px #FF2D78",
        "brut-lime":   "4px 4px 0px #AAFF00",
        "brut-inset":  "inset 3px 3px 0px #0A0A0A",
      },
      borderWidth: {
        3: "3px",
      },
      // ── Animations ────────────────────────────────────────────────────────
      animation: {
        "fade-in":  "fadeIn 0.15s ease-in-out",
        "slide-up": "slideUp 0.2s ease-out",
        "glitch":   "glitch 0.3s steps(2) infinite",
        "blink":    "blink 1s step-start infinite",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        slideUp: {
          "0%":   { transform: "translateY(10px)", opacity: 0 },
          "100%": { transform: "translateY(0)",    opacity: 1 },
        },
        glitch: {
          "0%,100%": { transform: "translate(0)" },
          "25%":     { transform: "translate(-2px, 1px)" },
          "75%":     { transform: "translate(2px, -1px)" },
        },
        blink: {
          "0%,100%": { opacity: 1 },
          "50%":     { opacity: 0 },
        },
      },
    },
  },
  plugins: [],
};
