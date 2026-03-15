import React from "react";
import { Eye, Lock, Maximize2, Play, Music2, Paperclip, Download } from "lucide-react";

export default function MessageAttachment({
  fileUrl,
  fileName,
  fileType,
  isSelf,
  viewOnce,
  voState,
  onOpenLocked,
  onOpenMedia,
}) {
  const url = fileUrl;
  const mediaFrameStyle = {
    width: "100%",
    maxWidth: "100%",
    height: "220px",
    maxHeight: "220px",
  };
  const viewedDestroyedState = (
    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl
                    bg-brut-black/5 dark:bg-white/5 border border-brut-black/15 dark:border-mid-border
                    font-mono text-xs font-black uppercase tracking-wider opacity-50">
      <Lock size={13} strokeWidth={2.5} />
      <span>VIEWED - MEDIA DESTROYED</span>
    </div>
  );

  if (!url) {
    if (viewOnce && !isSelf && voState === "expired") {
      return viewedDestroyedState;
    }
    return null;
  }

  if (viewOnce && !isSelf && voState === "locked") {
    return (
      <button
        onClick={onOpenLocked}
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
    return viewedDestroyedState;
  }

  if (fileType?.startsWith("image/")) {
    return (
      <button
        onClick={onOpenMedia}
        onContextMenu={viewOnce ? (e) => e.preventDefault() : undefined}
        className="mt-2 relative block rounded-2xl overflow-hidden hover:opacity-90
                   transition-opacity focus:outline-none group/img max-w-full bg-brut-black/10 dark:bg-mid-surface2"
        style={mediaFrameStyle}
        title="Click to view"
      >
        <img
          src={url}
          alt={fileName}
          draggable={false}
          loading="lazy"
          className="w-full h-full object-contain block"
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
        onClick={onOpenMedia}
        onContextMenu={viewOnce ? (e) => e.preventDefault() : undefined}
        className="mt-2 block relative rounded-2xl overflow-hidden
                   hover:opacity-90 transition-opacity focus:outline-none max-w-full bg-brut-black/10 dark:bg-mid-surface2"
        style={mediaFrameStyle}
        title="Click to play"
      >
        <video
          src={url}
          className="w-full h-full object-contain block pointer-events-none"
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
}
