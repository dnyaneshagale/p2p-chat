import React, { useState, useRef } from "react";
import {
  Zap, Shuffle, AlertTriangle, ArrowRight, Loader2, Shield,
  Sun, Moon, Lock, Eye, Phone, ChevronDown, CornerUpLeft,
} from "lucide-react";

// ── Feature chips ──────────────────────────────────────────────────────────
const CHIPS = [
  { icon: Lock,         label: "Zero Relay"     },
  { icon: Shield,       label: "E2E Encrypted"  },
  { icon: Eye,          label: "View Once"       },
  { icon: Phone,        label: "Voice & Video"   },
  { icon: CornerUpLeft, label: "Swipe to Reply"  },
  { icon: Moon,         label: "Dark Mode"       },
];

// ── Feature cards (below fold) ─────────────────────────────────────────────
const FEATURE_CARDS = [
  {
    icon:  Lock,
    title: "Privacy by Design",
    items: [
      "Room code SHA-256 hashed before it leaves your browser",
      "No names, messages, or files ever pass through our server",
      "Screen blurs on focus loss · Screenshot shortcuts blocked",
    ],
  },
  {
    icon:  Eye,
    title: "Rich Media Transfer",
    items: [
      "Unlimited file size — chunked directly over DataChannel",
      "View Once: media URL revoked the moment the viewer closes",
      "Images, video, audio, and any file type supported",
    ],
  },
  {
    icon:  Phone,
    title: "Built-in Calls",
    items: [
      "HD 1280×720 WebRTC voice & video calls",
      "Noise gate · mic mute · camera toggle · PiP preview",
      "Switch between voice and video mid-call",
    ],
  },
];

// ── How it works ───────────────────────────────────────────────────────────
const STEPS = [
  {
    n:     "01",
    icon:  Shuffle,
    title: "Choose a Room Code",
    desc:  "Type any phrase or hit RNG for a random code. Share it with your contact out-of-band — only you two will ever know it.",
  },
  {
    n:     "02",
    icon:  Zap,
    title: "Signaling Handshake",
    desc:  "Our server receives only a SHA-256 hash of your code. It relays SDP/ICE blobs to establish the encrypted WebRTC tunnel.",
  },
  {
    n:     "03",
    icon:  Shield,
    title: "P2P — Server Is Done",
    desc:  "Once the tunnel is open, the server steps out permanently. Every message, file, and video frame travels directly between browsers.",
  },
];

// ── Component ──────────────────────────────────────────────────────────────
export default function JoinRoom({ onJoin, isConnecting, darkMode, onToggleDark }) {
  const [userName, setUserName] = useState("");
  const [roomId, setRoomId]     = useState("");
  const [error, setError]       = useState("");
  const nameInputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    const name = userName.trim();
    const room = roomId.trim();
    if (!name) { setError("NAME IS REQUIRED."); return; }
    if (!room)  { setError("ROOM CODE IS REQUIRED."); return; }
    if (room.length < 4) { setError("ROOM CODE MUST BE AT LEAST 4 CHARS."); return; }
    onJoin(room, name);
  };

  const generateRoomCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    setRoomId(Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join(""));
  };

  const focusForm = () => {
    nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    nameInputRef.current?.focus();
  };

  return (
    <div className="bg-brut-bg dark:bg-mid-bg" style={{ minHeight: "var(--app-height, 100vh)" }}>

      {/* ═══════════════════════════════════════════════════════
          STICKY NAV
      ═══════════════════════════════════════════════════════ */}
      <nav className="sticky top-0 z-50 bg-brut-black dark:bg-mid-nav
                      border-b-3 border-brut-black dark:border-mid-border
                      px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Zap size={18} className="text-brut-yellow shrink-0" strokeWidth={2.5} />
          <span className="text-brut-yellow font-black text-sm uppercase tracking-widest">P2P CHAT</span>
          <span className="hidden sm:inline text-brut-yellow/25 font-mono text-[9px] uppercase tracking-widest
                           ml-3 pl-3 border-l border-brut-yellow/15">
            Direct · Encrypted · Zero Relay
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={focusForm}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-sm
                       text-[10px] font-black uppercase tracking-widest
                       text-brut-yellow/60 hover:text-brut-yellow
                       border border-brut-yellow/20 hover:border-brut-yellow/50
                       transition-all duration-100"
          >
            Open App <ArrowRight size={10} strokeWidth={2.5} />
          </button>
          <button
            onClick={onToggleDark}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme"
            className="p-2 text-brut-yellow/50 hover:text-brut-yellow rounded-sm
                       border border-brut-yellow/20 hover:border-brut-yellow/50
                       active:scale-95 transition-all duration-100"
          >
            {darkMode ? <Sun size={15} strokeWidth={2.5} /> : <Moon size={15} strokeWidth={2.5} />}
          </button>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════
          HERO — headline left, form right
      ═══════════════════════════════════════════════════════ */}
      <section
        className="px-4 sm:px-8 lg:px-16 py-10 sm:py-14 lg:py-20"
        style={{
          backgroundImage: "radial-gradient(var(--dot-color) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 lg:gap-16 items-start">

          {/* ── Left: hero copy ── */}
          <div className="animate-fade-in">

            {/* Live badge */}
            <div
              className="inline-flex items-center gap-2 bg-brut-yellow border-3 border-brut-black px-3 py-1 mb-6"
              style={{ boxShadow: "2px 2px 0 #0A0A0A" }}
            >
              <span className="w-2 h-2 rounded-full bg-brut-lime animate-pulse shrink-0" />
              <span className="font-black text-[9px] xs:text-[10px] uppercase tracking-widest text-brut-black">
                LIVE · chat-p2p-x.web.app
              </span>
            </div>

            {/* Giant headline */}
            <h1
              className="font-black uppercase leading-[0.88] tracking-tighter
                         text-brut-black dark:text-mid-text mb-5
                         text-[2.8rem] xs:text-5xl sm:text-6xl lg:text-7xl xl:text-8xl"
            >
              PEER
              <br />
              <span className="relative inline-block">
                TO
                {/* Yellow underline highlight */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-[0.06em] h-[0.2em] bg-brut-yellow -z-10"
                />
              </span>
              {" "}PEER
              <br />
              CHAT
            </h1>

            {/* Tagline */}
            <p className="text-base sm:text-lg font-medium text-brut-black/65 dark:text-mid-muted
                          max-w-sm mb-7 leading-relaxed">
              Two browsers. One room code. Everything travels{" "}
              <strong className="font-black text-brut-black dark:text-mid-text">
                directly between you
              </strong>{" "}
              — encrypted, zero server relay, zero logs.
            </p>

            {/* Feature chips */}
            <div className="flex flex-wrap gap-2 mb-8">
              {CHIPS.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5
                             bg-brut-white dark:bg-mid-surface
                             border-2 border-brut-black dark:border-mid-border
                             px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide
                             text-brut-black dark:text-mid-text"
                  style={{ boxShadow: "2px 2px 0 rgba(10,10,10,0.35)" }}
                >
                  <Icon size={11} strokeWidth={2.5} />
                  {label}
                </span>
              ))}
            </div>

            {/* CTA scroll button — only on mobile/tablet (lg has form beside it) */}
            <button
              onClick={focusForm}
              className="lg:hidden btn-primary flex items-center gap-2 text-sm"
            >
              START CHATTING <ChevronDown size={15} strokeWidth={2.5} />
            </button>
          </div>

          {/* ── Right: Join form ── */}
          <div className="animate-fade-in">

            {/* Form header stamp */}
            <div
              className="bg-brut-black dark:bg-mid-nav text-brut-yellow
                         px-5 py-3 border-3 border-brut-black dark:border-mid-border
                         flex items-center gap-2.5"
              style={{ boxShadow: "4px 4px 0 rgba(255,229,0,0.25)" }}
            >
              <Zap size={18} className="text-brut-yellow shrink-0" strokeWidth={2.5} />
              <div>
                <p className="font-black text-sm uppercase tracking-widest leading-none">JOIN A ROOM</p>
                <p className="text-brut-yellow/45 text-[9px] font-mono uppercase tracking-widest mt-0.5">
                  Enter your name + a shared code
                </p>
              </div>
            </div>

            {/* Form card */}
            <div className="card mt-0 border-t-0 !p-5 sm:!p-7">
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Name */}
                <div>
                  <label className="brut-label">Your Name</label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    className="input-field font-bold text-base"
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
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input-field font-mono font-bold text-base uppercase tracking-[0.25em] flex-1"
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
                      className="btn-ghost text-xs px-3 py-2.5 whitespace-nowrap
                                 flex items-center gap-1.5 active:scale-95 !transition-all !duration-100"
                    >
                      <Shuffle size={13} strokeWidth={2.5} /> RNG
                    </button>
                  </div>
                  <p className="text-[11px] font-mono text-brut-black/45 dark:text-mid-muted mt-1.5 uppercase tracking-wide">
                    ↳ Share this code with your peer
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div
                    className="bg-brut-pink text-white font-black text-sm px-4 py-2.5
                               border-3 border-brut-black animate-slide-up flex items-center gap-2"
                    style={{ boxShadow: "3px 3px 0 #0A0A0A" }}
                  >
                    <AlertTriangle size={14} className="shrink-0" strokeWidth={2.5} />
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button type="submit" className="btn-primary w-full text-sm mt-1" disabled={isConnecting}>
                  {isConnecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> CONNECTING…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      JOIN ROOM <ArrowRight size={15} strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              </form>

              {/* Privacy footer */}
              <div className="mt-5 pt-4 border-t-2 border-brut-black/15 dark:border-mid-border flex items-center gap-2.5">
                <Shield size={12} className="text-brut-black/35 dark:text-mid-muted shrink-0" strokeWidth={2} />
                <p className="text-[11px] font-mono text-brut-black/40 dark:text-mid-muted uppercase tracking-wider">
                  No server storage · WebRTC P2P · E2E Encrypted
                </p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FEATURE CARDS  (dark band)
      ═══════════════════════════════════════════════════════ */}
      <section className="bg-brut-black dark:bg-mid-nav border-y-3 border-brut-black dark:border-mid-border
                          px-4 sm:px-8 lg:px-16 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto">

          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brut-yellow/40 mb-1">
            Why P2P Chat
          </p>
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-brut-yellow mb-8 sm:mb-10">
            NOTHING GOES THROUGH OUR SERVER.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {FEATURE_CARDS.map(({ icon: Icon, title, items }) => (
              <div
                key={title}
                className="p-5 sm:p-6 border-2 border-white/10 hover:border-brut-yellow/25
                           transition-colors duration-200"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-9 h-9 bg-brut-yellow flex items-center justify-center shrink-0"
                    style={{ boxShadow: "2px 2px 0 rgba(255,229,0,0.2)" }}
                  >
                    <Icon size={17} strokeWidth={2.5} className="text-brut-black" />
                  </div>
                  <h3 className="font-black uppercase text-[11px] tracking-wider text-white leading-tight">
                    {title}
                  </h3>
                </div>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[12px] text-white/50 font-mono leading-relaxed">
                      <span className="text-brut-yellow/60 shrink-0 mt-0.5 select-none">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          HOW IT WORKS  (dot bg, card grid)
      ═══════════════════════════════════════════════════════ */}
      <section
        className="px-4 sm:px-8 lg:px-16 py-12 sm:py-16"
        style={{
          backgroundImage: "radial-gradient(var(--dot-color) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div className="max-w-6xl mx-auto">

          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brut-black/35 dark:text-mid-muted mb-1">
            How It Works
          </p>
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight
                         text-brut-black dark:text-mid-text mb-10 sm:mb-12">
            THREE STEPS. THEN DIRECT.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {STEPS.map(({ n, icon: Icon, title, desc }) => (
              <div key={n} className="card relative overflow-hidden !p-6 sm:!p-7">
                {/* Ghost step number */}
                <span
                  aria-hidden
                  className="absolute -bottom-3 -right-1 font-black leading-none select-none pointer-events-none
                             text-brut-black/5 dark:text-white/5"
                  style={{ fontSize: "6rem" }}
                >
                  {n}
                </span>
                {/* Icon */}
                <div
                  className="relative w-10 h-10 bg-brut-yellow border-3 border-brut-black
                             flex items-center justify-center mb-4"
                  style={{ boxShadow: "3px 3px 0 #0A0A0A" }}
                >
                  <Icon size={18} strokeWidth={2.5} className="text-brut-black" />
                </div>
                <h3 className="relative font-black uppercase text-xs tracking-widest
                               text-brut-black dark:text-mid-text mb-2">
                  {title}
                </h3>
                <p className="relative text-[12px] font-mono text-brut-black/55 dark:text-mid-muted leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════ */}
      <footer className="bg-brut-black dark:bg-mid-nav border-t-3 border-brut-black dark:border-mid-border
                         px-4 sm:px-8 py-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center
                        justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-brut-yellow" strokeWidth={2.5} />
            <span className="text-brut-yellow font-black text-sm uppercase tracking-widest">P2P CHAT</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[10px] font-mono uppercase tracking-widest text-white/25">
            <span>Zero server relay</span>
            <span>E2E encrypted</span>
            <span>No account needed</span>
          </div>
          <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
            © 2026 · chat-p2p-x.web.app
          </p>
        </div>
      </footer>

    </div>
  );
}

