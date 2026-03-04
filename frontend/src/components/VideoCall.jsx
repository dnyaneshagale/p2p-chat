import React, { useEffect, useRef } from "react";
import { User, Mic, MicOff, Camera, VideoOff, PhoneOff } from "lucide-react";

/**
 * VideoCall — Neo Brutalist full-screen video call overlay.
 * Remote video fills the screen; local video is a bordered PiP corner.
 * All controls have brutal borders and offset shadows.
 */
export default function VideoCall({
  localStream, remoteStream,
  isMicOn, isCameraOn,
  onToggleMic, onToggleCamera, onEndCall,
  peerName = "Peer",
}) {
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream)
      localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream)
      remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in"
         style={{ background: "#0A0A0A" }}>

      {/* ── Brutal top bar ── */}
      <div className="bg-brut-yellow border-b-3 border-brut-black px-5 py-2.5
                      flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 bg-brut-pink border-2 border-brut-black animate-blink" />
          <span className="font-black uppercase tracking-wider text-sm text-brut-black">
            LIVE CALL — {peerName.toUpperCase()}
          </span>
        </div>
        <span className="font-mono text-xs font-bold text-brut-black/60 uppercase tracking-widest">
          WebRTC · E2E · Unlimited
        </span>
      </div>

      {/* ── Remote video ── */}
      <div className="relative flex-1 flex items-center justify-center bg-brut-black overflow-hidden">
        {remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline
                 className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-5">
            <div className="w-28 h-28 bg-brut-yellow border-3 border-brut-yellow
                            flex items-center justify-center text-brut-black"
                 style={{ boxShadow: "6px 6px 0px #FFE500" }}>
              <User size={52} strokeWidth={1.5} />
            </div>
            <p className="font-black text-xl uppercase tracking-wide text-brut-yellow">
              {peerName}
            </p>
            <p className="font-mono text-sm uppercase tracking-widest animate-pulse
                          text-brut-yellow/50">
              ● CONNECTING VIDEO…
            </p>
          </div>
        )}

        {/* ── Local PiP ── */}
        {localStream && (
          <div className="absolute bottom-4 right-4 w-36 h-28 overflow-hidden
                          border-3 border-brut-yellow"
               style={{ boxShadow: "4px 4px 0px #FFE500" }}>
            <video ref={localVideoRef} autoPlay playsInline muted
                   className="w-full h-full object-cover" />
            {!isCameraOn && (
              <div className="absolute inset-0 bg-brut-black flex items-center justify-center">
                <span className="font-mono text-brut-yellow text-xs font-black uppercase">
                  CAM OFF
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="bg-brut-bg border-t-3 border-brut-black px-4 py-3 sm:py-4
                      flex items-center justify-center gap-2 sm:gap-4 shrink-0 flex-wrap"
           style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <BrutCallBtn
          active={isMicOn} onClick={onToggleMic}
          activeLabel="MIC ON" inactiveLabel="MUTED"
          activeIcon={<Mic size={16} strokeWidth={2.5} />}
          inactiveIcon={<MicOff size={16} strokeWidth={2.5} />}
          activeClass="bg-brut-cyan" inactiveClass="bg-brut-pink"
        />
        <BrutCallBtn
          active={isCameraOn} onClick={onToggleCamera}
          activeLabel="CAM ON" inactiveLabel="CAM OFF"
          activeIcon={<Camera size={16} strokeWidth={2.5} />}
          inactiveIcon={<VideoOff size={16} strokeWidth={2.5} />}
          activeClass="bg-brut-lime" inactiveClass="bg-brut-pink"
        />
        <button onClick={onEndCall}
                className="btn-danger flex items-center gap-2 text-sm">
          <PhoneOff size={16} strokeWidth={2.5} /> END CALL
        </button>
      </div>
    </div>
  );
}

function BrutCallBtn({ active, onClick, activeLabel, inactiveLabel, activeIcon, inactiveIcon, activeClass, inactiveClass }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-3 border-brut-black
                  font-black text-xs uppercase tracking-wider text-brut-black
                  transition-all duration-100 active:translate-x-0.5 active:translate-y-0.5 min-w-[80px] justify-center
                  ${active ? activeClass : inactiveClass}`}
      style={{ boxShadow: "3px 3px 0px #0A0A0A" }}
    >
      {active ? activeIcon : inactiveIcon}
      <span>{active ? activeLabel : inactiveLabel}</span>
    </button>
  );
}
