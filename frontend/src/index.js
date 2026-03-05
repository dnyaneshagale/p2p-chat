import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

if (process.env.NODE_ENV === "production") {
  const noop = () => {};
  ["log", "debug", "info", "warn", "error", "group", "groupEnd", "groupCollapsed", "table", "time", "timeEnd"].forEach(
    (method) => { console[method] = noop; }
  );
}

// ── Real viewport height tracker ─────────────────────────────────────────────
// Mobile browsers (Chrome, Samsung Internet, Firefox) have a top URL bar and
// bottom navigation bar that overlap page content. CSS 100vh/100dvh includes
// the browser chrome, causing the footer to be hidden behind the bottom bar.
//
// This script continuously measures the ACTUAL visible area via
// window.visualViewport (the only API that reports real visible pixels) and
// sets a CSS custom property --app-height on <html>. Components use this
// variable instead of 100vh/dvh so nothing ever hides behind browser chrome.
// Also handles keyboard open/close on mobile (visualViewport shrinks).
// ─────────────────────────────────────────────────────────────────────────────
function setAppHeight() {
  const vvp = window.visualViewport;
  const height = vvp ? vvp.height : window.innerHeight;
  // offsetTop: how far the visual viewport has been scrolled down inside the
  // layout viewport. On Android Chrome, when the soft keyboard opens the
  // browser scrolls window upward to keep the focused input visible —
  // offsetTop becomes positive, leaving a visible gap between the input bar
  // and the keyboard. We expose it as --vvp-top so the container can
  // translateY back into the correct position.
  const top = vvp ? Math.round(vvp.offsetTop) : 0;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
  document.documentElement.style.setProperty("--vvp-top",    `${top}px`);
  // Snap any document-level scroll caused by the browser scrolling to the
  // focused input. The translateY on the container handles the visual
  // repositioning — the document scroll itself just creates the gap.
  if (top > 0) window.scrollTo(0, 0);
}

// Run immediately
setAppHeight();

// Listen to all events that change visible area:
// - visualViewport resize: browser chrome show/hide, keyboard open/close
// - window resize: orientation change, desktop resize
// - orientationchange: legacy fallback for older Android browsers
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", setAppHeight);
  window.visualViewport.addEventListener("scroll", setAppHeight);
}
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", () => {
  // Delay needed — some browsers report old values immediately after orientation change
  setTimeout(setAppHeight, 150);
});

/**
 * ErrorBoundary — catches any render-phase exception in the tree so the user
 * sees a friendly message instead of a blank white screen.
 * NOTE: must be defined BEFORE root.render() — class declarations are in the
 * Temporal Dead Zone until evaluated, so using the class before its definition
 * throws a ReferenceError and causes the blank screen we're trying to prevent.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || "Unknown error" };
  }
  componentDidCatch(err, info) {
    console.error("[ErrorBoundary]", err, info.componentStack);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#0A0A0A", color: "#fff", padding: "1.5rem", textAlign: "center",
      }}>
        <div style={{
          border: "3px solid #FF2D78", padding: "2rem 2.5rem", maxWidth: 400,
          boxShadow: "4px 4px 0 #FF2D78",
        }}>
          <p style={{ fontWeight: 900, fontSize: "1.1rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
            Something went wrong
          </p>
          <p style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", marginBottom: "1.5rem", wordBreak: "break-word" }}>
            {this.state.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#FFE500", color: "#0A0A0A", border: "none", padding: "0.6rem 1.5rem",
              fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
              cursor: "pointer", fontSize: "0.8rem",
            }}
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
