import React, { useState, useRef, useEffect, useCallback } from "react";
import { Eye, EyeOff, Download, X } from "lucide-react";

/**
 * MediaViewer — WhatsApp-style full-screen media lightbox.
 *
 * Features
 *   • Black overlay, centred media, ESC / click-backdrop to close
 *   • Images: scroll-wheel zoom (1×–5×), click-drag pan when zoomed,
 *             double-click to toggle fit ↔ 2× zoom
 *   • Videos: centred player with proper controls
 *   • Top bar: sender name, filename, close ✕
 *   • Bottom bar: timestamp, download button (hidden for view-once)
 *   • View-once: media is fully visible while the viewer is open.
 *               When the viewer closes (✕ / ESC / backdrop), ChatWindow
 *               revokes the blob URL and marks the bubble "VIEWED".
 *               The peer can see the media for as long as they keep the
 *               viewer open — just like WhatsApp.
 *
 * Props
 *   media        { url, fileName, fileType, from, timestamp, viewOnce }
 *   onClose      () => void   (also handles view-once destruction)
 */
export default function MediaViewer({ media, onClose }) {
  const { url, fileName, fileType, from, timestamp, viewOnce } = media;
  const isImage = fileType?.startsWith("image/");
  const isVideo = fileType?.startsWith("video/");

  // ── Zoom / pan state (images only) ──────────────────────────────────────
  const [scale, setScale]     = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const dragging  = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  const imgRef    = useRef(null);

  const timeStr = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
  });
  const dateStr = new Date(timestamp).toLocaleDateString([], {
    day: "numeric", month: "short", year: "numeric",
  });

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (
        viewOnce &&
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "s" || e.key.toLowerCase() === "p")
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, viewOnce]);

  // ── Prevent body scroll while open ───────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ── Reset zoom when media changes ─────────────────────────────────────────
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [url]);

  // ── Scroll-to-zoom (must be non-passive to call preventDefault) ─────────────
  const mediaAreaRef = useRef(null);
  useEffect(() => {
    const el = mediaAreaRef.current;
    if (!el || !isImage) return;
    const onWheel = (e) => {
      e.preventDefault();
      setScale((prev) => {
        const next = Math.min(5, Math.max(1, prev - e.deltaY * 0.001));
        if (next <= 1) setOffset({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isImage]);

  // ── Touch pinch-to-zoom + touch-drag-to-pan ──────────────────────────────
  const lastTouchDist = useRef(null);
  const touchDragging = useRef(false);
  const touchStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    const el = mediaAreaRef.current;
    if (!el || !isImage) return;

    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastTouchDist.current = dist(e.touches);
      } else if (e.touches.length === 1) {
        touchDragging.current = true;
        touchStart.current = {
          x: e.touches[0].clientX, y: e.touches[0].clientY,
          ox: offset.x, oy: offset.y,
        };
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches);
        if (lastTouchDist.current) {
          const delta = d / lastTouchDist.current;
          setScale((prev) => {
            const next = Math.min(5, Math.max(1, prev * delta));
            if (next <= 1) setOffset({ x: 0, y: 0 });
            return next;
          });
        }
        lastTouchDist.current = d;
      } else if (e.touches.length === 1 && touchDragging.current) {
        // Only pan when zoomed in
        setScale((s) => {
          if (s > 1) {
            setOffset({
              x: touchStart.current.ox + (e.touches[0].clientX - touchStart.current.x),
              y: touchStart.current.oy + (e.touches[0].clientY - touchStart.current.y),
            });
          }
          return s;
        });
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) lastTouchDist.current = null;
      if (e.touches.length === 0) touchDragging.current = false;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [isImage, offset]);

  // ── Double-click / double-tap: toggle fit ↔ 2× ────────────────────────────
  const lastTap = useRef(0);
  const handleDblClick = useCallback(() => {
    if (scale > 1) { setScale(1); setOffset({ x: 0, y: 0 }); }
    else           { setScale(2); }
  }, [scale]);

  const handleTouchTap = useCallback((e) => {
    if (e.touches && e.touches.length > 1) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      handleDblClick();
    }
    lastTap.current = now;
  }, [handleDblClick]);

  // ── Drag-to-pan (mouse) ───────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (scale <= 1) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    e.preventDefault();
  }, [scale, offset]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.mx),
      y: dragStart.current.oy + (e.clientY - dragStart.current.my),
    });
  }, []);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Reset pan when zoom reaches 1×
  useEffect(() => {
    if (scale <= 1) setOffset({ x: 0, y: 0 });
  }, [scale]);

  // ── Backdrop click (only if not dragging) ─────────────────────────────────
  const handleBackdrop = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  }, [url, fileName]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(10,10,10,0.97)" }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 shrink-0"
           style={{ borderBottom: "3px solid rgba(255,255,255,0.08)",
                    paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-3">
          {/* Sender avatar chip */}
          <div className="bg-brut-yellow border-3 border-brut-yellow w-9 h-9
                          flex items-center justify-center font-black text-brut-black text-sm">
            {(from || "?")[0].toUpperCase()}
          </div>
          <div>
            <p className="text-white font-black text-sm uppercase tracking-wider leading-none">
              {from?.toUpperCase() ?? "UNKNOWN"}
            </p>
            <p className="text-white/40 font-mono text-[10px] mt-0.5 truncate max-w-[45vw] sm:max-w-[220px]">
              {fileName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View-once badge */}
          {viewOnce && (
            <div className="bg-brut-pink border-3 border-brut-pink px-2 py-1
                            animate-pulse">
              <span className="font-black font-mono text-[9px] uppercase tracking-widest
                               text-white flex items-center gap-1">
                <Eye size={10} strokeWidth={3} /> VIEW ONCE
              </span>
            </div>
          )}
          {/* Download (not for view-once) */}
          {!viewOnce && (isImage || isVideo) && (
            <button
              onClick={handleDownload}
              className="w-11 h-11 flex items-center justify-center border-3 border-white/20
                         text-white/60 active:text-white active:border-white active:scale-95
                         transition-all duration-100 rounded-lg sm:rounded-none"
              title="Download"
              aria-label="Download"
            >
              <Download size={18} strokeWidth={2} />
            </button>
          )}
          {/* Close */}
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center border-3 border-white/20
                       text-white/60 active:text-white active:border-brut-pink active:scale-95
                       font-black text-lg transition-all duration-100 rounded-lg sm:rounded-none"
            title="Close (Esc)"
            aria-label="Close viewer"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── Media area ── */}
      <div
        ref={mediaAreaRef}
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onClick={handleBackdrop}
        style={{ cursor: scale > 1 ? (dragging.current ? "grabbing" : "grab") : "default" }}
      >
        {isImage && (
          <img
            ref={imgRef}
            src={url}
            alt={fileName}
            draggable={false}
            onContextMenu={viewOnce ? (e) => e.preventDefault() : undefined}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDblClick}
            onTouchStart={handleTouchTap}
            style={{
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transition: dragging.current ? "none" : "transform 0.15s ease",
              maxWidth: "90vw",
              maxHeight: "80vh",
              objectFit: "contain",
              cursor: scale > 1 ? "grab" : "zoom-in",
              userSelect: "none",
              touchAction: "none",
            }}
          />
        )}

        {isVideo && (
          <video
            src={url}
            controls
            autoPlay
            controlsList="nodownload nofullscreen"
            disablePictureInPicture
            onContextMenu={viewOnce ? (e) => e.preventDefault() : undefined}
            style={{ maxWidth: "90vw", maxHeight: "80vh", outline: "none" }}
          />
        )}

        {/* Zoom level pill (image only) */}
        {isImage && scale > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2
                          bg-brut-yellow border-3 border-brut-black
                          px-3 py-1 font-black font-mono text-xs text-brut-black"
               style={{ boxShadow: "2px 2px 0px #0A0A0A" }}>
            {scale.toFixed(1)}×
          </div>
        )}
      </div>

      {/* ── Bottom bar ── */}
      <div className="shrink-0 px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between"
           style={{ borderTop: "3px solid rgba(255,255,255,0.08)",
                    paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
        <div>
          <p className="text-white/50 font-mono text-[10px] uppercase tracking-wider">
            {dateStr} · {timeStr}
          </p>
          {isImage && (
            <p className="text-white/25 font-mono text-[10px] mt-0.5">
              <span className="hidden sm:inline">scroll to zoom · double-click to toggle · drag to pan</span>
              <span className="sm:hidden">pinch to zoom · double-tap to toggle · drag to pan</span>
            </p>
          )}
          {viewOnce && (
            <p className="text-brut-pink font-mono font-black text-[10px] mt-0.5 uppercase tracking-wider
                          flex items-center gap-1">
              <EyeOff size={11} strokeWidth={2.5} /> CLOSES &amp; DESTROYS ON EXIT
            </p>
          )}
        </div>

        {/* No DONE button — destruction is automatic on mount */}
      </div>
    </div>
  );
}
