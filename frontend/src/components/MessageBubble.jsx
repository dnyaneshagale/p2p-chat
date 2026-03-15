import React, { useState, useCallback, useEffect, useRef } from "react";
import { Eye, CornerUpLeft, SmilePlus, X, Download, FileImage, FileVideo, Music2, FileText } from "lucide-react";
import EmojiPicker from "emoji-picker-react";
import { useSwipeReply } from "../hooks/useSwipeReply";
import { QUICK_REACTIONS, RECENT_REACTIONS_KEY } from "../constants/reactionEmojis";
import { formatBytes } from "../utils/formatBytes";
import MessageReplyPreview from "./message/MessageReplyPreview";
import MessageAttachment from "./message/MessageAttachment";
import MessageTransferProgress from "./message/MessageTransferProgress";
import MessageMeta from "./message/MessageMeta";
import MessageHeader from "./message/MessageHeader";
import MessageText from "./message/MessageText";
import MessageReactions from "./message/MessageReactions";

/**
 * @typedef {import("../types/message").ChatMessage} ChatMessage
 */

/**
 * MessageBubble — WhatsApp-inspired bubbles with swipe-to-reply.
 *
 * Swipe-to-reply:
 *   - Drag bubble rightward (touch or mouse). A reply icon tracks behind.
 *   - At REPLY_THRESHOLD px, haptic feedback fires (if available) and the
 *     icon locks to its peak. Release -> bubble snaps back, onReply fires.
 *   - Works for both self and peer bubbles (swipe right, WhatsApp standard).
 */

/**
 * @param {{
 *   message: ChatMessage,
 *   onReply: (message: ChatMessage) => void,
 *   onOpenMedia: (media: any) => void,
 *   onToggleReaction: (messageId: number|string, emoji: string) => void,
 *   onRespondToFileOffer: (messageId: number|string, accept: boolean) => void,
 *   onConsumeViewOnce: (messageId: number|string) => void,
 *   currentUser: string,
 * }} props
 */
export default function MessageBubble({ message, onReply, onOpenMedia, onToggleReaction, onRespondToFileOffer, onConsumeViewOnce, currentUser }) {
  const { isSelf, from, text, fileUrl: initialFileUrl, fileName, fileType,
  replyTo, timestamp, isSystem, viewOnce, viewOnceConsumed, transfer, reactions } = message;
  const hasReactions = Array.isArray(reactions) && reactions.length > 0;

  const [liveUrl, setLiveUrl] = useState(initialFileUrl ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activePickerTab, setActivePickerTab] = useState("quick"); // recent | quick | all
  const [recentReactions, setRecentReactions] = useState([]);
  const [pickerPos, setPickerPos] = useState({ left: 0, top: 0, mobile: false });
  const pickerRef = useRef(null);
  const longPressTimerRef = useRef(null);

  const {
    dragX,
    dragging,
    threshold,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = useSwipeReply(onReply, message);

  const handleDone = useCallback(() => {
    if (liveUrl) {
      URL.revokeObjectURL(liveUrl);
      setLiveUrl(null);
    }
    onConsumeViewOnce?.(message.id);
  }, [liveUrl, message.id, onConsumeViewOnce]);

  const voState = viewOnceConsumed ? "expired" : "locked";

  // Sync local URL state when message fileUrl arrives later (e.g., receiver side
  // after file-transfer-complete updates the message object).
  useEffect(() => {
    if (!viewOnceConsumed && initialFileUrl && initialFileUrl !== liveUrl) {
      setLiveUrl(initialFileUrl);
    }
  }, [initialFileUrl, liveUrl, viewOnceConsumed]);

  useEffect(() => {
    if (viewOnceConsumed && liveUrl) {
      setLiveUrl(null);
    }
  }, [viewOnceConsumed, liveUrl]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setActivePickerTab("quick");
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_REACTIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setRecentReactions(parsed.filter((x) => typeof x === "string").slice(0, 12));
    } catch (_) {}
  }, []);

  const pushRecentReaction = useCallback((emoji) => {
    setRecentReactions((prev) => {
      const next = [emoji, ...prev.filter((x) => x !== emoji)].slice(0, 12);
      try { localStorage.setItem(RECENT_REACTIONS_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocDown = (e) => {
      if (!pickerRef.current?.contains(e.target)) closePicker();
    };
    const onEsc = (e) => {
      if (e.key === "Escape") closePicker();
    };
    window.addEventListener("pointerdown", onDocDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("pointerdown", onDocDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [pickerOpen, closePicker]);

  const openPickerAt = useCallback((x, y) => {
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      setPickerPos({ left: 8, top: window.innerHeight - 420, mobile: true });
    } else {
      const menuW = 352;
      const menuH = 420;
      const left = Math.max(8, Math.min(window.innerWidth - menuW - 8, x - (menuW / 2)));
      const top = Math.max(8, Math.min(window.innerHeight - menuH - 8, y - menuH - 10));
      setPickerPos({ left, top, mobile: false });
    }
    setActivePickerTab(recentReactions.length > 0 ? "recent" : "quick");
    setPickerOpen(true);
  }, [recentReactions.length]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    openPickerAt(e.clientX, e.clientY);
  }, [openPickerAt]);

  const armLongPress = useCallback((e) => {
    clearTimeout(longPressTimerRef.current);
    const touch = e.touches?.[0];
    const x = touch?.clientX ?? e.clientX ?? 24;
    const y = touch?.clientY ?? e.clientY ?? 24;
    longPressTimerRef.current = setTimeout(() => openPickerAt(x, y), 420);
  }, [openPickerAt]);

  const cancelLongPress = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  useEffect(() => () => cancelLongPress(), [cancelLongPress]);

  const onPickReaction = useCallback((emoji) => {
    onToggleReaction?.(message.id, emoji);
    pushRecentReaction(emoji);
    closePicker();
  }, [message.id, onToggleReaction, pushRecentReaction, closePicker]);

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

  const isMedia = fileType?.startsWith("image/") || fileType?.startsWith("video/");
  const showViewOnceBadge = viewOnce && isSelf && isMedia;
  const showFileOfferActions = !isSelf && transfer?.state === "offer";
  const hasMediaAttachment = Boolean(initialFileUrl || liveUrl || (showFileOfferActions && isMedia) || (isMedia && fileName));
  const mediaBubbleStyle = hasMediaAttachment ? {
    width: "min(17rem, 100%)",
    maxWidth: "min(17rem, 100%)",
  } : undefined;
  const textBubbleWidthClass = hasMediaAttachment ? "" : "max-w-[78vw] sm:max-w-[64%]";
  const OfferIcon = fileType?.startsWith("image/") ? FileImage
    : fileType?.startsWith("video/") ? FileVideo
    : fileType?.startsWith("audio/") ? Music2
    : FileText;
  const offerTypeLabel = fileType?.split("/")[0] || "file";

  const iconOpacity = Math.min(dragX / threshold, 1);
  const iconScale   = 0.5 + 0.5 * Math.min(dragX / threshold, 1);

  return (
    <div className={`flex flex-col w-full min-w-0 ${hasReactions ? "mb-5 sm:mb-6" : "mb-1 sm:mb-2"} animate-slide-up ${isSelf ? "items-end" : "items-start"}`}>
      {/* Sender name */}
      <MessageHeader isSelf={isSelf} from={from} />

      {/* Swipe row */}
      <div className={`relative flex items-center w-full min-w-0 ${isSelf ? "justify-end" : "justify-start"}`}>

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
                      w-fit min-w-0 ${textBubbleWidthClass}
                      ${isSelf ? "bubble-self" : "bubble-peer"}`}
          style={{
            ...mediaBubbleStyle,
            transform: `translateX(${dragX}px)`,
            transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
            touchAction: "pan-y",
            willChange: "transform",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={handleContextMenu}
          onTouchStart={armLongPress}
          onTouchMove={cancelLongPress}
          onTouchEnd={cancelLongPress}
          onTouchCancel={cancelLongPress}
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
          <MessageReplyPreview replyTo={replyTo} />

          {/* Text */}
          <MessageText text={text} />

          {/* Media/file */}
          <MessageAttachment
            fileUrl={liveUrl}
            fileName={fileName}
            fileType={fileType}
            isSelf={isSelf}
            viewOnce={viewOnce}
            voState={voState}
            onOpenLocked={() => openInViewer(handleDone)}
            onOpenMedia={() => openInViewer(viewOnce && !isSelf ? handleDone : null)}
          />
          {showFileOfferActions && (
            <div className="mt-2 rounded-2xl border border-brut-black/20 dark:border-mid-border bg-brut-black/5 dark:bg-white/5 overflow-hidden">
              <div className="flex items-center gap-2.5 p-2.5">
                <div className="w-12 h-12 shrink-0 rounded-xl border border-brut-black/20 dark:border-mid-border bg-brut-yellow/45 dark:bg-mid-surface flex items-center justify-center">
                  <OfferIcon size={18} strokeWidth={2.5} className="text-brut-black/80 dark:text-mid-text/85" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-wider opacity-80 truncate">
                    {fileName || "Media"}
                  </p>
                  <p className="text-[10px] font-mono opacity-65 mt-0.5 uppercase tracking-wide">
                    {formatBytes(transfer?.totalBytes || 0)} · {offerTypeLabel}
                  </p>
                </div>
                <button
                  onClick={() => onRespondToFileOffer?.(message.id, true)}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full border border-brut-black/30 dark:border-mid-border bg-white dark:bg-mid-surface text-[10px] font-black uppercase tracking-wider"
                >
                  <Download size={12} strokeWidth={2.5} /> Download
                </button>
              </div>
              <div className="px-2.5 pb-2.5 -mt-0.5">
                <p className="text-[10px] font-mono opacity-60 uppercase tracking-wide">
                  Tap download to receive this media
                </p>
              </div>
            </div>
          )}
          <MessageTransferProgress transfer={transfer} fileName={fileName} isSelf={isSelf} />

          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              openPickerAt(rect.left + rect.width / 2, rect.top - 8);
            }}
            className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full border border-brut-black/20 dark:border-mid-border bg-white/95 dark:bg-mid-surface text-brut-black/60 dark:text-mid-text/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Add reaction"
            aria-label="Add reaction"
          >
            <SmilePlus size={12} strokeWidth={2.5} />
          </button>

          {/* Timestamp + Reply button row — inside bubble */}
          <MessageMeta
            isSelf={isSelf}
            timestamp={timestamp}
            onReply={onReply}
            message={message}
          />
        </div>

        {/* WhatsApp-style floating reaction tray (outside bubble) */}
        {hasReactions && (
          <div className={`absolute -bottom-4 z-20 pointer-events-auto ${isSelf ? "right-2" : "left-2"}`}>
            <MessageReactions reactions={reactions} currentUser={currentUser} floating />
          </div>
        )}
      </div>

      {pickerOpen && (
        <div
          ref={pickerRef}
          className={`fixed z-[120] w-[352px] max-w-[calc(100vw-16px)] p-2 rounded-2xl border-2 border-brut-black dark:border-mid-border bg-white dark:bg-mid-surface shadow-[0_10px_28px_rgba(0,0,0,0.28)] ${pickerPos.mobile ? "left-2 right-2 bottom-2 top-auto w-auto" : ""}`}
          style={pickerPos.mobile ? undefined : { left: pickerPos.left, top: pickerPos.top }}
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[11px] font-black uppercase tracking-wider text-brut-black/60 dark:text-mid-muted">
              React
            </p>
            <button
              onClick={closePicker}
              className="w-7 h-7 rounded-full border border-brut-black/20 dark:border-mid-border
                         text-brut-black/70 dark:text-mid-text
                         hover:bg-brut-gray/40 dark:hover:bg-white/10
                         hover:text-brut-black dark:hover:text-white
                         flex items-center justify-center"
              aria-label="Close reaction picker"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center gap-1 mb-2 px-1">
            {[
              { id: "recent", label: "Recent" },
              { id: "quick", label: "Quick" },
              { id: "all", label: "All" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActivePickerTab(tab.id)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                  activePickerTab === tab.id
                    ? "bg-brut-black text-white border-brut-black dark:bg-mid-text dark:text-mid-bg dark:border-mid-text"
                    : "border-brut-black/20 dark:border-mid-border text-brut-black/60 dark:text-mid-muted hover:bg-brut-gray/40 dark:hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activePickerTab === "recent" && (
            <div className="mb-1 px-1">
              {recentReactions.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {recentReactions.map((emoji) => (
                    <button
                      key={`recent-${emoji}`}
                      onClick={() => onPickReaction(emoji)}
                      className="w-9 h-9 rounded-full text-xl hover:bg-brut-gray/60 dark:hover:bg-white/10 active:scale-95 transition-all"
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-brut-black/50 dark:text-mid-muted px-1 py-2">
                  No recent reactions yet.
                </p>
              )}
            </div>
          )}

          {activePickerTab === "quick" && (
            <div className="flex flex-wrap gap-1 mb-1 px-1">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onPickReaction(emoji)}
                  className="w-9 h-9 rounded-full text-xl hover:bg-brut-gray/60 dark:hover:bg-white/10 active:scale-95 transition-all"
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {activePickerTab === "all" && (
            <div className="mt-1 pt-1 border-t border-brut-black/10 dark:border-mid-border">
              <EmojiPicker
                onEmojiClick={(data) => onPickReaction(data.emoji)}
                width="100%"
                height={300}
                previewConfig={{ showPreview: false }}
                skinTonesDisabled={false}
                lazyLoadEmojis
                searchPlaceholder="Search emoji"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
