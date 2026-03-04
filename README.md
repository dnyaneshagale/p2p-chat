# ⚡ P2P Chat

> **Browser-native peer-to-peer chat with end-to-end encryption, chunked file transfer, live video calls, and View Once media — all over direct WebRTC connections, zero server relay.**

---

## How It Works

Two people enter the same room code. A Spring Boot WebSocket server helps them find each other — then steps out of the way forever. Every message, file, and video frame travels **directly** between the two browsers, encrypted by the WebRTC specification. The server never sees your messages, your names, or your files.

```
Browser A                Signaling Server              Browser B
─────────                ────────────────              ─────────
  │                            │                            │
  │── join (SHA-256 hash) ────>│                            │
  │<── waiting ────────────────│                            │
  │                            │<── join (same hash) ───────│
  │<── ready ──────────────────│─── joined ────────────────>│
  │                            │                            │
  │─── SDP offer ─────────────>│─── SDP offer ─────────────>│
  │<── SDP answer ─────────────│<── SDP answer ─────────────│
  │<──────────────── ICE candidates ───────────────────────>│
  │                            │                            │
  ╔══════════════════════════════════════════════════════════╗
  ║       Direct WebRTC P2P established. Server is done.     ║
  ╚══════════════════════════════════════════════════════════╝
  │                                                          │
  │◄══════ Text / Files / Video (DataChannel + RTP) ════════►│
```

---

## Features

### Privacy & Security
- **Zero server relay** — after handshake, all data is P2P. Server is permanently out of the loop.
- **SHA-256 room hashing** — the room code is hashed client-side before it ever reaches the server. The server only stores the hash, never the real room name.
- **Anonymous signaling** — display names are exchanged over the encrypted DataChannel. The server never learns who is in a room.
- **Screenshot protection** — `PrintScreen`, `Ctrl+S`, `Ctrl+P`, `Ctrl+Shift+I`, and macOS screenshot shortcuts are blocked.
- **Blur-on-unfocus** — chat content blurs when the window loses focus or the tab is shared.
- **Context menu & drag disabled** — right-click and media dragging are suppressed globally.

### Messaging
- Real-time text chat over RTCDataChannel
- **Reply-to** — quote any previous message
- Drag-and-drop file sending
- System notifications (peer joined / left)

### File Transfer
- Unlimited file size — chunked into 64 KB pieces
- Back-pressure buffering (8 MB high-water / 1 MB low-water) to prevent data-channel overflow
- Image thumbnails with a full-screen lightbox viewer (zoom, pan, double-click)
- Video thumbnails with a click-to-play lightbox
- Audio player inline
- Generic file download for all other types

### View Once Media
- Toggle **View Once** before attaching a file — the icon flips to `EyeOff` to confirm it's active
- Receiver sees a "TAP TO VIEW" panel; tapping opens the full-screen viewer
- The moment the viewer is **closed**, the blob URL is revoked and the bubble shows "VIEWED — MEDIA DESTROYED"
- Identical to WhatsApp's model: fully visible while open, permanently gone on close

### Video Calls
- HD 1280 × 720 @ 30 fps via `getUserMedia`
- Picture-in-picture local preview
- Mic mute / camera toggle
- Instant end-call

### UI
- **Neo Brutalist** design — bold 3 px borders, offset drop shadows, high-contrast yellow / pink / black palette
- **Space Grotesk** + **Space Mono** typefaces
- Lucide SVG icons throughout (no emoji)
- Tactile button interactions (shadow shrinks + translate on press)
- Animated entry for messages and panels
- Fully keyboard accessible (`Tab`, `Enter`, `Esc`)

---

## Architecture

```
Browser A                Signaling Server              Browser B
─────────                ────────────────              ─────────
  │                            │                            │
  │── join (SHA-256 hash) ────>│                            │
  │<── waiting ────────────────│                            │
  │                            │<── join (same hash) ───────│
  │<── ready ──────────────────│                            │
  │                            │─── joined ────────────────>│
  │                            │                            │
  │── SDP offer ──────────────>│─── SDP offer ─────────────>│
  │<── SDP answer ─────────────│<── SDP answer ─────────────│
  │<── ICE candidates ──────── │ ── ICE candidates ─────────│
  │                            │                            │
  ╔══════════════════════════════════════════════════════════╗
  ║          Direct WebRTC P2P connection established        ║
  ║    Server is completely out of the data path from here   ║
  ╚══════════════════════════════════════════════════════════╝
  │                                                          │
  │◄═══════ Text  /  Files  /  Video  (DataChannel) ════════►│
```

**Room privacy**: `SHA-256("chatapp\0" + roomCode.toLowerCase())` — only the first 32 hex characters are sent. Brute-forcing a 6-character alphanumeric code against the hash is computationally impractical.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18.2 + Create React App |
| Styling | Tailwind CSS 3.4 (Neo Brutalist design tokens) |
| Icons | Lucide React |
| WebRTC | Native browser APIs — `RTCPeerConnection`, `RTCDataChannel`, `getUserMedia` |
| Signaling server | Spring Boot 3.2.3, Java 17, Spring WebSocket |
| Crypto | Web Crypto API (`SubtleCrypto.digest`) for room hashing |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Java 17** and **Maven 3**

### 1. Clone

```bash
git clone https://github.com/dnyaneshagale/chatapp.git
cd chatapp
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

## Deploying to Production

### Frontend → Firebase Hosting

```bash
cd frontend

# 1. Install dependencies (firebase-tools is included as a devDependency)
npm install

# 2. Login and initialise (one-time setup)
npx firebase login
npx firebase init hosting
#    → select your existing Firebase project
#    → set public directory: build
#    → configure as SPA: yes

# 3. Set your project ID in frontend/.firebaserc
#    Replace "your-firebase-project-id" with the real ID

# 4. Build and deploy in one command
npm run deploy
```

The `predeploy` hook runs `npm run build` automatically before every `firebase deploy`.

### Backend → Docker

A multi-stage Dockerfile is included at `backend/Dockerfile`.

```bash
cd backend

# Build the image
docker build -t p2p-chat-signaling .

# Run with production profile and your Firebase frontend origin
docker run -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e ALLOWED_ORIGINS=https://your-app.web.app \
  p2p-chat-signaling
```

| Environment variable | Default | Purpose |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | *(none)* | Set to `prod` to load `application-prod.properties` |
| `ALLOWED_ORIGINS` | `*` (dev) / `https://your-app.web.app` (prod) | Comma-separated CORS origins for the WebSocket endpoint |
| `PORT` | `8080` | Server port (respected by most PaaS platforms automatically) |

Deploy the container to any platform that accepts WebSocket connections (Railway, Fly.io, Cloud Run, etc.).

### Signaling URL auto-detection

`REACT_APP_SIGNAL_URL` is intentionally absent from production builds. The frontend derives it at runtime from `window.location`:

```js
const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
const url   = `${proto}//${window.location.host}/signal`;
```

Host the React build from the **same origin** as the Spring Boot server and no extra config is needed — it connects automatically over `wss://`.

---

## Project Structure

```
chatapp/
├── .gitignore
├── README.md
│
├── backend/                               # Spring Boot WebSocket signaling server
│   ├── Dockerfile                         # Multi-stage build (Maven build → JRE runtime)
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/chatapp/
│       │   ├── ChatAppApplication.java
│       │   ├── config/
│       │   │   └── WebSocketConfig.java   # Registers /signal WebSocket endpoint
│       │   ├── handler/
│       │   │   └── SignalingHandler.java  # join / offer / answer / ICE relay
│       │   └── model/
│       │       └── SignalMessage.java     # Message DTO (Lombok @Data @Builder)
│       └── resources/
│           ├── application.properties
│           └── application-prod.properties  # Production profile (PORT, CORS, log level)
│
└── frontend/                              # React app (Create React App)
    ├── .env.development                   # Local dev signaling URL override
    ├── firebase.json                      # Firebase Hosting config (SPA rewrite, cache, CSP headers)
    ├── .firebaserc                        # Firebase project alias (edit before first deploy)
    ├── tailwind.config.js                 # Neo Brutalist design tokens
    ├── public/
    │   └── index.html
    └── src/
        ├── App.js                         # Root — state orchestration, room hashing
        ├── index.css                      # Tailwind + Neo Brutalist component classes
        ├── index.js
        ├── components/
        │   ├── JoinRoom.jsx               # Landing / room-join screen
        │   ├── ChatWindow.jsx            # Main chat UI, toolbar, drag-and-drop
        │   ├── MessageBubble.jsx         # Message bubble + view-once state machine
        │   ├── MediaViewer.jsx           # Full-screen lightbox (zoom / pan / video)
        │   └── VideoCall.jsx             # Video call overlay with PiP
        └── hooks/
            ├── useWebRTC.js              # RTCPeerConnection, DataChannel, file chunking, media
            ├── useSignaling.js           # WebSocket signaling client
            └── usePrivacy.js            # Screenshot / drag / context-menu guards
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

---

## License

MIT
