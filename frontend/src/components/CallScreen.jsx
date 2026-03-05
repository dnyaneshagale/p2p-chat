import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  User, Mic, MicOff, Camera, VideoOff, PhoneOff,
  Video, ArrowLeftRight,
} from "lucide-react";

/**
 * CallScreen — WhatsApp-style full-screen call overlay.
 * Handles both voice calls (avatar + waveform) and video calls (camera PiP).
 * Includes live call timer, controls bar, and connecting/ended states.
 *
 * Video UX (WhatsApp-style):
 *   - Full screen shows remote video by default, local in PiP
 *   - Tap PiP to swap: your video goes full-screen, remote goes to PiP
 *   - Local self-view is mirrored (like a mirror) — peers see you un-mirrored
 */
export default function CallScreen({
  callType = "voice",          // "voice" | "video"
  callState = "active",        // "outgoing-ringing" | "connecting" | "active" | "ended"
  callStartTime,
  localStream,
  remoteStream,
  isMicOn,
  isCameraOn,
  onToggleMic,
  onToggleCamera,
  onEndCall,
  onSwitchToVideo,
  peerName = "Peer",
}) {
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [isSwapped, setIsSwapped] = useState(false); // false = remote fullscreen, true = local fullscreen
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  const isVideo = callType === "video";
  const isActive = callState === "active";

  // Detect whether remoteStream actually has live video tracks
  useEffect(() => {
    if (!remoteStream) { setHasRemoteVideo(false); return; }

    const checkVideo = () => {
      const vt = remoteStream.getVideoTracks();
      const hasLive = vt.some((t) => t.readyState === "live");
      setHasRemoteVideo(hasLive);
    };
    checkVideo();

    // Listen to track add/remove/unmute events on the stream
    const onTrackEvent = () => checkVideo();
    remoteStream.addEventListener("addtrack", onTrackEvent);
    remoteStream.addEventListener("removetrack", onTrackEvent);
    // Also poll for tracks that unmute after stream was created
    remoteStream.getVideoTracks().forEach((t) => {
      t.addEventListener("unmute", onTrackEvent);
      t.addEventListener("ended", onTrackEvent);
    });
    return () => {
      remoteStream.removeEventListener("addtrack", onTrackEvent);
      remoteStream.removeEventListener("removetrack", onTrackEvent);
      remoteStream.getVideoTracks().forEach((t) => {
        t.removeEventListener("unmute", onTrackEvent);
        t.removeEventListener("ended", onTrackEvent);
      });
    };
  }, [remoteStream]);

  // Attach local video — re-run when swap state changes (React may remount the element)
  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStream) {
      el.srcObject = localStream;
      el.play().catch(() => {});
    }
  }, [localStream, isSwapped]);

  // Attach remote video — video tracks only.
  // The full remoteStream (including audio) is given to the dedicated <audio> element.
  // Passing audio to the <video> element as well creates a dual-audio conflict on
  // Safari/iOS where the browser may suppress one or both audio outputs.
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    if (remoteStream) {
      const vTracks = remoteStream.getVideoTracks();
      const videoOnly = vTracks.length ? new MediaStream(vTracks) : null;
      el.srcObject = videoOnly;
      if (videoOnly) el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [remoteStream, isSwapped]);

  // Hidden audio element — guarantees remote audio always plays (voice & video)
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (el) {
      el.srcObject = remoteStream || null;
      if (remoteStream) el.play().catch(() => {});
    }
  }, [remoteStream]);

  // Call timer
  useEffect(() => {
    if (!callStartTime || !isActive) { setElapsed(0); return; }
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - callStartTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [callStartTime, isActive]);

  const formatTime = useCallback((s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }, []);

  // Status text
  const statusText = {
    "outgoing-ringing": "CALLING…",
    "connecting":       "CONNECTING…",
    "active":           formatTime(elapsed),
    "ended":            "CALL ENDED",
  }[callState] || "";

  // Status color
  const statusColor = {
    "outgoing-ringing": "text-brut-yellow",
    "connecting":       "text-brut-cyan",
    "active":           "text-brut-lime",
    "ended":            "text-brut-pink",
  }[callState] || "text-white/50";

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in overflow-hidden select-none"
         style={{ background: "#0A0A0A", height: "var(--app-height, 100vh)" }}>

      {/* ── Top bar ── */}
      <div className="relative z-10 px-2 xs:px-3 sm:px-5 py-2 xs:py-2.5 sm:py-4 flex items-center justify-between shrink-0"
           style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%)",
                    paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-3">
          {/* Encrypted badge */}
          <div className="flex items-center gap-1 xs:gap-1.5 bg-white/10 border border-white/10
                          px-2 xs:px-3 py-0.5 xs:py-1 rounded-full">
            <span className="w-1.5 xs:w-2 h-1.5 xs:h-2 rounded-full bg-brut-lime animate-pulse" />
            <span className="text-[8px] xs:text-[10px] font-bold uppercase tracking-widest text-white/50">
              E2E ENCRYPTED
            </span>
          </div>
        </div>

        {/* Timer / Status */}
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-brut-lime animate-blink" />
          )}
          <span className={`font-mono text-sm font-black tracking-wider ${statusColor}`}>
            {statusText}
          </span>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">

        {/* Hidden audio — guarantees remote audio plays for both voice & video */}
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

        {/* Video call — fullscreen video */}
        {isVideo && (isSwapped ? localStream : remoteStream) ? (
          <>
            {isSwapped ? (
              /* Swapped: local video fills screen (mirrored, like WhatsApp) */
              <video ref={localVideoRef} autoPlay playsInline muted
                     className="w-full h-full object-contain bg-black"
                     style={{
                       display: isCameraOn ? undefined : "none",
                       transform: "scaleX(-1)",
                     }} />
            ) : (
              /* Default: remote video fills screen */
              <video ref={remoteVideoRef} autoPlay playsInline
                     className="w-full h-full object-contain bg-black"
                     style={{ display: hasRemoteVideo ? undefined : "none" }} />
            )}
            {/* Show avatar when no video to display */}
            {(isSwapped && !isCameraOn) && (
              <VoiceAvatar peerName="YOU" callState={callState} isVideo />
            )}
            {(!isSwapped && !hasRemoteVideo) && (
              <VoiceAvatar peerName={peerName} callState={callState} isVideo />
            )}
          </>
        ) : isVideo ? (
          <VoiceAvatar peerName={isSwapped ? "YOU" : peerName} callState={callState} isVideo />
        ) : (
          /* Voice call — always show avatar */
          <VoiceAvatar peerName={peerName} callState={callState} />
        )}

        {/* PiP — tap to swap (WhatsApp-style) */}
        {isVideo && (isSwapped ? remoteStream : localStream) && (
          <button
            onClick={() => setIsSwapped((v) => !v)}
            className="absolute bottom-24 xs:bottom-28 right-2 xs:right-3 z-20
                       w-[100px] h-[76px] xs:w-[130px] xs:h-[100px] sm:w-44 sm:h-32
                       transition-all duration-300 ease-out
                       active:scale-95 group/pip"
            aria-label={isSwapped ? "Show remote video fullscreen" : "Show your video fullscreen"}
          >
            <div className="relative w-full h-full rounded-2xl overflow-hidden
                            border-2 border-white/30 shadow-lg"
                 style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>

              {isSwapped ? (
                /* Swapped PiP: show remote */
                <>
                  <video ref={remoteVideoRef} autoPlay playsInline
                         className="w-full h-full object-cover" />
                  {!hasRemoteVideo && (
                    <div className="absolute inset-0 bg-brut-black/90 flex items-center justify-center">
                      <User size={24} className="text-white/40" />
                    </div>
                  )}
                </>
              ) : (
                /* Default PiP: show local (mirrored) */
                <>
                  <video ref={localVideoRef} autoPlay playsInline muted
                         className="w-full h-full object-cover"
                         style={{ transform: "scaleX(-1)" }} />
                  {!isCameraOn && (
                    <div className="absolute inset-0 bg-brut-black/90 flex items-center justify-center">
                      <VideoOff size={20} className="text-white/40" />
                    </div>
                  )}
                </>
              )}

              {/* Swap hint icon */}
              <div className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-black/60
                              flex items-center justify-center
                              opacity-60 group-hover/pip:opacity-100 transition-opacity">
                <ArrowLeftRight size={11} className="text-white/80" />
              </div>

              {/* Label: YOU or peer name */}
              <div className="absolute top-1 left-1.5 px-1.5 py-0.5 rounded bg-black/50">
                <span className="text-[8px] font-black uppercase tracking-wider text-white/70">
                  {isSwapped ? peerName : "YOU"}
                </span>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* ── Controls bar ── */}
      <div className="relative z-10 px-2 xs:px-3 sm:px-4 py-2 xs:py-3 sm:py-6 flex items-center justify-center gap-3 xs:gap-5 sm:gap-6 shrink-0"
           style={{
             paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
             background: "linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)",
           }}>

        {/* Mic toggle */}
        <CallControlBtn
          active={isMicOn}
          onClick={onToggleMic}
          activeIcon={<Mic size={22} strokeWidth={2} />}
          inactiveIcon={<MicOff size={22} strokeWidth={2} />}
          label={isMicOn ? "Mute" : "Unmute"}
          disabled={callState === "ended"}
        />

        {/* Camera toggle — video calls only */}
        {isVideo && (
          <CallControlBtn
            active={isCameraOn}
            onClick={onToggleCamera}
            activeIcon={<Camera size={22} strokeWidth={2} />}
            inactiveIcon={<VideoOff size={22} strokeWidth={2} />}
            label={isCameraOn ? "Camera" : "Camera Off"}
            disabled={callState === "ended"}
          />
        )}

        {/* Switch to video — voice calls only */}
        {!isVideo && isActive && onSwitchToVideo && (
          <CallControlBtn
            active
            onClick={onSwitchToVideo}
            activeIcon={<Video size={22} strokeWidth={2} />}
            inactiveIcon={<Video size={22} strokeWidth={2} />}
            label="Video"
          />
        )}

        {/* End call */}
        <button
          onClick={onEndCall}
          disabled={callState === "ended"}
          className="w-[52px] h-[52px] xs:w-[60px] xs:h-[60px] sm:w-16 sm:h-16 rounded-full bg-brut-pink border-2 border-white/10
                     flex items-center justify-center transition-all duration-150
                     hover:scale-110 active:scale-90 disabled:opacity-50
                     disabled:hover:scale-100"
          style={{ boxShadow: "0 4px 20px rgba(255,45,120,0.4)" }}
        >
          <PhoneOff size={24} strokeWidth={2} className="text-white sm:w-[26px] sm:h-[26px]" />
        </button>
      </div>
    </div>
  );
}

/**
 * Voice call avatar with animated rings.
 */
function VoiceAvatar({ peerName, callState, isVideo = false }) {
  const isRinging = callState === "outgoing-ringing" || callState === "connecting";
  const isEnded = callState === "ended";

  return (
    <div className="flex flex-col items-center gap-5 xs:gap-8">
      {/* Avatar with rings */}
      <div className="relative">
        {isRinging && (
          <>
            <div className="absolute inset-0 w-24 h-24 xs:w-36 xs:h-36 rounded-full animate-call-ring-1 border-2 border-white/20" />
            <div className="absolute -inset-5 w-34 h-34 xs:w-46 xs:h-46 rounded-full animate-call-ring-2 border border-white/10" />
          </>
        )}

        <div className={`relative w-24 h-24 xs:w-36 xs:h-36 rounded-full border-3 flex items-center justify-center
                        transition-all duration-500
                        ${isEnded
                          ? "border-brut-pink/50 bg-brut-pink/5"
                          : isVideo
                            ? "border-brut-cyan/50 bg-brut-cyan/5"
                            : "border-brut-lime/50 bg-brut-lime/5"}`}>
          <User size={44} strokeWidth={1.2}
                className={`xs:!w-[60px] xs:!h-[60px] transition-colors duration-500
                           ${isEnded ? "text-brut-pink/60" : "text-white/60"}`} />
        </div>

        {/* Active call glow */}
        {callState === "active" && (
          <div className="absolute inset-0 w-24 h-24 xs:w-36 xs:h-36 rounded-full animate-pulse"
               style={{
                 boxShadow: isVideo
                   ? "0 0 60px rgba(0,207,255,0.15)"
                   : "0 0 60px rgba(170,255,0,0.15)",
               }} />
        )}
      </div>

      {/* Name */}
      <div className="text-center">
        <h2 className="text-white font-black text-xl xs:text-2xl sm:text-3xl uppercase tracking-wider">
          {peerName}
        </h2>
        <p className={`text-xs xs:text-sm font-mono mt-1.5 xs:mt-2 uppercase tracking-widest
                      ${isEnded ? "text-brut-pink/60" : "text-white/30"}`}>
          {isVideo ? "VIDEO CALL" : "VOICE CALL"}
        </p>
      </div>
    </div>
  );
}

/**
 * Circular call control button.
 */
function CallControlBtn({ active, onClick, activeIcon, inactiveIcon, label, disabled }) {
  return (
    <div className="flex flex-col items-center gap-1 xs:gap-1.5 sm:gap-2">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-[44px] h-[44px] xs:w-[52px] xs:h-[52px] sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center
                   transition-all duration-150 hover:scale-105 active:scale-90
                   disabled:opacity-40 disabled:hover:scale-100
                   ${active
                     ? "bg-white/15 border-white/20 text-white"
                     : "bg-white/30 border-white/30 text-white"}`}
      >
        {active ? activeIcon : inactiveIcon}
      </button>
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
        {label}
      </span>
    </div>
  );
}
