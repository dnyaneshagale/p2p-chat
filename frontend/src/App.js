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
  // Anchor base index used by virtualized chat list for prepend-safe history loading.
  const [firstItemIndex, setFirstItemIndex] = useState(10_000);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [appStatus, setAppStatus]       = useState("waiting");
  const [isConnecting, setIsConnecting] = useState(false);
  const [joinError, setJoinError]       = useState("");
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const peerTypingTimeoutRef = useRef(null);

  const toggleReaction = useCallback((message, emoji, actor) => {
    if (!message) return message;
    const normalized = (Array.isArray(message.reactions) ? message.reactions : []).map((r) => {
      if (typeof r === "string") return { emoji: r, count: 1, reactors: [] };
      const reactors = Array.isArray(r.reactors) ? [...r.reactors] : [];
      return { emoji: r.emoji, count: r.count ?? Math.max(reactors.length, 1), reactors };
    }).filter((r) => !!r.emoji);

    const targetIdxBefore = normalized.findIndex((r) => r.emoji === emoji);
    const actorHadTargetBefore = targetIdxBefore >= 0 && normalized[targetIdxBefore].reactors.includes(actor);

    // Enforce one reaction per user: first remove actor from every emoji.
    let next = normalized.map((r) => {
      const reactors = r.reactors.filter((x) => x !== actor);
      return { ...r, reactors, count: Math.max(reactors.length, 0) };
    }).filter((r) => r.count > 0 || r.reactors.length > 0);

    // If actor clicked the same emoji they already had, treat as remove/toggle-off.
    if (actorHadTargetBefore) {
      return { ...message, reactions: next };
    }

    const targetIdx = next.findIndex((r) => r.emoji === emoji);
    if (targetIdx >= 0) {
      next[targetIdx] = {
        ...next[targetIdx],
        reactors: [...next[targetIdx].reactors, actor],
        count: (next[targetIdx].count || 0) + 1,
      };
    } else {
      next.push({ emoji, reactors: [actor], count: 1 });
    }

    return { ...message, reactions: next };
  }, []);
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

    if (msg.type === "reaction-toggle") {
      setMessages((prev) => prev.map((m) => (
        m.id === msg.messageId ? toggleReaction(m, msg.emoji, msg.from || "Peer") : m
      )));
      return;
    }

    if (msg.type === "delivery-update") {
      setMessages((prev) => prev.map((m) => (
        m.id === msg.messageId
          ? {
              ...m,
              status: msg.status || "delivered",
            }
          : m
      )));
      return;
    }

    if (msg.type === "typing-status") {
      setIsPeerTyping(!!msg.isTyping);
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
      if (msg.isTyping) {
        peerTypingTimeoutRef.current = setTimeout(() => {
          setIsPeerTyping(false);
          peerTypingTimeoutRef.current = null;
        }, 1800);
      } else {
        peerTypingTimeoutRef.current = null;
      }
      return;
    }

    if (msg.type === "file-offer") {
      setMessages((prev) => [...prev, {
        id: msg.id,
        from: msg.from || "Peer",
        fileName: msg.fileName,
        fileType: msg.fileType,
        timestamp: msg.timestamp || Date.now(),
        isSelf: false,
        viewOnce: !!msg.viewOnce,
        viewOnceConsumed: false,
        transfer: msg.transfer,
      }]);
      return;
    }

    // Incoming file transfer progress (receiver-side live preview)
    if (msg.type === "file-transfer-start") {
      setMessages((prev) => {
        const existingIdx = prev.findIndex((m) => m.id === msg.id);
        if (existingIdx === -1) {
          return [...prev, {
            id: msg.id,
            from: msg.from || "Peer",
            fileName: msg.fileName,
            fileType: msg.fileType,
            timestamp: msg.timestamp || Date.now(),
            isSelf: false,
            viewOnce: !!msg.viewOnce,
            viewOnceConsumed: false,
            transfer: msg.transfer,
          }];
        }
        return prev.map((m) => (
          m.id === msg.id
            ? {
                ...m,
                fileName: msg.fileName,
                fileType: msg.fileType,
                timestamp: msg.timestamp || m.timestamp,
                viewOnce: !!msg.viewOnce,
                viewOnceConsumed: m.viewOnceConsumed ?? false,
                transfer: msg.transfer,
              }
            : m
        ));
      });
      return;
    }
    if (msg.type === "file-transfer-update") {
      setMessages((prev) => prev.map((m) => (
        m.id === msg.id
          ? { ...m, transfer: { ...(m.transfer || {}), ...(msg.transfer || {}) } }
          : m
      )));
      return;
    }
    if (msg.type === "file-transfer-complete") {
      setMessages((prev) => prev.map((m) => (
        m.id === msg.id
          ? {
              ...m,
              fileUrl: msg.fileUrl,
              fileName: msg.fileName,
              fileType: msg.fileType,
              timestamp: msg.timestamp || m.timestamp,
              viewOnce: !!msg.viewOnce,
              viewOnceConsumed: m.viewOnceConsumed ?? false,
              transfer: msg.transfer,
            }
          : m
      )));
      return;
    }

    if (typeof msg.text === "string") {
      setIsPeerTyping(false);
      if (peerTypingTimeoutRef.current) {
        clearTimeout(peerTypingTimeoutRef.current);
        peerTypingTimeoutRef.current = null;
      }
    }

    setMessages((prev) => [...prev, msg]);
  }, [toggleReaction]);

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
          setJoinError("Could not join: " + (msg.message || "Unknown error"));
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
    sendChatMessage, sendFile, sendReactionToggle, sendFileOfferDecision, sendTypingStatus,
    initiateCall, acceptCall, rejectCall, endCall,
    switchToVideo, toggleMic, toggleCamera,
    localStreamRef, remoteStream, isConnected,
    callState, callType, callStartTime, isMicOn, isCameraOn,
    peerConnectionRef,
  } = webrtcActions;

  // Sync WebRTC connection state → appStatus
  useEffect(() => {
    if (isConnected) setAppStatus("connected");
  }, [isConnected]);

  // ── Leave handler ──────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    if (callState !== "idle") endCall();
    // Reset the PeerConnection before disconnecting so the next session starts
    // with a clean slate. Without this, pcRef.current holds the old closed PC;
    // when the peer rejoins and receives a new offer, the "offer" handler finds
    // a non-null pcRef, skips PC creation, and tries setRemoteDescription on the
    // closed PC — silently failing and leaving the UI stuck at "CONNECTING…".
    webrtcRef.current?.resetPeerConnection();
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

    setJoinError("");
    setUserName(name);
    setDisplayRoom(roomCode);  // keep original for UI display only
    setMessages([]);
    setFirstItemIndex(10_000);
    setHasMoreHistory(false);
    setAppStatus("waiting");
    setIsConnecting(true);
    setRoomId(hashed);         // hashed version flows into useSignaling + useWebRTC

    // joinRoom sets pendingJoin in useSignaling; the WS onopen will replay it
    // automatically even if the socket hasn't opened yet — no setTimeout needed.
    joinRoom(hashed);          // name is never sent to the server
    setIsConnecting(false);
  }, [joinRoom]);

  // Placeholder for reverse infinite-history pagination.
  // When backend pagination is added, prepend older items and decrement firstItemIndex
  // by the number of prepended messages to keep the viewport anchored.
  const handleLoadOlderHistory = useCallback(() => {
    // Example pattern:
    // const older = await fetchOlderMessages(beforeMessageId);
    // setMessages((prev) => [...older, ...prev]);
    // setFirstItemIndex((prev) => prev - older.length);
    // setHasMoreHistory(older.length > 0);
    setHasMoreHistory(false);
  }, []);

  // ── Send text message (optimistic UI) ─────────────────────────────────────
  const handleSendMessage = useCallback((text, replyTo) => {
    const sent = sendChatMessage(text, replyTo);
    if (sent) {
      setMessages((prev) => [...prev, {
        id: sent.id,
        from: userName,
        text,
        replyTo,
        timestamp: sent.timestamp,
        isSelf: true,
        status: "sent",
      }]);
    }
  }, [sendChatMessage, userName]);

  // ── Send file (optimistic UI) ──────────────────────────────────────────────
  // viewOnce: if true the receiver can only see the media once, then it's destroyed
  const handleSendFile = useCallback(async (file, viewOnce = false) => {
    const id = Date.now() + Math.random();
    const url = URL.createObjectURL(file);
    const totalBytes = file.size || 0;
    const safeFileName = file?.name || "file";
    const safeFileType = file?.type || "application/octet-stream";

    setMessages((prev) => [...prev, {
      id,
      from: userName,
      fileUrl: url,
      fileName: safeFileName,
      fileType: safeFileType,
      timestamp: Date.now(),
      isSelf: true,
      viewOnce,
      viewOnceConsumed: false,
      status: "sending",
      transfer: {
        state: "offer", // offer | sending | buffering | sent | failed
        progress: 0,
        sentBytes: 0,
        totalBytes,
      },
    }]);

    const updateTransfer = (patch) => {
      setMessages((prev) => prev.map((m) => (
        m.id === id
          ? {
              ...m,
              transfer: {
                ...(m.transfer || {}),
                ...patch,
              },
            }
          : m
      )));
    };

    try {
      await sendFile(file, viewOnce, ({ stage, progress, sentBytes, totalBytes: tb }) => {
        if (stage === "offer") {
          updateTransfer({
            state: "offer",
            progress: 0,
            sentBytes: 0,
            totalBytes: tb ?? totalBytes,
          });
          return;
        }
        if (stage === "error") {
          updateTransfer({ state: "failed" });
          return;
        }
        if (stage === "done") {
          setMessages((prev) => prev.map((m) => (
            m.id === id
              ? {
                  ...m,
                  status: "sent",
                  transfer: {
                    ...(m.transfer || {}),
                    state: "sent",
                    progress: 100,
                    sentBytes: tb ?? totalBytes,
                    totalBytes: tb ?? totalBytes,
                  },
                }
              : m
          )));
          return;
        }
        updateTransfer({
          state: stage === "buffering" ? "buffering" : "sending",
          progress: progress ?? 0,
          sentBytes: sentBytes ?? 0,
          totalBytes: tb ?? totalBytes,
        });
      }, id);
    } catch (err) {
      console.error("[handleSendFile] Transfer failed:", err.message);
      updateTransfer({ state: "failed" });
      return;
    }
  }, [sendFile, userName]);

  const handleRespondToFileOffer = useCallback((messageId, accept) => {
    if (messageId == null || !accept) return;
    setMessages((prev) => prev.map((m) => (
      m.id === messageId
        ? {
            ...m,
            transfer: {
              ...(m.transfer || {}),
              state: "receiving",
              progress: 0,
            },
          }
        : m
    )));
    sendFileOfferDecision?.(messageId, accept);
  }, [sendFileOfferDecision]);

  // ── Toggle reaction (local + peer sync) ──────────────────────────────────
  const handleToggleReaction = useCallback((messageId, emoji) => {
    setMessages((prev) => prev.map((m) => (
      m.id === messageId ? toggleReaction(m, emoji, userName) : m
    )));
    sendReactionToggle?.(messageId, emoji);
  }, [sendReactionToggle, toggleReaction, userName]);

  const handleConsumeViewOnce = useCallback((messageId) => {
    if (messageId == null) return;
    setMessages((prev) => prev.map((m) => (
      m.id === messageId
        ? {
            ...m,
            viewOnceConsumed: true,
            fileUrl: null,
          }
        : m
    )));
  }, []);

  const handleTypingStatusChange = useCallback((isTyping) => {
    sendTypingStatus?.(isTyping);
  }, [sendTypingStatus]);

  useEffect(() => () => {
    if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!roomId) {
    return <JoinRoom onJoin={handleJoin} isConnecting={isConnecting} joinError={joinError} onClearError={() => setJoinError("")} darkMode={darkMode} onToggleDark={toggleDark} />;
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
        onTypingStatusChange={handleTypingStatusChange}
        onToggleReaction={handleToggleReaction}
        onRespondToFileOffer={handleRespondToFileOffer}
        onConsumeViewOnce={handleConsumeViewOnce}
        onLoadOlderHistory={handleLoadOlderHistory}
        hasMoreHistory={hasMoreHistory}
        firstItemIndex={firstItemIndex}
        onStartVoiceCall={() => initiateCall("voice")}
        onStartVideoCall={() => initiateCall("video")}
        onEndCall={endCall}
        onLeave={handleLeave}
        darkMode={darkMode}
        onToggleDark={toggleDark}
        callState={callState}
        callType={callType}
        status={appStatus}
        isPeerTyping={isPeerTyping}
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
          peerConnectionRef={peerConnectionRef}
        />
      )}
    </>
  );
}
