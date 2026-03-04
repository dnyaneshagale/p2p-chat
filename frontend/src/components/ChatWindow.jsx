import React, { useState, useRef, useEffect, useCallback } from "react";
import { Video, PhoneOff, Eye, EyeOff, Paperclip, Send, X, Upload, Zap } from "lucide-react";
import MessageBubble from "./MessageBubble";
import VideoCall from "./VideoCall";
import MediaViewer from "./MediaViewer";

/**
 * ChatWindow
 *
 * Main chat interface. Features:
 *   - Scrollable message list
 *   - Reply-to quoted messages
 *   - Text input with Enter-to-send
 *   - File/media attachment via button or drag-and-drop
 *   - Video call control (start/end/mute/camera toggle)
 *   - Status bar showing WebRTC connection state
 *
 * Props:
 *   @param {string}   userName         - Local user's display name
 *   @param {string}   peerName         - Remote peer's display name (from signaling)
 *   @param {string}   roomId
 *   @param {boolean}  isConnected      - WebRTC data channel open
 *   @param {Array}    messages         - Array of message objects
 *   @param {function} onSendMessage    - (text, replyTo) => void
 *   @param {function} onSendFile       - (File) => void
 *   @param {function} onStartVideoCall
 *   @param {function} onEndVideoCall
 *   @param {function} onToggleMic
 *   @param {function} onToggleCamera
 *   @param {boolean}  isVideoCallActive
 *   @param {boolean}  isMicOn
 *   @param {boolean}  isCameraOn
 *   @param {object}   localStreamRef   - Ref to local MediaStream
 *   @param {MediaStream|null} remoteStream
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
  onStartVideoCall,
  onEndVideoCall,
  onToggleMic,
  onToggleCamera,
  isVideoCallActive,
  isMicOn,
  isCameraOn,
  localStreamRef,
  remoteStream,
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

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-brut-bg relative"
         onDrop={handleDrop}
         onDragOver={handleDragOver}
         onDragLeave={handleDragLeave}>

      {/* ── Top bar ── */}
      <header className="bg-brut-black flex items-center justify-between px-3 sm:px-5 py-3
                         border-b-3 border-brut-black shrink-0">
        {/* Room info */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="bg-brut-yellow border-3 border-brut-yellow px-2 sm:px-3 py-1 shrink-0"
               style={{ boxShadow: "3px 3px 0px #FFE500" }}>
            <span className="font-black text-brut-black text-xs uppercase tracking-widest font-mono">
              #{roomId}
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`status-dot shrink-0 ${s.dot} border-brut-black`} />
            {/* Full text on sm+, short label on mobile */}
            <span className="hidden sm:block text-xs font-black uppercase tracking-wider text-white/70 truncate">
              {s.text}
            </span>
            <span className="sm:hidden text-xs font-black uppercase tracking-wider text-white/70">
              {s.label}
            </span>
          </div>
        </div>

        {/* Video call button — icon-only on mobile, labelled on sm+ */}
        {isConnected && (
          <button
            onClick={isVideoCallActive ? onEndVideoCall : onStartVideoCall}
            className={`flex items-center gap-1.5 shrink-0 px-3 sm:px-4 py-2 text-sm ${
              isVideoCallActive ? "btn-danger" : "btn-primary"}`}
          >
            {isVideoCallActive
              ? <><PhoneOff size={14} strokeWidth={2.5} /><span className="hidden sm:inline"> END CALL</span></>
              : <><Video size={14} strokeWidth={2.5} /><span className="hidden sm:inline"> VIDEO CALL</span></>}
          </button>
        )}
      </header>

      {/* ── Message list ── */}
      <main className="flex-1 overflow-y-auto px-4 py-5 space-y-1"
            style={{ backgroundImage: "radial-gradient(#0A0A0A11 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="bg-brut-yellow border-3 border-brut-black w-20 h-20
                            flex items-center justify-center"
                 style={{ boxShadow: "5px 5px 0px #0A0A0A" }}>
              <Zap size={36} className="text-brut-black" strokeWidth={2.5} />
            </div>
            <p className="font-black uppercase tracking-wider text-brut-black/40 text-sm">
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
        <div className="bg-brut-yellow border-t-3 border-brut-black px-3 sm:px-4 py-2.5
                        flex items-center justify-between animate-slide-up shrink-0">
          <div className="text-xs font-mono min-w-0 mr-2">
            <span className="font-black uppercase tracking-wide">{replyTo.from}: </span>
            <span className="opacity-70 truncate max-w-[200px] sm:max-w-[280px] inline-block align-bottom">
              {replyTo.text || "Attachment"}
            </span>
          </div>
          <button onClick={() => setReplyTo(null)}
                  className="font-black text-brut-black hover:text-brut-pink ml-3 transition-colors p-1"
                  aria-label="Cancel reply">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ── Input bar ── */}
      <footer className="bg-brut-bg border-t-3 border-brut-black px-3 sm:px-4 py-3 shrink-0"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-end gap-1.5 sm:gap-2">

          {/* View-once toggle */}
          <button
            onClick={() => setViewOnce((v) => !v)}
            disabled={!isConnected}
            title={viewOnce ? "VIEW ONCE ON — next file disappears after viewing" : "Enable View Once for next file"}
            className={`p-2.5 shrink-0 border-3 border-brut-black font-black
                        transition-all disabled:opacity-30
                        ${viewOnce
                          ? "bg-brut-pink text-white"  // active = pink
                          : "bg-white text-brut-black/40 hover:text-brut-black"}`}
            style={viewOnce ? { boxShadow: "3px 3px 0px #0A0A0A" } : {}}
            aria-label={viewOnce ? "View Once enabled" : "Enable View Once"}
          >
            {viewOnce ? <EyeOff size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2.5} />}
          </button>

          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected}
            className="btn-ghost p-2.5 disabled:opacity-40 shrink-0"
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip size={18} strokeWidth={2.5} />
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
            className="input-field resize-none text-sm font-medium leading-relaxed flex-1
                       overflow-y-auto font-sans"
            style={{ maxHeight: "7rem", minHeight: "44px" }}
            rows={1}
            placeholder={isConnected ? "Message…" : "Waiting for peer…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!isConnected || !text.trim()}
            className="btn-primary px-4 py-3 shrink-0 disabled:opacity-40 flex items-center gap-1.5"
            title="Send (Enter)"
            aria-label="Send message"
          >
            <Send size={16} strokeWidth={2.5} />
          </button>
        </div>
        {/* Keyboard hint — desktop only */}
        <p className="hidden sm:block text-[10px] font-mono font-bold uppercase tracking-widest
                      text-brut-black/30 mt-1.5 text-center">
          SHIFT+ENTER = NEW LINE · ENTER = SEND · DRAG &amp; DROP FILES
          {viewOnce && <span className="ml-2 text-brut-pink">· VIEW ONCE ACTIVE</span>}
        </p>
        {/* Mobile: view-once indicator only */}
        {viewOnce && (
          <p className="sm:hidden text-[10px] font-mono font-black uppercase tracking-widest
                        text-brut-pink mt-1 text-center">VIEW ONCE ACTIVE</p>
        )}
      </footer>

      {/* ── Video call overlay ── */}
      {isVideoCallActive && (
        <VideoCall
          localStream={localStreamRef.current}
          remoteStream={remoteStream}
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          onToggleMic={onToggleMic}
          onToggleCamera={onToggleCamera}
          onEndCall={onEndVideoCall}
          peerName={peerName}
        />
      )}

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
