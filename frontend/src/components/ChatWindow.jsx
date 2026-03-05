import React, { useState, useRef, useEffect, useCallback } from "react";
import { Phone, Video, PhoneOff, Eye, EyeOff, Paperclip, Send, X, Upload, Zap, LogOut, Sun, Moon } from "lucide-react";
import MessageBubble from "./MessageBubble";
import MediaViewer from "./MediaViewer";

/**
 * ChatWindow
 *
 * Main chat interface. Features:
 *   - Scrollable message list
 *   - Reply-to quoted messages
 *   - Text input with Enter-to-send
 *   - File/media attachment via button or drag-and-drop
 *   - Voice & video call buttons (WhatsApp-style)
 *   - Status bar showing WebRTC connection state
 *
 * Props:
 *   @param {string}   userName
 *   @param {string}   peerName
 *   @param {string}   roomId
 *   @param {boolean}  isConnected
 *   @param {Array}    messages
 *   @param {function} onSendMessage    - (text, replyTo) => void
 *   @param {function} onSendFile       - (File) => void
 *   @param {function} onStartVoiceCall
 *   @param {function} onStartVideoCall
 *   @param {function} onEndCall
 *   @param {function} onLeave          - leaves the session entirely
 *   @param {boolean}  darkMode
 *   @param {function} onToggleDark
 *   @param {string}   callState        - "idle" | "outgoing-ringing" | ...
 *   @param {string}   callType         - "voice" | "video" | null
 *   @param {string}   status           - "waiting" | "connected" | "peer-left"
 */
export default function ChatWindow({
  userName,
  peerName,
  roomId,
  isConnected,
  messages,
  onSendMessage,
  onSendFile,
  onStartVoiceCall,
  onStartVideoCall,
  onEndCall,
  onLeave,
  darkMode,
  onToggleDark,
  callState,
  callType,
  status,
}) {
  const [text, setText]         = useState("");
  const [replyTo, setReplyTo]   = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);
  const [viewerMedia, setViewerMedia] = useState(null); // { url, fileName, fileType, from, timestamp, viewOnce, onDone? }

  const messagesEndRef = useRef(null);
  const fileInputRef   = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send text message ──────────────────────────────────────────────────────
  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !isConnected) return;
    onSendMessage(trimmed, replyTo ? { id: replyTo.id, from: replyTo.from, text: replyTo.text } : null);
    setText("");
    setReplyTo(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── File selection ─────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendFile(file, viewOnce);
      setViewOnce(false);   // reset to normal after each send
    }
    e.target.value = "";
  };

  // ── Drag-and-drop file ────────────────────────────────────────────────────
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && isConnected) {
      onSendFile(file, viewOnce);
      setViewOnce(false);
    }
  }, [isConnected, onSendFile, viewOnce]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  // ── Status config (Neo Brutalist colours) ─────────────────────────────
  const statusConfig = {
    waiting:     { dot: "bg-brut-yellow", text: "WAITING FOR PEER…",    label: "IDLE" },
    connecting:  { dot: "bg-brut-cyan",   text: "CONNECTING…",           label: "CONNECTING" },
    connected:   { dot: "bg-brut-lime",   text: `CONNECTED — ${(peerName || "PEER").toUpperCase()}`, label: "LIVE" },
    "peer-left": { dot: "bg-brut-pink",   text: "PEER DISCONNECTED",      label: "OFFLINE" },
  };
  const s = statusConfig[status] ?? statusConfig.waiting;

  const ThemeToggleBtn = () => (
    <button
      onClick={onToggleDark}
      title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle theme"
      className="w-10 h-10 sm:w-auto sm:h-auto sm:p-2.5 flex items-center justify-center
                 bg-white/10 border-2 border-white/20 text-white/60
                 active:bg-brut-yellow/20 active:border-brut-yellow/40 active:text-brut-yellow active:scale-95
                 transition-all duration-100 rounded-lg sm:rounded-sm"
    >
      {darkMode ? <Sun size={16} strokeWidth={2.5} /> : <Moon size={16} strokeWidth={2.5} />}
    </button>
  );

  return (
    <div className="flex flex-col bg-brut-bg dark:bg-mid-bg relative"
           style={{
             height: "var(--app-height, 100vh)",
             // When the soft keyboard opens on Android, the browser scrolls
             // the document to bring the focused input into view (offsetTop > 0).
             // --vvp-top tracks visualViewport.offsetTop; translating the
             // container by that amount snaps it flush against the keyboard so
             // there is no gap — exactly how WhatsApp handles it.
             transform: "translateY(var(--vvp-top, 0px))",
             willChange: "transform",
           }}
         onDragOver={handleDragOver}
         onDragLeave={handleDragLeave}>

      {/* ── Top bar ── */}
      <header className="bg-brut-black dark:bg-mid-nav flex items-center justify-between px-1.5 xs:px-2 sm:px-5 py-1.5 xs:py-2 sm:py-3
                         border-b-3 border-brut-black dark:border-mid-border shrink-0"
             style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}>
        {/* Room info */}
        <div className="flex items-center gap-1 xs:gap-1.5 sm:gap-4 min-w-0">
          {/* Leave / back button */}
          <button
            onClick={onLeave}
            title="Leave session"
            aria-label="Leave session"
            className="w-8 h-8 xs:w-9 xs:h-9 sm:w-auto sm:h-auto sm:px-2.5 sm:py-1.5 shrink-0
                       flex items-center justify-center gap-1.5
                       bg-white/10 border border-white/20 text-white/60
                       active:bg-brut-pink/30 active:border-brut-pink/50 active:text-brut-pink active:scale-95
                       transition-all duration-100 rounded-lg sm:rounded-sm"
          >
            <LogOut size={15} strokeWidth={2.5} />
            <span className="hidden sm:inline text-[10px] font-black uppercase tracking-wider">LEAVE</span>
          </button>
          <div className="bg-brut-yellow border-2 sm:border-3 border-brut-yellow px-1 xs:px-1.5 sm:px-3 py-0.5 sm:py-1 shrink-0"
               style={{ boxShadow: "2px 2px 0px #FFE500" }}>
            <span className="font-black text-brut-black text-[9px] xs:text-[10px] sm:text-xs uppercase tracking-wider xs:tracking-widest font-mono">
              #{roomId}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className={`status-dot shrink-0 ${s.dot} border-brut-black`} />
            {/* Full text on sm+, short label on mobile */}
            <span className="hidden sm:block text-xs font-black uppercase tracking-wider text-white/70 truncate">
              {s.text}
            </span>
            <span className="sm:hidden text-[10px] font-black uppercase tracking-wider text-white/70">
              {s.label}
            </span>
          </div>
        </div>

        {/* Call buttons — voice + video (WhatsApp-style) + theme toggle */}
        {isConnected && callState === "idle" && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ThemeToggleBtn />
            <button
              onClick={onStartVoiceCall}
              className="w-10 h-10 sm:w-auto sm:h-auto sm:p-2.5 flex items-center justify-center
                         bg-white/10 border-2 border-white/20 text-white/80
                         active:bg-brut-lime/20 active:border-brut-lime/40 active:scale-95
                         transition-all duration-100 rounded-lg sm:rounded-sm"
              title="Voice Call"
              aria-label="Start voice call"
            >
              <Phone size={18} strokeWidth={2.5} className="sm:w-4 sm:h-4" />
            </button>
            <button
              onClick={onStartVideoCall}
              className="w-10 h-10 sm:w-auto sm:h-auto sm:p-2.5 flex items-center justify-center
                         bg-white/10 border-2 border-white/20 text-white/80
                         active:bg-brut-cyan/20 active:border-brut-cyan/40 active:scale-95
                         transition-all duration-100 rounded-lg sm:rounded-sm"
              title="Video Call"
              aria-label="Start video call"
            >
              <Video size={18} strokeWidth={2.5} className="sm:w-4 sm:h-4" />
            </button>
          </div>
        )}
        {isConnected && callState !== "idle" && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ThemeToggleBtn />
            <button
              onClick={onEndCall}
              className="px-3 py-2 sm:px-3 sm:py-2 text-xs sm:text-sm bg-brut-pink text-white
                         border-2 border-white/20 font-black uppercase tracking-wider
                         flex items-center gap-1.5 shrink-0 active:scale-95 active:opacity-90
                         transition-all duration-100 rounded-lg sm:rounded-sm"
            >
              <PhoneOff size={14} strokeWidth={2.5} />
              <span className="text-[10px] sm:text-sm">END</span>
            </button>
          </div>
        )}
        {!isConnected && <ThemeToggleBtn />}
      </header>

      {/* ── Message list ── */}
      <main className="flex-1 overflow-y-auto overscroll-y-contain px-2.5 sm:px-4 py-3 sm:py-5 space-y-0.5 sm:space-y-1"
            style={{ backgroundImage: "radial-gradient(var(--dot-color) 1px, transparent 1px)", backgroundSize: "18px 18px",
                     WebkitOverflowScrolling: "touch" }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="bg-brut-yellow border-3 border-brut-black w-16 sm:w-20 h-16 sm:h-20
                            flex items-center justify-center"
                 style={{ boxShadow: "4px 4px 0px #0A0A0A" }}>
              <Zap size={30} className="text-brut-black sm:w-[36px] sm:h-[36px]" strokeWidth={2.5} />
            </div>
            <p className="font-black uppercase tracking-wider text-brut-black/40 dark:text-mid-muted text-xs sm:text-sm text-center px-4">
              {isConnected ? "CHANNEL OPEN — SAY SOMETHING" : "WAITING FOR PEER TO JOIN…"}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onReply={setReplyTo}
              onOpenMedia={setViewerMedia}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* ── Drag overlay ── */}
      {isDragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
             style={{ background: "rgba(255,229,0,0.35)", border: "5px dashed #0A0A0A" }}>
          <div className="bg-brut-yellow border-3 border-brut-black px-8 py-4"
               style={{ boxShadow: "6px 6px 0px #0A0A0A" }}>
            <p className="font-black text-2xl uppercase tracking-wider text-brut-black flex items-center gap-3">
              <Upload size={26} strokeWidth={2.5} /> DROP TO SEND FILE
            </p>
          </div>
        </div>
      )}

      {/* ── Reply preview bar ── */}
      {replyTo && (
        <div className="bg-brut-black dark:bg-mid-surface2 border-t-3 border-brut-black dark:border-mid-border
                        px-3 sm:px-4 py-2.5 flex items-center justify-between animate-slide-up shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 mr-2">
            <div className="w-0.5 h-8 bg-brut-yellow dark:bg-mid-muted shrink-0 rounded-full" />
            <div className="text-xs font-mono min-w-0">
              <span className="font-black uppercase tracking-wide text-brut-yellow dark:text-mid-muted">{replyTo.from}: </span>
              <span className="text-white/70 dark:text-mid-text/60 truncate max-w-[200px] sm:max-w-[280px] inline-block align-bottom">
                {replyTo.text || "Attachment"}
              </span>
            </div>
          </div>
          <button onClick={() => setReplyTo(null)}
                  className="font-black text-white/60 hover:text-brut-pink ml-3 transition-colors p-1"
                  aria-label="Cancel reply">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ── Input bar ── */}
      <footer className="bg-brut-bg dark:bg-mid-nav border-t-3 border-brut-black dark:border-mid-border px-1.5 xs:px-2 sm:px-4 py-1.5 xs:py-2 sm:py-3 shrink-0"
              style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-end gap-0.5 xs:gap-1 sm:gap-2">

          {/* View-once toggle */}
          <button
            onClick={() => setViewOnce((v) => !v)}
            disabled={!isConnected}
            title={viewOnce ? "VIEW ONCE ON — next file disappears after viewing" : "Enable View Once for next file"}
            className={`w-9 h-9 xs:w-10 xs:h-10 sm:w-auto sm:h-auto sm:p-2.5 shrink-0 flex items-center justify-center
                        border-2 sm:border-3 border-brut-black dark:border-mid-border font-black rounded-lg sm:rounded-none
                        transition-all duration-100 disabled:opacity-30 active:scale-95
                        ${viewOnce
                          ? "bg-brut-pink text-white"
                          : "bg-white dark:bg-mid-surface text-brut-black/40 dark:text-mid-text/50 active:text-brut-black active:bg-brut-gray dark:active:bg-mid-surface2"}`}
            style={viewOnce ? { boxShadow: "2px 2px 0px #0A0A0A" } : {}}
            aria-label={viewOnce ? "View Once enabled" : "Enable View Once"}
          >
            {viewOnce ? <EyeOff size={16} strokeWidth={2.5} /> : <Eye size={16} strokeWidth={2.5} />}
          </button>

          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected}
            className="w-9 h-9 xs:w-10 xs:h-10 sm:w-auto sm:h-auto sm:p-2.5 flex items-center justify-center
                       bg-white dark:bg-mid-surface text-brut-black dark:text-mid-text
                       border-2 sm:border-3 border-brut-black dark:border-mid-border rounded-lg sm:rounded-none
                       disabled:opacity-40 shrink-0 active:bg-brut-gray dark:active:bg-mid-surface2 active:scale-95
                       transition-all duration-100"
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip size={17} strokeWidth={2.5} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept="*/*"
          />

          {/* Text input */}
          <textarea
            className="input-field resize-none font-medium leading-relaxed flex-1
                       overflow-y-auto font-sans"
            style={{
              maxHeight: "5rem",
              minHeight: "36px",
              // iOS Safari zooms in whenever a focused input has font-size < 16px.
              // That zoom shifts the layout, triggering the very gap bug we're
              // fixing. Force 16px here — it overrides Tailwind's text-sm (14px)
              // regardless of specificity order.
              fontSize: "16px",
            }}
            rows={1}
            placeholder={isConnected ? "Message\u2026" : "Waiting for peer\u2026"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
            inputMode="text"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!isConnected || !text.trim()}
            className="btn-primary w-9 h-9 xs:w-11 xs:h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-3 shrink-0
                       disabled:opacity-40 flex items-center justify-center gap-1.5
                       rounded-lg sm:rounded-none !transition-all !duration-100 active:scale-95"
            title="Send (Enter)"
            aria-label="Send message"
          >
            <Send size={18} strokeWidth={2.5} className="sm:w-4 sm:h-4" />
          </button>
        </div>
        {/* Keyboard hint — desktop only */}
        <p className="hidden sm:block text-[10px] font-mono font-bold uppercase tracking-widest
                      text-brut-black/30 dark:text-mid-muted mt-1.5 text-center">
          SHIFT+ENTER = NEW LINE · ENTER = SEND · DRAG &amp; DROP FILES
          {viewOnce && <span className="ml-2 text-brut-pink">· VIEW ONCE ACTIVE</span>}
        </p>
        {/* Mobile: view-once indicator only */}
        {viewOnce && (
          <p className="sm:hidden text-[10px] font-mono font-black uppercase tracking-widest
                        text-brut-pink mt-1 text-center">VIEW ONCE ACTIVE</p>
        )}
      </footer>

      {/* ── Media viewer overlay ── */}
      {viewerMedia && (
        <MediaViewer
          media={viewerMedia}
          onClose={() => {
            // Destroy the blob when viewer is dismissed — WhatsApp model:
            // the peer sees the media for as long as the viewer is open,
            // then it's gone the moment they close it.
            if (viewerMedia?.viewOnce) viewerMedia.onDone?.();
            setViewerMedia(null);
          }}
        />
      )}
    </div>
  );
}
