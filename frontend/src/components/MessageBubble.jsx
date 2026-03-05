import React, { useState, useCallback, useRef } from "react";
import { Eye, Lock, Maximize2, Play, Music2, Paperclip, Download, CornerUpLeft } from "lucide-react";

/**
 * MessageBubble — WhatsApp-inspired bubbles with swipe-to-reply.
 *
 * Swipe-to-reply:
 *   - Drag bubble rightward (touch or mouse). A reply icon tracks behind.
 *   - At REPLY_THRESHOLD px, haptic feedback fires (if available) and the
 *     icon locks to its peak. Release -> bubble snaps back, onReply fires.
 *   - Works for both self and peer bubbles (swipe right, WhatsApp standard).
 */

const REPLY_THRESHOLD = 64;
const MAX_DRAG = 80;

export default function MessageBubble({ message, onReply, onOpenMedia }) {
  const { isSelf, from, text, fileUrl: initialFileUrl, fileName, fileType,
          replyTo, timestamp, isSystem, viewOnce } = message;

  const [voState, setVoState] = useState("locked");
  const [liveUrl, setLiveUrl] = useState(initialFileUrl ?? null);

  const [dragX,    setDragX]    = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart  = useRef(null);
  const threshHit  = useRef(false);

  const handleDone = useCallback(() => {
    if (liveUrl) {
      URL.revokeObjectURL(liveUrl);
      setLiveUrl(null);
    }
    setVoState("expired");
  }, [liveUrl]);

  const timeStr = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    // Don't hijack clicks on interactive elements inside the bubble (buttons, links)
    if (e.target.closest("button, a")) return;
    dragStart.current = { clientX: e.clientX };
    threshHit.current = false;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragStart.current) return;
    const dx = Math.max(0, Math.min(e.clientX - dragStart.current.clientX, MAX_DRAG));
    setDragX(dx);
    if (dx >= REPLY_THRESHOLD && !threshHit.current) {
      threshHit.current = true;
      if (navigator.vibrate) navigator.vibrate(30);
    }
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragStart.current) return;
    const fired = threshHit.current;
    dragStart.current = null;
    threshHit.current = false;
    setDragging(false);
    setDragX(0);
    if (fired) onReply?.(message);
  }, [message, onReply]);

  const onPointerCancel = useCallback(() => {
    dragStart.current = null;
    threshHit.current = false;
    setDragging(false);
    setDragX(0);
  }, []);

  if (isSystem) {
    return (
      <div className="flex justify-center my-2 animate-fade-in">
        <div className="bg-brut-yellow/80 dark:bg-mid-surface border border-brut-black/15 dark:border-mid-border
                        px-3 py-1 rounded-full
                        font-mono text-[10px] font-bold uppercase tracking-wider text-brut-black/70 dark:text-mid-muted">
          {text}
        </div>
      </div>
    );
  }

  const openInViewer = useCallback((extraOnDone) => {
    onOpenMedia?.({
      url: liveUrl,
      fileName,
      fileType,
      from,
      timestamp,
      viewOnce,
      onDone: extraOnDone,
    });
  }, [onOpenMedia, liveUrl, fileName, fileType, from, timestamp, viewOnce]);

  const renderAttachment = () => {
    const url = liveUrl;

    if (viewOnce && !isSelf && voState === "locked") {
      return (
        <button
          onClick={() => openInViewer(handleDone)}
          className="mt-2 flex flex-col items-center justify-center gap-2
                     bg-brut-black text-white rounded-2xl
                     px-6 py-5 w-full font-black uppercase tracking-widest
                     active:bg-brut-pink active:scale-[0.98] transition-all duration-100"
          style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}
        >
          <Eye size={28} strokeWidth={1.5} />
          <span className="text-[11px] sm:text-xs">TAP TO VIEW - VIEW ONCE</span>
          <span className="text-[10px] opacity-50 normal-case tracking-normal font-mono">
            {fileName} - {fileType}
          </span>
        </button>
      );
    }

    if (viewOnce && !isSelf && voState === "expired") {
      return (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl
                        bg-brut-black/5 dark:bg-white/5 border border-brut-black/15 dark:border-mid-border
                        font-mono text-xs font-black uppercase tracking-wider opacity-50">
          <Lock size={13} strokeWidth={2.5} />
          <span>VIEWED - MEDIA DESTROYED</span>
        </div>
      );
    }

    if (!url) return null;

    if (fileType?.startsWith("image/")) {
      return (
        <button
          onClick={() => openInViewer(viewOnce && !isSelf ? handleDone : null)}
          className="mt-2 relative block rounded-2xl overflow-hidden hover:opacity-90
                     transition-opacity focus:outline-none group/img w-full"
          title="Click to view"
        >
          <img
            src={url}
            alt={fileName}
            draggable={false}
            className="w-full max-w-[240px] sm:max-w-[280px] max-h-[200px] sm:max-h-[220px] object-cover block"
          />
          <div className="absolute inset-0 bg-brut-black/0 group-hover/img:bg-brut-black/20
                          transition-colors flex items-center justify-center pointer-events-none">
            <span className="opacity-0 group-hover/img:opacity-100 transition-opacity
                             bg-brut-yellow border-2 border-brut-black rounded-md
                             font-black text-[10px] text-brut-black uppercase tracking-widest px-2 py-1
                             flex items-center gap-1">
              <Maximize2 size={11} strokeWidth={2.5} /> EXPAND
            </span>
          </div>
        </button>
      );
    }

    if (fileType?.startsWith("video/")) {
      return (
        <button
          onClick={() => openInViewer(null)}
          className="mt-2 block relative rounded-2xl overflow-hidden
                     hover:opacity-90 transition-opacity focus:outline-none"
          title="Click to play"
        >
          <video
            src={url}
            className="max-w-[240px] sm:max-w-[280px] max-h-[180px] sm:max-h-[200px] object-cover block pointer-events-none"
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-brut-black/30">
            <div className="bg-brut-yellow border-3 border-brut-black w-12 h-12 rounded-full
                            flex items-center justify-center"
                 style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
              <Play size={20} strokeWidth={2} className="fill-current text-brut-black ml-0.5" />
            </div>
          </div>
        </button>
      );
    }

    if (fileType?.startsWith("audio/")) {
      return (
        <div className="mt-2 flex items-center gap-2 p-2.5 rounded-xl
                        bg-brut-black/5 dark:bg-white/5 border border-brut-black/15 dark:border-mid-border">
          <Music2 size={18} strokeWidth={2} className="shrink-0 opacity-60" />
          <audio src={url} controls controlsList="nodownload" className="w-full h-8" />
        </div>
      );
    }

    return (
      <a
        href={viewOnce && !isSelf ? undefined : url}
        download={!viewOnce ? fileName : undefined}
        onClick={viewOnce && !isSelf ? (e) => e.preventDefault() : undefined}
        className="flex items-center gap-2.5 mt-2 text-sm font-bold rounded-xl
                   border border-brut-black/20 dark:border-mid-border px-3 py-2.5
                   bg-brut-black/5 dark:bg-white/5
                   hover:bg-brut-yellow dark:hover:bg-mid-surface transition-colors"
      >
        <Paperclip size={17} strokeWidth={2} className="shrink-0 opacity-70" />
        <div className="min-w-0">
          <p className="truncate max-w-[200px] font-black text-xs uppercase tracking-wide">
            {fileName}
          </p>
          <p className="font-mono text-[10px] opacity-50 mt-0.5">{fileType || "file"}</p>
        </div>
        {!viewOnce && <Download size={14} strokeWidth={2} className="ml-auto opacity-40 shrink-0" />}
      </a>
    );
  };

  const isMedia = fileType?.startsWith("image/") || fileType?.startsWith("video/");
  const showViewOnceBadge = viewOnce && isSelf && isMedia;

  const iconOpacity = Math.min(dragX / REPLY_THRESHOLD, 1);
  const iconScale   = 0.5 + 0.5 * Math.min(dragX / REPLY_THRESHOLD, 1);

  return (
    <div className={`flex flex-col mb-1 sm:mb-2 animate-slide-up ${isSelf ? "items-end" : "items-start"}`}>
      {/* Sender name */}
      <span className="text-[10px] font-black uppercase tracking-widest
                       text-brut-black/40 dark:text-mid-muted mb-0.5 px-1">
        {isSelf ? "YOU" : (from || "PEER").toUpperCase()}
      </span>

      {/* Swipe row */}
      <div className={`relative flex items-center w-full ${isSelf ? "justify-end" : "justify-start"}`}>

        {/* Reply icon — hidden behind bubble, revealed on swipe */}
        <div
          aria-hidden
          className="absolute flex items-center justify-center
                     w-9 h-9 rounded-full bg-brut-black/10 dark:bg-white/10 pointer-events-none"
          style={{
            left: isSelf ? "auto" : "4px",
            right: isSelf ? "4px" : "auto",
            opacity: dragging ? iconOpacity : 0,
            transform: `scale(${dragging ? iconScale : 0.5})`,
            transition: dragging ? "none" : "opacity 0.25s ease, transform 0.25s ease",
          }}
        >
          <CornerUpLeft size={16} strokeWidth={2.5} className="text-brut-black/70 dark:text-mid-text/70" />
        </div>

        {/* Bubble */}
        <div
          className={`group relative cursor-grab active:cursor-grabbing select-none
                      ${isSelf ? "bubble-self" : "bubble-peer"}`}
          style={{
            transform: `translateX(${dragX}px)`,
            transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
            touchAction: "pan-y",
            willChange: "transform",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {/* View-once badge */}
          {showViewOnceBadge && (
            <div className="flex items-center gap-1 mb-1.5 -mt-0.5">
              <span className="bg-brut-pink text-white text-[9px] font-black uppercase
                               tracking-widest px-2 py-0.5 rounded-full border border-brut-black/20
                               flex items-center gap-1">
                <Eye size={10} strokeWidth={3} /> VIEW ONCE
              </span>
            </div>
          )}

          {/* Reply quote */}
          {replyTo && (
            <div className="text-xs px-3 py-1.5 mb-2 rounded-lg font-mono
                            bg-brut-black/10 dark:bg-white/10 border-l-4 border-brut-black dark:border-mid-border">
              <span className="font-black uppercase text-[10px]">{replyTo.from}: </span>
              <span className="opacity-60">{replyTo.text || "Attachment"}</span>
            </div>
          )}

          {/* Text */}
          {text && <p className="text-sm font-medium leading-relaxed">{text}</p>}

          {/* Media/file */}
          {renderAttachment()}

          {/* Timestamp + Reply button row — inside bubble */}
          <div className={`flex items-center gap-2 mt-1.5 ${isSelf ? "justify-end" : "justify-between"}`}>
            {/* Reply button (left side for peer; right+rotated for self) */}
            {!isSelf && (
              <button
                onClick={() => onReply?.(message)}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider
                           text-brut-black/40 dark:text-mid-muted
                           hover:text-brut-pink dark:hover:text-brut-pink
                           active:scale-90 transition-all duration-100 -ml-0.5"
                aria-label="Reply"
              >
                <CornerUpLeft size={11} strokeWidth={2.5} /> Reply
              </button>
            )}
            <span className={`font-mono text-[10px] font-bold opacity-35 uppercase select-none ${isSelf ? "" : "ml-auto"}`}>
              {timeStr}
            </span>
            {isSelf && (
              <button
                onClick={() => onReply?.(message)}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider
                           text-brut-black/40 dark:text-mid-text/40
                           hover:text-brut-pink dark:hover:text-brut-pink
                           active:scale-90 transition-all duration-100 -mr-0.5"
                aria-label="Reply"
              >
                Reply <CornerUpLeft size={11} strokeWidth={2.5} className="scale-x-[-1]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
