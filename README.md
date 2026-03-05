<div align="center">

# ⚡ P2P Chat

**Browser-native encrypted peer-to-peer chat, calls, and file transfer — WhatsApp-quality audio/video, zero servers in the loop.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-chat--p2p--x.web.app-FFE500?style=for-the-badge&logo=firebase&logoColor=black)](https://chat-p2p-x.web.app)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.3-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Java](https://img.shields.io/badge/Java-21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)](https://openjdk.org/projects/jdk/21/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-333333?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org)
[![Firebase](https://img.shields.io/badge/Firebase-Hosting-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)

</div>

---

> Share a room code. Connect directly. Everything stays between you two.
>
> No accounts. No logs. No server relay. Every byte — messages, files, voice, video — travels **directly** between browsers over an encrypted WebRTC connection. The signaling server helps two peers find each other, then permanently exits the conversation.

---

## How It Works

```
Browser A                   Signaling Server                Browser B
─────────                   ────────────────                ─────────
  │                                │                              │
  │── join(SHA-256(roomCode)) ────>│                              │
  │<── "waiting" ──────────────────│                              │
  │                                │<── join(same hash) ──────────│
  │<── "ready" ────────────────────│─── "joined" ────────────────>│
  │                                │                              │
  │─── SDP offer ─────────────────>│─── SDP offer ───────────────>│
  │<── SDP answer ─────────────────│<── SDP answer ───────────────│
  │<─────────────────── ICE candidates (STUN/TURN) ──────────────>│
  │                                │                              │
  ╔═══════════════════════════════════════════════════════════════╗
  ║   Direct P2P established. Signaling server is permanently     ║
  ║   out of the loop. It never receives your messages or files.  ║
  ╚═══════════════════════════════════════════════════════════════╝
  │                                                               │
  │◄══════ Text · Files · Voice · Video (DataChannel + RTP) ═════►│
```

**Room security:** The room code is SHA-256 hashed in the browser before it ever leaves your device. The server stores only the hash — it cannot reverse it to learn the original code.

**Name privacy:** Display names are exchanged over the encrypted P2P DataChannel. The server never learns who is in a room.

---

## Features

### 🔒 Privacy & Security

| Guard | What it does |
|---|---|
| **Zero server relay** | After handshake, all data is pure P2P. Server is permanently out of the loop. |
| **SHA-256 room hashing** | Room code is hashed client-side. The server only ever sees the hash. |
| **Anonymous signaling** | Names are exchanged over the encrypted DataChannel, never through the server. |
| **Screenshot protection** | `PrintScreen`, `Ctrl+S`, `Ctrl+P`, `Ctrl+Shift+I`, and macOS screenshot shortcuts are intercepted and blocked. |
| **Blur-on-unfocus** | Chat content blurs when the window loses focus or the tab enters screen-share. |
| **Context menu & drag blocked** | Right-click and media dragging are suppressed globally. |
| **Capture handle guard** | `capturehandlechange` event detected — content blurs if the tab is captured. |

### 💬 Messaging

- Real-time text chat over `RTCDataChannel`
- **WhatsApp-style bubbles** — rounded corners with directional tail, drop-shadow, sent/received colour-coding
- **Swipe-to-reply** — drag any bubble right; haptic feedback fires at threshold, bubble snaps back, quoted reply bar appears above the input
- **Reply button** inside each bubble — one-tap quote without swiping
- Drag-and-drop file sending directly into the chat window
- `Enter` to send, `Shift+Enter` for newline
- System notification pills for peer join / peer leave events

### 📁 File Transfer

- **Unlimited file size** — chunked into 64 KB pieces over the DataChannel
- **Back-pressure buffering** — 8 MB high-water / 1 MB low-water marks prevent DataChannel overflow on large files
- Graceful cancellation: `file-cancel` signal ensures receiver resets state if the sender disconnects mid-transfer
- Image thumbnails → full-screen lightbox (pinch/drag zoom, double-tap to reset)
- Video thumbnails → click-to-play lightbox
- Audio player inline in the chat
- Generic file download link for all other formats

### 👁️ View Once Media

- Toggle **View Once** before attaching — icon flips to `EyeOff` to confirm
- Receiver sees a **"TAP TO VIEW"** panel instead of the media directly
- The moment the viewer is **closed**, the blob URL is revoked and the bubble reads **"VIEWED — MEDIA DESTROYED"**
- No re-open possible — identical to WhatsApp's model

### 📞 HD Voice & Video Calls

**Audio chain (Web Audio API)**

```
Microphone → High-pass (80 Hz) → Low-pass (16 kHz)
           → Analyser → Noise Gate (−45/−55 dB hysteresis)
           → Presence boost (+4 dB @ 3 kHz)
           → Dynamics Compressor → Opus 128 kbps
```

| Stage | Setting | Purpose |
|---|---|---|
| High-pass | 80 Hz | Removes rumble/hum while preserving male voice fundamentals (~85 Hz) |
| Low-pass | 16 kHz | Cuts ultrasonic noise; preserves all vocal brilliance and consonants |
| Noise gate | Open −45 dB / Close −55 dB, 8 ms attack / 150 ms release | Silences background noise between words without clipping speech |
| Presence boost | +4 dB @ 3 kHz | 3 kHz = ear's peak sensitivity; sharpens consonant clarity and intelligibility |
| Compressor | −18 dB threshold, 4:1 ratio, 2 ms attack / 200 ms release | Consistent loudness, no pumping artifacts |
| **Opus codec** | **128 kbps, 48 kHz, FEC enabled, DTX off** | **HD voice — nearly indistinguishable from a native call** |

**Video quality**

- **VP9 codec preferred** via `RTCRtpTransceiver.setCodecPreferences` — ~50% better compression than VP8 at equal quality; sharper image on any network condition
- **2.5 Mbps sender cap** via `RTCRtpSender.setParameters` — clean 720p @ 30 fps; browser adapts downward on congestion
- Capture at **1280 × 720, 48 kHz, 16-bit, mono**, `aspectRatio: 16/9`
- iOS AudioContext auto-resume on tab return (prevents one-way audio)
- Dedicated `<audio>` element for remote audio — no dual-track conflict on Safari
- **Full-screen remote video**, local camera in swappable PiP (tap to swap, exactly like WhatsApp)
- Mid-call: mic mute, camera toggle, voice → video upgrade

**Reliability**

- Perfect-negotiation pattern (polite/impolite peer roles) — handles SDP offer collisions (glare) correctly
- Automatic ICE restart with fresh TURN credentials on connection failure
- Stale `RTCPeerConnection` detection — creates a clean PC when a peer rejoins after leaving
- `onconnectionstatechange` only marks disconnected on terminal states (`failed`/`closed`), not the transient `disconnected` — no false UI flickers

### 🎨 UI & Theming

- **Neo Brutalist** design — 3 px solid borders, offset drop-shadows, yellow/pink/black signature palette
- **Dark Mode (Midnight Blue)** — deep navy surfaces, royal-blue message bubbles, one-click toggle persisted to `localStorage`
- Space Grotesk + Space Mono typefaces loaded from Google Fonts
- Lucide SVG icons throughout (no emoji)
- Tactile button & bubble press animations — shadow collapses on press (`active:translate-y-0.5`)
- Mobile-first responsive layout — `safe-area-inset` padding, `xs` / `sm` / `md` breakpoints
- Full keyboard accessibility (`Tab`, `Enter`, `Shift+Enter`, `Esc`)
- `ErrorBoundary` wrapping the entire app — blank screen on unhandled render errors is replaced with a legible error message

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18.2 + Create React App |
| Styling | Tailwind CSS 3.4 — custom `brut` (Neo Brutalist) + `mid` (Midnight Blue) design tokens |
| Icons | Lucide React 0.577 |
| WebRTC | Browser native — `RTCPeerConnection`, `RTCDataChannel`, `getUserMedia`, `RTCRtpTransceiver` |
| Audio | Web Audio API — `AudioContext`, `BiquadFilterNode`, `AnalyserNode`, `DynamicsCompressorNode` |
| Signaling server | Spring Boot 3.2.3 · Java 21 · Spring WebSocket |
| Hosting | Firebase Hosting (frontend) + Google Cloud Run, asia-south1 (backend) |
| Crypto | Web Crypto API — `SubtleCrypto.digest("SHA-256")` for room code hashing |
| TURN | Cloudflare TURN — credentials fetched dynamically from `/api/turn-credentials` |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React Frontend (Firebase Hosting · chat-p2p-x.web.app)     │
│                                                             │
│  App.js ─── useSignaling.js (WS + exponential backoff)      │
│          └─ useWebRTC.js ──┬── RTCPeerConnection            │
│                            ├── RTCDataChannel (text/files)  │
│                            ├── Web Audio chain (mic → Opus) │
│                            └── getUserMedia (720p @ 30fps)  │
│                                                             │
│  usePrivacy.js  (7 screenshot / leak guards)                │
└────────────────────────────┬────────────────────────────────┘
                             │  WSS + ICE (handshake only)
┌────────────────────────────▼────────────────────────────────┐
│  Spring Boot Signaling Server (Cloud Run · asia-south1)      │
│                                                             │
│  /signal  WebSocket endpoint                                │
│  SignalingHandler — join · offer · answer · ICE relay       │
│  Rooms: Map<hash → Set<session>>  (max 2 peers/room)        │
│  Server exits the loop the moment P2P is established.       │
└─────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Java 21** and **Maven 3**

### 1. Clone

```bash
git clone https://github.com/dnyaneshagale/p2p-chat.git
cd p2p-chat
```

### 2. Start the signaling server

```bash
cd backend
mvn spring-boot:run
# Listening on ws://localhost:8080/signal
```

### 3. Start the React frontend

```bash
cd frontend
npm install
npm start
# Opens http://localhost:3000
```

The dev signaling URL is pre-configured in `frontend/.env.development`:

```env
REACT_APP_SIGNAL_URL=ws://localhost:8080/signal
```

### 4. Open two tabs

Open `http://localhost:3000` in **two separate browser tabs** (or two devices on the same network). Enter the same room code in both — the WebRTC connection establishes automatically.

---

---

## Project Structure

```
p2p-chat/
├── README.md
│
├── backend/                                  # Spring Boot WebSocket signaling server
│   ├── Dockerfile                            # Multi-stage build (Maven → JRE 21 slim)
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/chatapp/
│       │   ├── ChatAppApplication.java
│       │   ├── config/
│       │   │   └── WebSocketConfig.java      # Registers /signal WebSocket endpoint
│       │   ├── handler/
│       │   │   └── SignalingHandler.java     # join / offer / answer / ICE relay
│       │   └── model/
│       │       └── SignalMessage.java        # Message DTO
│       └── resources/
│           ├── application.properties
│           └── application-prod.properties  # Production profile (PORT, CORS, log level)
│
└── frontend/                                 # React app (Create React App)
    ├── firebase.json                         # Hosting config: SPA rewrite, cache headers, CSP
    ├── tailwind.config.js                    # darkMode:"class", brut + mid palettes, xs breakpoint
    ├── public/index.html
    └── src/
        ├── App.js                            # Root: state, SHA-256 hashing, signaling ↔ WebRTC bridge
        ├── index.js                          # Entry: ErrorBoundary, --app-height CSS var tracker
        ├── index.css                         # Tailwind layers + Neo Brutalist component classes
        ├── components/
        │   ├── JoinRoom.jsx                  # Landing screen + room-join form
        │   ├── ChatWindow.jsx                # Toolbar, scrollable message list, reply bar, input
        │   ├── MessageBubble.jsx             # Bubble + swipe-to-reply + view-once state machine
        │   ├── MediaViewer.jsx               # Full-screen lightbox (pinch/drag zoom, video playback)
        │   ├── CallScreen.jsx                # Full-screen call overlay — voice avatar / video PiP
        │   └── IncomingCall.jsx              # Incoming call notification banner
        └── hooks/
            ├── useWebRTC.js                  # RTCPeerConnection, DataChannel, Web Audio chain,
            │                                 # VP9/Opus/bitrate tuning, file chunking, call flow
            ├── useSignaling.js               # WebSocket client with exponential backoff reconnect
            └── usePrivacy.js                 # 7 screenshot / drag / devtools / context-menu guards
```

---

## Security Notes

| Threat | Mitigation |
|---|---|
| Server-side eavesdropping | Server only relays hashed room IDs + SDP/ICE blobs. It never sees messages, names, or files. |
| Room enumeration | Room codes are SHA-256 hashed client-side; the server stores only the hash. |
| Name leakage | Display names are exchanged over the encrypted P2P DataChannel, never through the server. |
| Screenshot / screen capture | Keyboard shortcuts intercepted; content blurs on window focus loss and screen-capture events. |
| View Once bypass | Blob URLs are revoked immediately on viewer close — no re-open is possible. |
| File retention | All media exists only in browser memory as blob URLs; nothing is uploaded or stored. |
| Mid-transfer crash | `file-cancel` signal resets receiver state if the sender disconnects mid-transfer. |

---

## Production Deployment

### Frontend → Firebase Hosting

```bash
cd frontend
npm install
npx firebase login
npx firebase init hosting          # set public dir: build, configure as SPA: yes
npm run deploy                     # runs npm run build then firebase deploy automatically
```

### Backend → Docker / Cloud Run

```bash
cd backend
docker build -t p2p-chat-signaling .
docker run -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e ALLOWED_ORIGINS=https://your-app.web.app \
  p2p-chat-signaling
```

| Environment variable | Default | Purpose |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | *(none)* | Set to `prod` to load `application-prod.properties` |
| `ALLOWED_ORIGINS` | `*` (dev) | Comma-separated CORS origins for the WebSocket endpoint |
| `PORT` | `8080` | Server port — honoured automatically by Cloud Run / Railway / Fly.io |

### Signaling URL auto-detection

`REACT_APP_SIGNAL_URL` is absent from production builds. The frontend derives it at runtime:

```js
const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
const url   = `${proto}//${window.location.host}/signal`;
```

Host the React build from the **same origin** as the Spring Boot server — no extra config required.

---

## Browser Support

| Browser | Status |
|---|---|
| Chrome / Edge 90+ | ✅ Full support — VP9, Web Audio, all constraints |
| Firefox 90+ | ✅ Full support |
| Safari 15.4+ (iOS & macOS) | ✅ Supported — `AudioContext` auto-resumes on tab return |
| Samsung Internet 14+ | ✅ Full support |

---

<div align="center">

Made with ☕ by [Dnyanesh Agale](https://github.com/dnyaneshagale)

</div>
│       │   │   └── SignalingHandler.java  # join / offer / answer / ICE relay
│       │   └── model/
│       │       └── SignalMessage.java     # Message DTO (Lombok @Data @Builder)
│       └── resources/
│           ├── application.properties
│           └── application-prod.properties  # Production profile (PORT, CORS, log level)
│
└── frontend/                              # React app (Create React App)
    ├── .env.development                   # Local dev signaling URL override
    ├── firebase.json                      # Hosting config: SPA rewrite, cache headers, CSP
    ├── tailwind.config.js                 # darkMode:"class", brut + mid palettes, xs breakpoint
    ├── public/index.html
    └── src/
        ├── App.js                         # Root: state, room hashing, signaling ↔ WebRTC bridge
        ├── index.css                      # Tailwind layers + Neo Brutalist component classes
        ├── components/
        │   ├── JoinRoom.jsx               # Landing / room-join screen with dark mode toggle
        │   ├── ChatWindow.jsx             # Main chat UI: toolbar, message list, reply bar, input
        │   ├── MessageBubble.jsx          # Bubble + swipe-to-reply + view-once state machine
        │   ├── MediaViewer.jsx            # Full-screen lightbox (pinch/drag zoom, video playback)
        │   └── VideoCall.jsx             # Call overlay with PiP, mic/camera/noise-gate controls
        └── hooks/
            ├── useWebRTC.js               # RTCPeerConnection, DataChannel, file chunking, media
            ├── useSignaling.js            # WebSocket signaling client with reconnect logic
            └── usePrivacy.js             # Screenshot / drag / devtools / context-menu guards
```

---

## Security Notes

| Threat | Mitigation |
|---|---|
| Server-side eavesdropping | Server only relays hashed room IDs + SDP/ICE blobs. It sees no messages, names, or files. |
| Room enumeration | Room codes are SHA-256 hashed; the server stores only the hash. |
| Name leakage | Display names are exchanged over the encrypted DataChannel, never through the server. |
| Screenshot / screen capture | Keyboard shortcuts are intercepted; content blurs on window focus loss. |
| View Once bypass | Blob URLs are revoked immediately on viewer close — no re-open possible. |
| File retention | All media is stored only in browser memory as blob URLs, never uploaded anywhere. |

