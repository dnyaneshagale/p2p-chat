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
  // visualViewport is the gold standard — correctly excludes browser UI
  const vh = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${vh}px`);
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

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
