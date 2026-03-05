/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  darkMode: "class",
  theme: {
    // Add xs breakpoint for small phones (iPhone SE = 320px, small Android = 360px)
    screens: {
      xs: "360px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
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
        },
        // ── Midnight Blue dark mode palette ───────────────────────────────
        mid: {
          bg:       "#0D1B2A",   // deepest navy — page background
          nav:      "#091220",   // header / nav bar
          surface:  "#152030",   // cards, button fills
          surface2: "#1B2A3B",   // inputs, hover states
          border:   "#2A3F58",   // subtle border
          text:     "#DDE6F0",   // primary text
          muted:    "#6B90B0",   // secondary / hint text
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
      borderWidth: {
        3: "3px",
      },
      // ── Animations ────────────────────────────────────────────────────────
      animation: {
        "fade-in":  "fadeIn 0.15s ease-in-out",
        "slide-up": "slideUp 0.2s ease-out",
        "blink":    "blink 1s step-start infinite",
        "call-ring-1":       "callRing1 2s ease-out infinite",
        "call-ring-2":       "callRing2 2s ease-out 0.4s infinite",
        "call-ring-3":       "callRing3 2s ease-out 0.8s infinite",
        "call-accept-pulse": "callAcceptPulse 1.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        slideUp: {
          "0%":   { transform: "translateY(10px)", opacity: 0 },
          "100%": { transform: "translateY(0)",    opacity: 1 },
        },
        blink: {
          "0%,100%": { opacity: 1 },
          "50%":     { opacity: 0 },
        },
        callRing1: {
          "0%":   { transform: "scale(1)",   opacity: 0.4 },
          "100%": { transform: "scale(1.5)", opacity: 0 },
        },
        callRing2: {
          "0%":   { transform: "scale(1)",   opacity: 0.3 },
          "100%": { transform: "scale(1.7)", opacity: 0 },
        },
        callRing3: {
          "0%":   { transform: "scale(1)",   opacity: 0.2 },
          "100%": { transform: "scale(1.9)", opacity: 0 },
        },
        callAcceptPulse: {
          "0%,100%": { transform: "scale(1)" },
          "50%":     { transform: "scale(1.08)" },
        },
      },
    },
  },
  plugins: [],
};
