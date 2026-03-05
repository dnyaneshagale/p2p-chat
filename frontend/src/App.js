import React, { useState, useCallback, useRef, useEffect } from "react";
import JoinRoom      from "./components/JoinRoom";
import ChatWindow    from "./components/ChatWindow";
import IncomingCall  from "./components/IncomingCall";
import CallScreen    from "./components/CallScreen";
import { useSignaling } from "./hooks/useSignaling";
import { useWebRTC }    from "./hooks/useWebRTC";
import { usePrivacy }   from "./hooks/usePrivacy";

// Signaling server URL — derived from REACT_APP_SIGNAL_URL env var or current origin.
const SIGNALING_URL =
  process.env.REACT_APP_SIGNAL_URL ||
  (() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/signal`;
  })();

/**
 * Hashes a room code with SHA-256 before sending to the signaling server.
 * The server only ever sees the hash — it never learns the real room name.
 * Both peers independently compute the same hash from the same code.
 */
async function hashRoomCode(code) {
  const data = new TextEncoder().encode("chatapp\0" + code.trim().toLowerCase());
  const buf  = await crypto.subtle.digest("SHA-256", data);
  // 32 hex chars (128-bit prefix) — more than enough collision resistance
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * App — Root component and state orchestrator.
 *
 * Circular dependency is broken with refs:
 *   handleSignalingMessage → webrtcRef.current  (set after useWebRTC call)
 *   useWebRTC              → stableSendSignal   (proxies sendSignalRef.current)
 *
 * Data flow:
 *   JoinRoom  → handleJoin() → open WS → send "join"
 *   "ready"   → webrtc.initiatePeerConnection() → SDP offer → server → peer
 *   "offer" / "answer" / "ice-candidate" relayed by server → webrtc handler
 *   Data channel opens → isConnected = true → ChatWindow active
 *   All chat / file / video flows P2P — server is no longer in the path
 */
export default function App() {
  // Activate all privacy guards (blur-on-unfocus, block shortcuts, etc.)
  usePrivacy();

  // ── App state ──────────────────────────────────────────────────────────────
  // roomId      — SHA-256 hash of the room code; sent to the signaling server.
  // displayRoom — original code typed by the user; shown in the UI only.
  const [roomId, setRoomId]             = useState(null);
  const [displayRoom, setDisplayRoom]   = useState("");  // never leaves the browser
  const [userName, setUserName]         = useState("");
  const [peerName, setPeerName]         = useState("Peer");
  const [messages, setMessages]         = useState([]);
  const [appStatus, setAppStatus]       = useState("waiting");
  const [isConnecting, setIsConnecting] = useState(false);
  // ── Dark mode ─────────────────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("theme") === "dark"
  );
  const toggleDark = useCallback(() => setDarkMode((d) => !d), []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);
  // ── Refs that break circular dependency ───────────────────────────────────
  // webrtcRef: updated each render with latest webrtcActions so the
  // signaling handler always calls the current, non-stale functions.
  const webrtcRef = useRef(null);

  // sendSignalRef: keeps the latest sendSignal from useSignaling so
  // stableSendSignal (passed to useWebRTC) never becomes stale.
  const sendSignalRef = useRef(() =>
    console.warn("[App] sendSignal called before WS connected")
  );

  // ── Receive messages from WebRTC data channel ──────────────────────────────
  const handleIncomingMessage = useCallback((msg) => {
    // peer-hello is the private name-exchange that happens over the encrypted
    // DataChannel — the server never sees it.
    if (msg.type === "peer-hello") {
      setPeerName(msg.name || "Peer");
      return;
    }
    // Call signaling over data channel
    if (msg.type === "call-invite") {
      webrtcRef.current?.handleCallInvite(msg.callType);
      return;
    }
    if (msg.type === "call-accept") {
      webrtcRef.current?.handleCallAccepted(msg.callType);
      return;
    }
    if (msg.type === "call-reject") {
      webrtcRef.current?.handleCallRejected();
      return;
    }
    if (msg.type === "call-end") {
      webrtcRef.current?.handleCallEnd();
      return;
    }
    setMessages((prev) => [...prev, msg]);
  }, []);

  // ── Signaling message router ───────────────────────────────────────────────
  // Only reads refs — no stale closure issues.
  const handleSignalingMessage = useCallback((msg) => {
    switch (msg.type) {

      case "waiting":
        setAppStatus("waiting");
        break;

      case "ready":
        // We are the initiator — create & send SDP offer
        setAppStatus("connecting");
        webrtcRef.current?.initiatePeerConnection();
        break;

      case "joined":
        // Joined an existing room — wait for the SDP offer from initiator
        setAppStatus("connecting");
        break;

      case "peer-left":
        setAppStatus("peer-left");
        // Close the PeerConnection immediately so ICE-candidate flow stops.
        // Otherwise the browser keeps firing onicecandidate → server tries to relay
        // → relay fails because the peer is gone (was producing an error dialog).
        webrtcRef.current?.resetPeerConnection();
        setMessages((prev) => [...prev, {
          id: Date.now(),
          from: "System",
          text: "⚠️ Your peer has disconnected.",
          timestamp: Date.now(),
          isSelf: false,
          isSystem: true,
        }]);
        break;

      case "offer":
      case "answer":
      case "ice-candidate":
        webrtcRef.current?.handleSignalMessage(msg);
        break;

      case "error": {
        const msg2 = (msg.message || "").toLowerCase();
        // Fatal: room full or auth failure — tell the user and send them back.
        if (msg2.includes("room is full") || msg2.includes("invalid")) {
          console.error("[Signaling] Fatal error:", msg.message);
          alert("Could not join room: " + msg.message);
          setIsConnecting(false);
          setRoomId(null);
        } else {
          // Transient (relay miss, room not found during ICE) — just log.
          console.warn("[Signaling] Non-fatal error (ignored):", msg.message);
        }
        break;
      }

      default:
        console.log("[Signaling] Unhandled type:", msg.type);
    }
  }, []); // Empty deps — only uses refs and setters

  // ── Signaling hook (WS opens only when roomId is set) ─────────────────────
  const { joinRoom, sendSignal, disconnect } = useSignaling(
    roomId ? SIGNALING_URL : null,
    handleSignalingMessage
  );

  // Sync latest sendSignal into ref
  useEffect(() => { sendSignalRef.current = sendSignal; }, [sendSignal]);

  // Stable proxy so useWebRTC's dep array doesn't change on every render
  const stableSendSignal = useCallback(
    (msg) => sendSignalRef.current(msg),
    []
  );

  // ── WebRTC hook ────────────────────────────────────────────────────────────
  const webrtcActions = useWebRTC(
    roomId,
    userName,
    stableSendSignal,
    handleIncomingMessage
  );

  // Always update the ref so handleSignalingMessage sees current actions
  webrtcRef.current = webrtcActions;

  const {
    sendChatMessage, sendFile,
    initiateCall, acceptCall, rejectCall, endCall,
    switchToVideo, toggleMic, toggleCamera,
    localStreamRef, remoteStream, isConnected,
    callState, callType, callStartTime, isMicOn, isCameraOn,
  } = webrtcActions;

  // Sync WebRTC connection state → appStatus
  useEffect(() => {
    if (isConnected) setAppStatus("connected");
  }, [isConnected]);

  // ── Leave handler ──────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    if (callState !== "idle") endCall();
    disconnect();
    setRoomId(null);
    setDisplayRoom("");
    setPeerName("Peer");
    setMessages([]);
    setAppStatus("waiting");
    setIsConnecting(false);
  }, [callState, endCall, disconnect]);

  // Stable ref so event listeners always call the latest handleLeave
  const handleLeaveRef = useRef(handleLeave);
  useEffect(() => { handleLeaveRef.current = handleLeave; }, [handleLeave]);

  // Intercept browser back button while in a session
  useEffect(() => {
    if (!roomId) return;
    // Push a history entry so the back button has something to pop
    history.pushState({ inSession: true }, "");
    const onPopState = () => handleLeaveRef.current();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [roomId]); // eslint-disable-line

  // Show browser "Leave site?" dialog on reload / tab-close while in a session
  useEffect(() => {
    if (!roomId) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [roomId]);

  // ── Join handler ───────────────────────────────────────────────────────────
  const handleJoin = useCallback(async (roomCode, name) => {
    // Hash before touching any state — setRoomId triggers WS open in useSignaling
    const hashed = await hashRoomCode(roomCode);

    setUserName(name);
    setDisplayRoom(roomCode);  // keep original for UI display only
    setMessages([]);
    setAppStatus("waiting");
    setIsConnecting(true);
    setRoomId(hashed);         // hashed version flows into useSignaling + useWebRTC

    // Delay "join" message slightly to ensure the WS handshake completes
    setTimeout(() => {
      joinRoom(hashed);     // name is never sent to the server
      setIsConnecting(false);
    }, 600);
  }, [joinRoom]);

  // ── Send text message (optimistic UI) ─────────────────────────────────────
  const handleSendMessage = useCallback((text, replyTo) => {
    const sent = sendChatMessage(text, replyTo);
    if (sent) {
      setMessages((prev) => [...prev, {
        id: Date.now(),
        from: userName,
        text,
        replyTo,
        timestamp: sent.timestamp,
        isSelf: true,
      }]);
    }
  }, [sendChatMessage, userName]);

  // ── Send file (optimistic UI) ──────────────────────────────────────────────
  // viewOnce: if true the receiver can only see the media once, then it's destroyed
  const handleSendFile = useCallback(async (file, viewOnce = false) => {
    await sendFile(file, viewOnce);
    const url = URL.createObjectURL(file);
    setMessages((prev) => [...prev, {
      id: Date.now(),
      from: userName,
      fileUrl: url,
      fileName: file.name,
      fileType: file.type,
      timestamp: Date.now(),
      isSelf: true,
      viewOnce,
    }]);
  }, [sendFile, userName]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!roomId) {
    return <JoinRoom onJoin={handleJoin} isConnecting={isConnecting} darkMode={darkMode} onToggleDark={toggleDark} />;
  }

  // Is any call overlay active?
  const isCallActive = callState !== "idle";

  return (
    <>
      <ChatWindow
        userName={userName}
        peerName={peerName}
        roomId={displayRoom}
        isConnected={isConnected}
        messages={messages}
        onSendMessage={handleSendMessage}
        onSendFile={handleSendFile}
        onStartVoiceCall={() => initiateCall("voice")}
        onStartVideoCall={() => initiateCall("video")}
        onEndCall={endCall}
        onLeave={handleLeave}
        darkMode={darkMode}
        onToggleDark={toggleDark}
        callState={callState}
        callType={callType}
        status={appStatus}
      />

      {/* Incoming call overlay — highest z-index */}
      {callState === "incoming-ringing" && (
        <IncomingCall
          peerName={peerName}
          callType={callType}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {/* Active call screen — outgoing-ringing, connecting, active, ended */}
      {(callState === "outgoing-ringing" || callState === "connecting" ||
        callState === "active" || callState === "ended") && (
        <CallScreen
          callType={callType || "voice"}
          callState={callState}
          callStartTime={callStartTime}
          localStream={localStreamRef.current}
          remoteStream={remoteStream}
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onEndCall={endCall}
          onSwitchToVideo={switchToVideo}
          peerName={peerName}
        />
      )}
    </>
  );
}
