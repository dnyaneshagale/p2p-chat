import React from "react";
import { Phone, PhoneOff, Video, User } from "lucide-react";

/**
 * IncomingCall — WhatsApp-style incoming call overlay.
 * Full-screen dark overlay with pulsing avatar, caller name, accept/reject buttons.
 */
export default function IncomingCall({ peerName = "Peer", callType = "voice", onAccept, onReject }) {
  const isVideo = callType === "video";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between
                    animate-fade-in overflow-hidden"
         style={{ background: "linear-gradient(180deg, #0A0A0A 0%, #1a1a2e 50%, #0A0A0A 100%)",
                  height: "var(--app-height, 100vh)" }}>

      {/* Top section — call type label */}
      <div className="pt-8 xs:pt-12 sm:pt-20 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 bg-white/10 border border-white/20
                        px-4 py-1.5 rounded-full">
          {isVideo
            ? <Video size={14} className="text-brut-cyan" />
            : <Phone size={14} className="text-brut-lime" />}
          <span className="text-xs font-black uppercase tracking-widest text-white/70">
            INCOMING {isVideo ? "VIDEO" : "VOICE"} CALL
          </span>
        </div>
      </div>

      {/* Center — avatar + name */}
      <div className="flex flex-col items-center gap-3 xs:gap-4 sm:gap-6 -mt-4 sm:-mt-8">
        {/* Pulsing rings */}
        <div className="relative">
          <div className="absolute inset-0 w-24 h-24 xs:w-32 xs:h-32 rounded-full animate-call-ring-1"
               style={{ border: `2px solid ${isVideo ? "#00CFFF" : "#AAFF00"}`, opacity: 0.3 }} />
          <div className="absolute -inset-4 w-32 h-32 xs:w-40 xs:h-40 rounded-full animate-call-ring-2"
               style={{ border: `2px solid ${isVideo ? "#00CFFF" : "#AAFF00"}`, opacity: 0.15 }} />
          <div className="absolute -inset-8 w-40 h-40 xs:w-48 xs:h-48 rounded-full animate-call-ring-3"
               style={{ border: `1px solid ${isVideo ? "#00CFFF" : "#AAFF00"}`, opacity: 0.08 }} />

          {/* Avatar */}
          <div className={`relative w-24 h-24 xs:w-32 xs:h-32 rounded-full border-3 flex items-center justify-center
                          ${isVideo ? "border-brut-cyan bg-brut-cyan/10" : "border-brut-lime bg-brut-lime/10"}`}
               style={{ boxShadow: `0 0 40px ${isVideo ? "rgba(0,207,255,0.3)" : "rgba(170,255,0,0.3)"}` }}>
            <User size={40} strokeWidth={1.5} className="xs:!w-[52px] xs:!h-[52px] text-white/80" />
          </div>
        </div>

        {/* Caller name */}
        <div className="text-center">
          <h2 className="text-white font-black text-xl xs:text-2xl sm:text-3xl uppercase tracking-wider">
            {peerName}
          </h2>
          <p className="text-white/40 text-sm font-mono mt-2 uppercase tracking-widest animate-pulse">
            Ringing…
          </p>
        </div>
      </div>

      {/* Bottom — Accept / Reject buttons */}
      <div className="pb-8 xs:pb-12 sm:pb-20 flex items-center gap-10 xs:gap-14 sm:gap-16"
           style={{ paddingBottom: "max(2.5rem, calc(1.5rem + env(safe-area-inset-bottom)))" }}>
        {/* Reject */}
        <div className="flex flex-col items-center gap-2 xs:gap-3">
          <button
            onClick={onReject}
            className="w-[56px] h-[56px] xs:w-[68px] xs:h-[68px] sm:w-18 sm:h-18 rounded-full bg-brut-pink border-3 border-white/20
                       flex items-center justify-center transition-all duration-150
                       hover:scale-110 active:scale-90 shadow-lg"
            style={{ boxShadow: "0 4px 20px rgba(255,45,120,0.5)" }}
          >
            <PhoneOff size={24} strokeWidth={2} className="xs:!w-[28px] xs:!h-[28px] text-white" />
          </button>
          <span className="text-white/50 text-[10px] font-black uppercase tracking-widest">
            DECLINE
          </span>
        </div>

        {/* Accept */}
        <div className="flex flex-col items-center gap-2 xs:gap-3">
          <button
            onClick={onAccept}
            className={`w-[56px] h-[56px] xs:w-[68px] xs:h-[68px] sm:w-18 sm:h-18 rounded-full border-3 border-white/20
                       flex items-center justify-center transition-all duration-150
                       hover:scale-110 active:scale-90 shadow-lg animate-call-accept-pulse
                       ${isVideo ? "bg-brut-cyan" : "bg-brut-lime"}`}
            style={{ boxShadow: `0 4px 20px ${isVideo ? "rgba(0,207,255,0.5)" : "rgba(170,255,0,0.5)"}` }}
          >
            {isVideo
              ? <Video size={24} strokeWidth={2} className="xs:!w-[28px] xs:!h-[28px] text-brut-black" />
              : <Phone size={24} strokeWidth={2} className="xs:!w-[28px] xs:!h-[28px] text-brut-black" />}
          </button>
          <span className="text-white/50 text-[10px] font-black uppercase tracking-widest">
            ACCEPT
          </span>
        </div>
      </div>
    </div>
  );
}
