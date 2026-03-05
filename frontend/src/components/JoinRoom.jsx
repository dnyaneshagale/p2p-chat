import React, { useState } from "react";
import { Zap, Shuffle, AlertTriangle, ArrowRight, Loader2, Shield, Sun, Moon } from "lucide-react";

/**
 * JoinRoom — Neo Brutalist landing screen.
 * Users enter their display name and a shared room code to connect.
 */
export default function JoinRoom({ onJoin, isConnecting, darkMode, onToggleDark }) {
  const [userName, setUserName] = useState("");
  const [roomId, setRoomId]     = useState("");
  const [error, setError]       = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    const trimmedName = userName.trim();
    const trimmedRoom = roomId.trim();
    if (!trimmedName) { setError("NAME IS REQUIRED."); return; }
    if (!trimmedRoom)  { setError("ROOM CODE IS REQUIRED."); return; }
    if (trimmedRoom.length < 4) { setError("ROOM CODE MUST BE AT LEAST 4 CHARS."); return; }
    onJoin(trimmedRoom, trimmedName);
  };

  const generateRoomCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
    setRoomId(code);
  };

  return (
    <div className="bg-brut-bg dark:bg-mid-bg flex items-center justify-center p-2 xs:p-3 sm:p-4"
         style={{ minHeight: "var(--app-height, 100vh)",
                  backgroundImage: "radial-gradient(var(--dot-color) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>

      <div className="w-full max-w-md animate-fade-in">

        {/* ── Header stamp ── */}
        <div className="bg-brut-black text-brut-yellow px-3 xs:px-4 sm:px-6 py-2.5 xs:py-3 sm:py-4 border-3 border-brut-black"
             style={{ boxShadow: "4px 4px 0px #FFE500" }}>
          <div className="flex items-center justify-between gap-2 xs:gap-3">
            <div className="flex items-center gap-2 xs:gap-3">
              <Zap size={24} className="text-brut-yellow shrink-0 xs:w-[28px] xs:h-[28px] sm:w-[34px] sm:h-[34px]" strokeWidth={2.5} />
              <div>
                <h1 className="text-lg xs:text-xl sm:text-3xl font-black uppercase tracking-tighter leading-none">
                  P2P CHAT
                </h1>
                <p className="text-brut-yellow/60 text-[9px] xs:text-[10px] sm:text-xs font-mono uppercase tracking-widest mt-0.5">
                  Direct · Encrypted · Zero Relay
                </p>
              </div>
            </div>
            <button
              onClick={onToggleDark}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme"
              className="p-2 text-brut-yellow/50 hover:text-brut-yellow
                         border border-brut-yellow/20 hover:border-brut-yellow/50
                         active:scale-95 transition-all duration-100 rounded-sm"
            >
              {darkMode ? <Sun size={16} strokeWidth={2.5} /> : <Moon size={16} strokeWidth={2.5} />}
            </button>
          </div>
        </div>

        {/* ── Form card ── */}
        <div className="card mt-0 border-t-0 !p-3 xs:!p-5 sm:!p-7">

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Name */}
            <div>
              <label className="brut-label">Your Name</label>
              <input
                type="text"
                className="input-field font-bold text-base sm:text-lg"
                placeholder="e.g. ALICE"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                maxLength={30}
                disabled={isConnecting}
                autoFocus
              />
            </div>

            {/* Room code */}
            <div>
              <label className="brut-label">Room Code</label>
              <div className="flex gap-1.5 xs:gap-2 sm:gap-3">
                <input
                  type="text"
                  className="input-field font-mono font-bold text-base sm:text-xl uppercase tracking-[0.2em] xs:tracking-[0.3em] flex-1"
                  placeholder="ROOM01"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  maxLength={20}
                  disabled={isConnecting}
                />
                <button
                  type="button"
                  onClick={generateRoomCode}
                  disabled={isConnecting}
                  className="btn-ghost text-xs sm:text-sm px-3 sm:px-3 py-2.5 whitespace-nowrap
                             flex items-center gap-1.5 active:scale-95 !transition-all !duration-100"
                >
                  <Shuffle size={14} strokeWidth={2.5} /> RNG
                </button>
              </div>
              <p className="text-xs font-mono text-brut-black/50 dark:text-mid-muted mt-2 uppercase tracking-wide">
                ↳ Share this code with your peer
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-brut-pink text-white font-black text-sm px-4 py-2.5
                              border-3 border-brut-black animate-slide-up
                              flex items-center gap-2"
                   style={{ boxShadow: "3px 3px 0px #0A0A0A" }}>
                <AlertTriangle size={15} className="shrink-0" strokeWidth={2.5} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button type="submit" className="btn-primary w-full text-base mt-1"
                    disabled={isConnecting}>
              {isConnecting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" strokeWidth={2.5} /> CONNECTING…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">JOIN ROOM <ArrowRight size={16} strokeWidth={2.5} /></span>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t-3 border-brut-black/20 dark:border-mid-border flex items-center gap-3">
            <Shield size={13} className="text-brut-black/40 dark:text-mid-muted shrink-0" strokeWidth={2} />
            <p className="text-xs font-mono text-brut-black/40 dark:text-mid-muted uppercase tracking-wider">
              No server storage · WebRTC P2P · E2E Encrypted
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

