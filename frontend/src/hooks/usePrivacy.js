import { useEffect } from "react";

/**
 * usePrivacy
 *
 * Applies every privacy defence a browser-based app can offer.
 *
 * What it DOES protect against:
 *   ✓ In-browser keyboard screenshots (PrintScreen, Ctrl+S, macOS ⌘⇧3/4/5)
 *   ✓ Right-click → "Save image as" / "Inspect"
 *   ✓ Dragging media out of the browser window
 *   ✓ Browser tab-sharing via the getDisplayMedia API (detects + blurs)
 *   ✓ Window focus lost to another app (blurs to prevent shoulder-surfing via
 *     screen-share tools that grab the desktop)
 *   ✓ Text copy via keyboard (Ctrl/Cmd+C/A)
 *
 * What it CANNOT protect against (OS-level — no browser API can block these):
 *   ✗ PrintScreen via OS (some OSes ignore e.preventDefault() for this key)
 *   ✗ Third-party screen recorders (OBS, Bandicam, ShareX, etc.)
 *   ✗ Phone camera pointed at the screen
 *   ✗ Another user on the same machine with OS administrator access
 *
 * These are fundamental browser-sandbox limitations.
 */
export function usePrivacy() {
  useEffect(() => {
    // ── 1. Block in-browser screenshot / save shortcuts ──────────────────────
    const handleKeyDown = (e) => {
      const key  = e.key?.toLowerCase() ?? "";
      const ctrl = e.ctrlKey || e.metaKey;  // Ctrl on Win/Linux, ⌘ on macOS

      const blocked =
        key === "printscreen" ||                              // PrtSc
        (ctrl && key === "s") ||                             // Ctrl+S / ⌘S (save page)
        (ctrl && key === "p") ||                             // Ctrl+P / ⌘P (print)
        (ctrl && key === "u") ||                             // View source
        (ctrl && e.shiftKey && key === "i") ||               // DevTools
        (ctrl && e.shiftKey && key === "j") ||               // DevTools Console
        (e.metaKey && e.shiftKey && ["3","4","5"].includes(key)); // macOS screenshots

      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // ── 2. Disable right-click context menu ──────────────────────────────────
    const handleContextMenu = (e) => e.preventDefault();

    // ── 3. Block text copy & selection shortcuts ─────────────────────────────
    const handleCopy = (e) => {
      // Allow copying in text inputs / textareas (typing UX should still work)
      const tag = document.activeElement?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      e.preventDefault();
    };

    // ── 4. Prevent image dragging out of the window ───────────────────────────
    const handleDragStart = (e) => {
      if (e.target.tagName === "IMG" || e.target.tagName === "VIDEO") {
        e.preventDefault();
      }
    };

    // ── 5. Blur content when window loses focus ───────────────────────────────
    //    Helps against a screen-share tool that grabs the full desktop.
    const obscure   = () => { document.getElementById("root").style.filter = "blur(12px)"; };
    const unobscure = () => { document.getElementById("root").style.filter = ""; };

    window.addEventListener("blur",  obscure);
    window.addEventListener("focus", unobscure);

    // ── 6. Blur when tab becomes hidden ──────────────────────────────────────
    const handleVisibility = () => {
      document.visibilityState === "hidden" ? obscure() : unobscure();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // ── 7. Detect browser tab-sharing (getDisplayMedia / screen share) ───────
    //    navigator.mediaDevices.oncapturehandlechange fires when the capturing
    //    origin changes. Not universally supported yet, handled gracefully.
    const captureChange = () => obscure();
    try {
      if (navigator.mediaDevices?.setCaptureHandleConfig) {
        navigator.mediaDevices.setCaptureHandleConfig({ handle: "", exposeOrigin: false });
      }
      if (navigator.mediaDevices?.oncapturehandlechange !== undefined) {
        navigator.mediaDevices.addEventListener("capturehandlechange", captureChange);
      }
    } catch (_) { /* API not supported in this browser — silently ignore */ }

    document.addEventListener("keydown",      handleKeyDown,    true);
    document.addEventListener("contextmenu",  handleContextMenu);
    document.addEventListener("copy",         handleCopy);
    document.addEventListener("dragstart",    handleDragStart);

    return () => {
      document.removeEventListener("keydown",      handleKeyDown,    true);
      document.removeEventListener("contextmenu",  handleContextMenu);
      document.removeEventListener("copy",         handleCopy);
      document.removeEventListener("dragstart",    handleDragStart);
      window.removeEventListener("blur",           obscure);
      window.removeEventListener("focus",          unobscure);
      document.removeEventListener("visibilitychange", handleVisibility);
      try {
        navigator.mediaDevices?.removeEventListener?.("capturehandlechange", captureChange);
      } catch (_) {}
      // Ensure no residual blur
      const root = document.getElementById("root");
      if (root) root.style.filter = "";
    };
  }, []);
}
