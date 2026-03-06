import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  User, Mic, MicOff, Camera, VideoOff, PhoneOff,
  Video, ArrowLeftRight, Wifi, WifiOff,
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
  peerConnectionRef,           // ref to RTCPeerConnection (for stats)
}) {
  // Four dedicated refs — one per physical <video> element.
  // Using a single ref for two elements (main + PiP) causes React to point it at
  // whichever element mounted last, losing the other entirely and resetting the
  // decoder on every swap. Dedicated refs eliminate that decoder reset.
  const localMainRef   = useRef(null);  // local video when fullscreen (swapped)
  const localPipRef    = useRef(null);  // local video in PiP corner
  const remoteMainRef  = useRef(null);  // remote video when fullscreen (default)
  const remotePipRef   = useRef(null);  // remote video in PiP corner (swapped)
  const remoteAudioRef = useRef(null);

  const [elapsed, setElapsed]           = useState(0);
  const [isSwapped, setIsSwapped]       = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  // Auto-hide controls after 4 s of inactivity (WhatsApp / FaceTime behaviour)
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef(null);
  // Frame freeze watchdog — detects when no new frame arrives for > 250 ms
  const lastFrameRef  = useRef(Date.now());
  const [isFrozen, setIsFrozen]         = useState(false);
  // Connection quality from RTT (candidate-pair stats)
  const [connQuality, setConnQuality]   = useState(null); // "good"|"ok"|"poor"|null
  // Remote speaking indicator (audio level from inbound-rtp stats)
  const [isSpeaking, setIsSpeaking]     = useState(false);
  const statsTimerRef = useRef(null);
  const remoteBgRef = useRef(null);       // blurred bg layer for portrait mobile video
  const [isPortraitRemote, setIsPortraitRemote] = useState(false);

  const isVideo = callType === "video";
  const isActive = callState === "active";

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    // Only auto-hide during an active video call
    if (isActive && isVideo) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    }
  }, [isActive, isVideo]);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimerRef.current);
  }, [resetHideTimer]);

  // Always show controls for non-video or non-active states
  useEffect(() => {
    if (!isActive || !isVideo) setControlsVisible(true);
  }, [isActive, isVideo]);

  // ── Detect live remote video tracks ──────────────────────────────────────
  // Check readyState === "live" AND !muted — tracks can exist but have no frames
  // yet (muted=true) which would show a black screen. Waiting for unmute avoids
  // flashing the avatar on/off as the first keyframe arrives.
  useEffect(() => {
    if (!remoteStream) { setHasRemoteVideo(false); return; }

    const checkVideo = () => {
      const vt = remoteStream.getVideoTracks();
      const hasLive = vt.some((t) => t.readyState === "live" && !t.muted);
      setHasRemoteVideo(hasLive);
    };
    checkVideo();

    const onTrackEvent = () => checkVideo();
    remoteStream.addEventListener("addtrack", onTrackEvent);
    remoteStream.addEventListener("removetrack", onTrackEvent);
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

  // ── Attach local video (VIDEO-ONLY stream) to both local elements ────────
  // VIDEO-ONLY stream is critical: if the audio track is included, Chromium
  // aligns video frame presentation to audio timestamps — the camera preview
  // is held back by exactly the native AEC/RNNoise processing latency even
  // with muted=true on the element. Stripping audio eliminates that delay.
  useEffect(() => {
    const videoOnlyStream = localStream
      ? (localStream.getVideoTracks().length > 0
          ? new MediaStream(localStream.getVideoTracks())
          : localStream)
      : null;
    [localMainRef, localPipRef].forEach((ref) => {
      const el = ref.current;
      if (!el) return;
      if (el.srcObject !== videoOnlyStream) {
        el.srcObject = videoOnlyStream;
        if (videoOnlyStream) el.play().catch(() => {});
      }
    });
  }, [localStream]);

  // ── Attach remote video to both remote elements ───────────────────────────
  // Full stream (audio+video) on the main element for A/V sync.
  // PiP element gets video-only to prevent dual audio.
  // Guard against reassigning the same object — that forces a keyframe seek.
  useEffect(() => {
    const mainStream  = isVideo ? remoteStream : null;
    const pipStream   = isVideo && remoteStream
      ? new MediaStream(remoteStream.getVideoTracks())
      : null;

    const mainEl = remoteMainRef.current;
    if (mainEl && mainEl.srcObject !== mainStream) {
      mainEl.srcObject = mainStream;
      if (mainStream) mainEl.play().catch(() => {});
    }
    const pipEl  = remotePipRef.current;
    // For PiP we always reassign because it's a freshly constructed MediaStream object
    if (pipEl) {
      pipEl.srcObject = pipStream;
      if (pipStream) pipEl.play().catch(() => {});
    }
    // Background blur layer shares the same main stream (portrait mobile calls)
    const bgEl = remoteBgRef.current;
    if (bgEl && bgEl.srcObject !== mainStream) {
      bgEl.srcObject = mainStream;
      if (mainStream) bgEl.play().catch(() => {});
    }
  }, [remoteStream, isVideo]);

  // ── requestVideoFrameCallback — feed the compositor every frame on time ───
  // Runs on the fullscreen remote element (main). Also updates lastFrameRef
  // so the freeze watchdog knows frames are still arriving.
  useEffect(() => {
    const el = remoteMainRef.current;
    if (!el || !remoteStream || !isVideo) return;
    if (typeof el.requestVideoFrameCallback !== "function") return;
    let rafId;
    let active = true;
    const onFrame = () => {
      if (!active) return;
      lastFrameRef.current = Date.now();
      setIsFrozen(false);
      rafId = el.requestVideoFrameCallback(onFrame);
    };
    rafId = el.requestVideoFrameCallback(onFrame);
    return () => {
      active = false;
      if (rafId !== undefined) { try { el.cancelVideoFrameCallback(rafId); } catch (_) {} }
    };
  }, [remoteStream, isVideo]);

  // ── Frame freeze watchdog ─────────────────────────────────────────────────
  // If no frame arrives for 250 ms we flag isFrozen. The UI shows a subtle
  // "Poor connection…" overlay and blurs the stale frame slightly, preventing
  // jarring block artifacts from being visible (same trick as WhatsApp/FaceTime).
  useEffect(() => {
    if (!isVideo || !isActive) { setIsFrozen(false); return; }
    lastFrameRef.current = Date.now();
    const id = setInterval(() => {
      setIsFrozen(Date.now() - lastFrameRef.current > 250);
    }, 100);
    return () => clearInterval(id);
  }, [isVideo, isActive]);

  // ── Audio element — voice calls only ─────────────────────────────────────
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    const stream = !isVideo ? remoteStream : null;
    if (el.srcObject !== (stream ?? null)) {
      el.srcObject = stream ?? null;
      if (stream) el.play().catch(() => {});
    }
  }, [remoteStream, isVideo]);

  // ── Stats loop — connection quality (RTT) + speaking indicator ───────────
  // Polls pc.getStats() every 2 s when the call is active.
  // RTT comes from the nominated candidate-pair; audio level from inbound-rtp.
  useEffect(() => {
    if (!isActive || !peerConnectionRef) {
      setConnQuality(null);
      setIsSpeaking(false);
      return;
    }
    const sampleStats = async () => {
      const pc = peerConnectionRef.current;
      if (!pc || pc.connectionState === "closed") return;
      try {
        const statsMap = await pc.getStats();
        let rtt = null;
        let audioLevel = 0;
        statsMap.forEach((r) => {
          if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) {
            if (r.currentRoundTripTime != null) rtt = r.currentRoundTripTime;
          }
          if (r.type === "inbound-rtp" && r.kind === "audio") {
            if (r.audioLevel != null) audioLevel = r.audioLevel;
          }
        });
        if (rtt !== null) {
          setConnQuality(rtt < 0.15 ? "good" : rtt < 0.4 ? "ok" : "poor");
        }
        setIsSpeaking(audioLevel > 0.02);
      } catch (_) {}
    };
    sampleStats();
    statsTimerRef.current = setInterval(sampleStats, 2000);
    return () => clearInterval(statsTimerRef.current);
  }, [isActive, peerConnectionRef]);
  // Clear quality badge when call ends
  useEffect(() => {
    if (!isActive) { setConnQuality(null); setIsSpeaking(false); }
  }, [isActive]);

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

  // Status text / color
  const statusColor = {
    "outgoing-ringing": "text-brut-yellow",
    "connecting":       "text-brut-cyan",
    "active":           "text-brut-lime",
    "ended":            "text-brut-pink",
  }[callState] || "text-white/50";

  // GPU compositing style — applied to every video element.
  // translateZ(0) promotes the element to its own compositor layer, preventing
  // the main-thread layout from blocking frame presentation (same as Google Meet).
  const gpuStyle = { transform: "translateZ(0)", willChange: "transform" };

  // ── Dynamic object-fit ────────────────────────────────────────────────────
  // Compares the video's intrinsic pixel ratio against the container ratio.
  // Wide video in a tall container → contain (black bars, no cropping).
  // Tall video in a wide container → cover (fills edge to edge).
  // Called on loadedmetadata AND on every container resize via ResizeObserver,
  // so it self-corrects when the window is resized or rotated.
  const fitVideo = useCallback((video) => {
    if (!video || !video.videoWidth) return;
    const container = video.parentElement;
    if (!container) return;
    const vr = video.videoWidth / video.videoHeight;
    const cr = container.clientWidth  / container.clientHeight;
    // Portrait video (phones send 9:16) — always contain, never crop regardless of container ratio
    if (vr < 1) { video.style.objectFit = "contain"; return; }
    // Landscape: contain when video is wider than container, cover otherwise
    video.style.objectFit = vr > cr ? "contain" : "cover";
  }, []);

  useEffect(() => {
    const targets = [localMainRef.current, remoteMainRef.current].filter(Boolean);
    if (!targets.length) return;
    const observer = new ResizeObserver(() => targets.forEach(fitVideo));
    // Both fullscreen videos share the same parent div — observing it once covers both.
    const container = targets[0].parentElement;
    if (container) observer.observe(container);
    return () => observer.disconnect();
  }, [fitVideo]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden select-none animate-fade-in"
      style={{ background: "#0A0A0A" }}
      onClick={resetHideTimer}
    >
      {/* ── Full-screen video layer (always rendered, never unmounted) ── */}
      <div className="absolute inset-0">
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

        {/* Local — fullscreen (visible when swapped) */}
        <video
          ref={localMainRef} autoPlay playsInline muted preload="auto" disablePictureInPicture
          className="absolute inset-0 w-full h-full object-contain bg-black"
          onLoadedMetadata={(e) => fitVideo(e.target)}
          style={{
            ...gpuStyle,
            transform: "translateZ(0) scaleX(-1)",
            visibility: (isVideo && isSwapped) ? "visible" : "hidden",
          }}
        />

        {/* Blurred background — fills black bars when remote is portrait (mobile) */}
        <video
          ref={remoteBgRef} autoPlay playsInline muted preload="auto" disablePictureInPicture
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{
            transform: "translateZ(0) scale(1.08)", // scale slightly to hide blur fringe at edges
            willChange: "transform",
            filter: "blur(18px)",
            opacity: 0.35,
            visibility: (isPortraitRemote && isVideo && !isSwapped && hasRemoteVideo) ? "visible" : "hidden",
          }}
        />

        {/* Remote — fullscreen (visible when NOT swapped) */}
        <video
          ref={remoteMainRef} autoPlay playsInline preload="auto" disablePictureInPicture
          onCanPlay={() => setHasRemoteVideo(true)}
          onLoadedData={() => setHasRemoteVideo(true)}
          onLoadedMetadata={(e) => {
            fitVideo(e.target);
            setIsPortraitRemote(e.target.videoWidth < e.target.videoHeight);
          }}
          className="absolute inset-0 w-full h-full object-contain bg-transparent"
          style={{
            ...gpuStyle,
            // blur+dim hides compression block artifacts on stale frozen frames
            filter: isFrozen ? "blur(2px) brightness(0.9)" : undefined,
            transition: "filter 0.3s ease",
            visibility: (isVideo && !isSwapped && hasRemoteVideo) ? "visible" : "hidden",
          }}
        />

        {/* Avatar — centered in the video layer */}
        <div className="absolute inset-0 flex items-center justify-center">
          {isVideo ? (
            (isSwapped && !isCameraOn) ? (
              <VoiceAvatar peerName="YOU" callState={callState} isVideo isSpeaking={false} />
            ) : (!isSwapped && !hasRemoteVideo) ? (
              <VoiceAvatar peerName={peerName} callState={callState} isVideo isSpeaking={isSpeaking} />
            ) : null
          ) : (
            <VoiceAvatar peerName={peerName} callState={callState} isSpeaking={isSpeaking} />
          )}
        </div>

        {/* Freeze pill */}
        {isFrozen && isVideo && !isSwapped && hasRemoteVideo && (
          <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-10
                          px-3 py-1.5 rounded-full bg-black/60 border border-white/10">
            <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">
              Poor connection…
            </span>
          </div>
        )}
      </div>

      {/* ── Top overlay — peer name + timer centered (fades with controls) ── */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 flex flex-col items-center
                   transition-opacity duration-500 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, transparent 100%)",
          paddingTop:    "max(1rem, env(safe-area-inset-top))",
          paddingLeft:   "max(4rem, env(safe-area-inset-left))",
          paddingRight:  "max(4rem, env(safe-area-inset-right))",
          paddingBottom: "2.5rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-white font-semibold text-xl tracking-wide">{peerName}</h2>
        <div className="flex items-center gap-1.5 mt-1">
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-brut-lime animate-blink" />}
          <span className={`font-mono text-sm tracking-wider ${statusColor}`}>{statusText}</span>
        </div>
        {connQuality && (
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border
                          text-[8px] font-bold uppercase tracking-wider mt-2
                          ${ connQuality === "good" ? "bg-brut-lime/10 border-brut-lime/30 text-brut-lime"
                           : connQuality === "ok"   ? "bg-brut-yellow/10 border-brut-yellow/30 text-brut-yellow"
                           :                          "bg-brut-pink/10 border-brut-pink/30 text-brut-pink" }`}>
            { connQuality === "poor" ? <WifiOff size={9} /> : <Wifi size={9} /> }
            <span>{ connQuality === "good" ? "Good" : connQuality === "ok" ? "Weak" : "Poor" }</span>
          </div>
        )}
      </div>

      {/* E2E badge — top-left, always visible */}
      <div
        className="absolute left-3 z-30 flex items-center gap-1
                   bg-white/10 border border-white/10 px-2 py-0.5 rounded-full"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-brut-lime animate-pulse" />
        <span className="text-[8px] font-bold uppercase tracking-widest text-white/50">E2E</span>
      </div>

      {/* ── PiP — top-right, portrait orientation, tap to swap ── */}
      {isVideo && (
        <button
          onClick={(e) => { e.stopPropagation(); resetHideTimer(); setIsSwapped((v) => !v); }}
          className="absolute z-20 w-[88px] h-[124px] xs:w-[108px] xs:h-[152px]
                     transition-all duration-300 ease-out active:scale-95 group/pip"
          style={{
            top:   "max(3.5rem, calc(env(safe-area-inset-top) + 2.75rem))",
            right: "max(0.75rem, env(safe-area-inset-right))",
          }}
          aria-label={isSwapped ? "Show remote video fullscreen" : "Show your video fullscreen"}
        >
          <div
            className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-white/30"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.6)" }}
          >
            {/* Remote PiP (visible when swapped) */}
            <video
              ref={remotePipRef} autoPlay playsInline muted preload="auto" disablePictureInPicture
              className="absolute inset-0 w-full h-full object-cover"
              style={{ ...gpuStyle, visibility: isSwapped ? "visible" : "hidden" }}
            />
            {isSwapped && !hasRemoteVideo && (
              <div className="absolute inset-0 bg-brut-black/90 flex items-center justify-center">
                <User size={20} className="text-white/40" />
              </div>
            )}

            {/* Local PiP (visible when NOT swapped) */}
            <video
              ref={localPipRef} autoPlay playsInline muted preload="auto" disablePictureInPicture
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                ...gpuStyle,
                transform: "translateZ(0) scaleX(-1)",
                visibility: isSwapped ? "hidden" : "visible",
              }}
            />
            {!isSwapped && !isCameraOn && (
              <div className="absolute inset-0 bg-brut-black/90 flex items-center justify-center">
                <VideoOff size={18} className="text-white/40" />
              </div>
            )}

            {/* Label */}
            <div className="absolute top-1.5 left-2">
              <span className="text-[8px] font-black uppercase tracking-wider text-white/70 drop-shadow">
                {isSwapped ? peerName : "YOU"}
              </span>
            </div>
            {/* Swap hint */}
            <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60
                            flex items-center justify-center opacity-60
                            group-hover/pip:opacity-100 transition-opacity">
              <ArrowLeftRight size={9} className="text-white/80" />
            </div>
          </div>
        </button>
      )}

      {/* ── Controls overlay — bottom (fades with controls) ── */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20
                   transition-opacity duration-500 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{
          background: "linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
          paddingLeft:   "max(0.5rem, env(safe-area-inset-left))",
          paddingRight:  "max(0.5rem, env(safe-area-inset-right))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center gap-6 xs:gap-8 py-5">
          <CallControlBtn
            active={isMicOn}
            onClick={onToggleMic}
            activeIcon={<Mic size={22} strokeWidth={2} />}
            inactiveIcon={<MicOff size={22} strokeWidth={2} />}
            label={isMicOn ? "Mute" : "Unmute"}
            disabled={callState === "ended"}
          />

          {isVideo ? (
            <CallControlBtn
              active={isCameraOn}
              onClick={onToggleCamera}
              activeIcon={<Camera size={22} strokeWidth={2} />}
              inactiveIcon={<VideoOff size={22} strokeWidth={2} />}
              label={isCameraOn ? "Camera" : "Cam Off"}
              disabled={callState === "ended"}
            />
          ) : isActive && onSwitchToVideo ? (
            <CallControlBtn
              active
              onClick={onSwitchToVideo}
              activeIcon={<Video size={22} strokeWidth={2} />}
              inactiveIcon={<Video size={22} strokeWidth={2} />}
              label="Video"
            />
          ) : null}

          <button
            onClick={onEndCall}
            disabled={callState === "ended"}
            className="w-[60px] h-[60px] xs:w-[68px] xs:h-[68px] rounded-full bg-brut-pink border-2 border-white/10
                       flex items-center justify-center transition-all duration-150
                       hover:scale-110 active:scale-90 disabled:opacity-50 disabled:hover:scale-100"
            style={{ boxShadow: "0 4px 20px rgba(255,45,120,0.4)" }}
          >
            <PhoneOff size={26} strokeWidth={2} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Voice call avatar with animated rings and speaking indicator.
 * isSpeaking — pulses a ring when the peer's audio level is above threshold.
 */
function VoiceAvatar({ peerName, callState, isVideo = false, isSpeaking = false }) {
  const isRinging = callState === "outgoing-ringing" || callState === "connecting";
  const isEnded   = callState === "ended";

  return (
    <div className="flex flex-col items-center gap-5 xs:gap-8">
      <div className="relative">
        {/* Ringing pulse rings */}
        {isRinging && (
          <>
            <div className="absolute inset-0 w-24 h-24 xs:w-36 xs:h-36 rounded-full animate-call-ring-1 border-2 border-white/20" />
            <div className="absolute -inset-5 w-34 h-34 xs:w-46 xs:h-46 rounded-full animate-call-ring-2 border border-white/10" />
          </>
        )}

        {/* Speaking ring — glows when remote mic is active (Discord-style) */}
        {isSpeaking && callState === "active" && (
          <div className="absolute -inset-2 rounded-full animate-pulse"
               style={{ boxShadow: "0 0 0 3px rgba(170,255,0,0.5)" }} />
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

        {callState === "active" && (
          <div className="absolute inset-0 w-24 h-24 xs:w-36 xs:h-36 rounded-full animate-pulse"
               style={{
                 boxShadow: isVideo
                   ? "0 0 60px rgba(0,207,255,0.15)"
                   : "0 0 60px rgba(170,255,0,0.15)",
               }} />
        )}
      </div>

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
