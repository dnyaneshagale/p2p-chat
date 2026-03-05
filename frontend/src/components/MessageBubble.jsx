import React, { useState, useCallback } from "react";
import { Eye, Lock, Maximize2, Play, Music2, Paperclip, Download, CornerUpLeft } from "lucide-react";

/**
 * MessageBubble — Neo Brutalist style.
 * Self = yellow bubble (right). Peer = white bubble (left). System = centered yellow tag.
 *
 * View-Once behaviour:
 *   Sender side: media shows normally with a pink "👁 VIEW ONCE" badge.
 *   Receiver side: locked until tapped, then shows content with a "DONE" button.
 *                  Pressing DONE revokes the blob URL — media is gone forever.
 */
export default function MessageBubble({ message, onReply, onOpenMedia }) {
  const { isSelf, from, text, fileUrl: initialFileUrl, fileName, fileType,
          replyTo, timestamp, isSystem, viewOnce } = message;

  // View-once state (receiver only)
  const [voState, setVoState] = useState("locked"); // "locked" | "expired"
  const [liveUrl, setLiveUrl] = useState(initialFileUrl ?? null);

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

  // ── System notification ────────────────────────────────────────────────────
  if (isSystem) {
    return (
      <div className="flex justify-center my-3 animate-fade-in">
        <div className="bg-brut-yellow border-3 border-brut-black px-4 py-1.5
                        font-mono text-xs font-black uppercase tracking-wider"
             style={{ boxShadow: "2px 2px 0px #0A0A0A" }}>
          {text}
        </div>
      </div>
    );
  }

  // Helper: build the media object that gets passed to MediaViewer
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

  // ── Attachment renderer ────────────────────────────────────────────────────
  const renderAttachment = () => {
    const url = liveUrl;

    // ── View-once: receiver, not yet viewed ───────────────────────────────
    // handleDone is passed as onDone inside the media object. ChatWindow calls
    // it when the viewer is CLOSED, revoking the blob URL and setting
    // voState="expired" — matching WhatsApp's behaviour: visible while open,
    // destroyed the moment the viewer is dismissed.
    if (viewOnce && !isSelf && voState === "locked") {
      return (
        <button
          onClick={() => openInViewer(handleDone)}
          className="mt-2 flex flex-col items-center justify-center gap-2
                     bg-brut-black text-white border-3 border-brut-black
                     px-6 py-5 w-full font-black uppercase tracking-widest
                     active:bg-brut-pink active:scale-[0.98] transition-all duration-100"
          style={{ boxShadow: "4px 4px 0px #FF2D78" }}
        >
          <Eye size={28} strokeWidth={1.5} />
          <span className="text-[11px] sm:text-xs">TAP TO VIEW · VIEW ONCE</span>
          <span className="text-[10px] opacity-50 normal-case tracking-normal font-mono">
            {fileName} · {fileType}
          </span>
        </button>
      );
    }

    // ── View-once: receiver, expired ─────────────────────────────────────
    if (viewOnce && !isSelf && voState === "expired") {
      return (
        <div className="mt-2 flex items-center gap-2 px-4 py-3
                        bg-brut-black/10 dark:bg-white/5 border-3 border-brut-black/30 dark:border-mid-border
                        font-mono text-xs font-black uppercase tracking-wider opacity-50">
          <Lock size={13} strokeWidth={2.5} />
          <span>VIEWED — MEDIA DESTROYED</span>
        </div>
      );
    }

    if (!url) return null;

    // ── Image thumbnail ───────────────────────────────────────────────────
    if (fileType?.startsWith("image/")) {
      return (
        <button
          onClick={() => openInViewer(viewOnce && !isSelf ? handleDone : null)}
          className="mt-2 relative block border-3 border-brut-black hover:opacity-90
                     transition-opacity focus:outline-none group/img"
          style={{ boxShadow: "3px 3px 0px #0A0A0A" }}
          title="Click to view"
        >
          <img
            src={url}
            alt={fileName}
            draggable={false}
            className="w-full max-w-[240px] sm:max-w-[280px] max-h-[200px] sm:max-h-[220px] object-cover block"
          />
          {/* Expand hint on hover */}
          <div className="absolute inset-0 bg-brut-black/0 group-hover/img:bg-brut-black/20
                          transition-colors flex items-center justify-center pointer-events-none">
            <span className="opacity-0 group-hover/img:opacity-100 transition-opacity
                             bg-brut-yellow border-3 border-brut-black
                             font-black text-[10px] uppercase tracking-widest px-2 py-1
                             flex items-center gap-1">
              <Maximize2 size={11} strokeWidth={2.5} /> EXPAND
            </span>
          </div>
        </button>
      );
    }

    // ── Video thumbnail ───────────────────────────────────────────────────
    if (fileType?.startsWith("video/")) {
      return (
        <button
          onClick={() => openInViewer(null)}
          className="mt-2 block relative border-3 border-brut-black
                     hover:opacity-90 transition-opacity focus:outline-none"
          style={{ boxShadow: "3px 3px 0px #0A0A0A" }}
          title="Click to play"
        >
          <video
            src={url}
            className="max-w-[240px] sm:max-w-[280px] max-h-[180px] sm:max-h-[200px] object-cover block pointer-events-none"
            preload="metadata"
          />
          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center
                          bg-brut-black/30">
            <div className="bg-brut-yellow border-3 border-brut-black w-12 h-12
                            flex items-center justify-center"
                 style={{ boxShadow: "3px 3px 0px #0A0A0A" }}>
              <Play size={20} strokeWidth={2} className="fill-current text-brut-black" />
            </div>
          </div>
        </button>
      );
    }

    // ── Audio ─────────────────────────────────────────────────────────────
    if (fileType?.startsWith("audio/")) {
      return (
        <div className="mt-2 flex items-center gap-2 p-2 border-3 border-brut-black dark:border-mid-border"
             style={{ boxShadow: "2px 2px 0px #0A0A0A" }}>
          <Music2 size={18} strokeWidth={2} className="shrink-0" />
          <audio src={url} controls controlsList="nodownload" className="w-full h-8" />
        </div>
      );
    }

    // ── Generic file ──────────────────────────────────────────────────────
    return (
      <a
        href={viewOnce && !isSelf ? undefined : url}
        download={!viewOnce ? fileName : undefined}
        onClick={viewOnce && !isSelf ? (e) => e.preventDefault() : undefined}
        className="flex items-center gap-2.5 mt-2.5 text-sm font-bold
                   border-3 border-brut-black dark:border-mid-border px-3 py-2
                   hover:bg-brut-yellow dark:hover:bg-mid-surface transition-colors"
        style={{ boxShadow: "2px 2px 0px #0A0A0A" }}
      >
        <Paperclip size={17} strokeWidth={2} className="shrink-0" />
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

  return (
    <div className={`flex flex-col mb-2.5 sm:mb-4 animate-slide-up ${isSelf ? "items-end" : "items-start"}`}>
      {/* Sender name tag */}
      <span className="text-[10px] font-black uppercase tracking-widest
                       text-brut-black/50 dark:text-mid-muted mb-1 mx-1">
        {isSelf ? "YOU" : (from || "PEER").toUpperCase()}
      </span>

      {/* Bubble */}
      <div className={`group relative ${isSelf ? "bubble-self" : "bubble-peer"}`}>

        {/* View-once badge (sender side) */}
        {showViewOnceBadge && (
          <div className="flex items-center gap-1 mb-1.5 -mt-0.5">
            <span className="bg-brut-pink text-white text-[9px] font-black uppercase
                             tracking-widest px-2 py-0.5 border-2 border-brut-black
                             flex items-center gap-1">
              <Eye size={10} strokeWidth={3} /> VIEW ONCE
            </span>
          </div>
        )}

        {/* Reply quote */}
        {replyTo && (
          <div className="text-xs px-3 py-1.5 mb-2 font-mono
                          bg-brut-black/10 dark:bg-white/10 border-l-4 border-brut-black dark:border-mid-border">
            <span className="font-black uppercase text-[10px]">{replyTo.from}: </span>
            <span className="opacity-60">{replyTo.text || "Attachment"}</span>
          </div>
        )}

        {/* Text */}
        {text && <p className="text-sm font-medium leading-relaxed">{text}</p>}

        {/* File/media */}
        {renderAttachment()}

        {/* Time + Reply action */}
        <div className={`flex items-center gap-3 mt-2
                         ${isSelf ? "justify-end" : "justify-start"}`}>
          <span className="font-mono text-[10px] font-bold opacity-40 uppercase">
            {timeStr}
          </span>
          <button
            onClick={() => onReply?.(message)}
            className="-m-2 p-2 text-[10px] font-black uppercase tracking-wider
                       sm:opacity-0 sm:group-hover:opacity-50 hover:!opacity-100
                       opacity-40 active:opacity-100 active:text-brut-pink
                       transition-all duration-100 rounded-md
                       active:bg-brut-black/5 dark:active:bg-white/5"
          >
            <CornerUpLeft size={12} strokeWidth={2.5} className="inline mr-0.5" /> REPLY
          </button>
        </div>
      </div>
    </div>
  );
}


