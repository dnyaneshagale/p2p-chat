import { useRef, useCallback, useEffect, useState } from "react";

// ──────────────────────────────────────────────────────────────────────────────
// ICE / STUN configuration
// Google's public STUN servers help peers discover their public IP/port.
// Add TURN servers here if peers are behind strict NAT/firewalls.
// ──────────────────────────────────────────────────────────────────────────────
const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Max chunk size for sending files over the data channel.
// 64 KB hits the sweet-spot for modern browsers (Chrome/Firefox support ≥256 KB).
const CHUNK_SIZE = 64 * 1024;

// DataChannel send-buffer ceiling — pause chunking if the browser buffer exceeds this.
const BUFFER_HIGH_WATER = 8 * 1024 * 1024;  // 8 MB
const BUFFER_LOW_WATER  = 1 * 1024 * 1024;  // 1 MB (resume threshold)

/**
 * useWebRTC
 *
 * Manages the WebRTC peer connection, data channels, and media streams.
 *
 * Features:
 *   - Text chat over RTCDataChannel (peer-to-peer, no server relay)
 *   - File / media sending (chunked over data channel)
 *   - Video call (getUserMedia + addTrack + remoteStream)
 *
 * @param {string}   roomId      - Room identifier (shared with peer)
 * @param {string}   userName    - Local user display name
 * @param {function} sendSignal  - Function to send signaling messages via WebSocket
 * @param {function} onMessage   - Callback when a chat message or file is received
 *
 * @returns {{
 *   initiatePeerConnection,
 *   handleSignalMessage,
 *   sendChatMessage,
 *   sendFile,
 *   startVideoCall,
 *   endVideoCall,
 *   toggleMic,
 *   toggleCamera,
 *   localStreamRef,
 *   remoteStream,
 *   isConnected,
 *   isVideoCallActive,
 *   isMicOn,
 *   isCameraOn,
 * }}
 */
export function useWebRTC(roomId, userName, sendSignal, onMessage) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const pcRef = useRef(null);          // RTCPeerConnection
  const dataChannelRef = useRef(null); // RTCDataChannel for text & files
  const localStreamRef = useRef(null); // Local camera/mic stream
  const onMessageRef = useRef(onMessage);
  // Keep userName in a ref so the DataChannel onopen closure is never stale
  const userNameRef  = useRef(userName);

  // File reception state (reassembled on receive side)
  const incomingFileRef = useRef({
    name: "", type: "", size: 0, chunks: [], receivedSize: 0, viewOnce: false
  });

  // ── State ─────────────────────────────────────────────────────────────────
  const [remoteStream, setRemoteStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);

  // Keep latest callback ref
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { userNameRef.current  = userName;  }, [userName]);

  // ── RTCPeerConnection factory ─────────────────────────────────────────────

  /**
   * Creates and configures an RTCPeerConnection.
   * Called by both the initiator (on "ready") and the responder (on "offer").
   */
  const createPeerConnection = useCallback(() => {
    // Close existing connection if any
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;

    // ── ICE candidate gathering ───────────────────────────────────────────
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal({
          type: "ice-candidate",
          roomId,
          payload: candidate.toJSON(),
        });
      }
    };

    // ── Connection state changes ──────────────────────────────────────────
    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] Connection state:", pc.connectionState);
      setIsConnected(pc.connectionState === "connected");
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        setIsConnected(false);
        setIsVideoCallActive(false);
      }
    };

    // ── Remote media tracks (video call) ─────────────────────────────────
    pc.ontrack = (event) => {
      console.log("[WebRTC] Remote track received");
      setRemoteStream(event.streams[0] ?? null);
    };

    // ── Incoming data channel (receiver side) ────────────────────────────
    pc.ondatachannel = (event) => {
      console.log("[WebRTC] Data channel received:", event.channel.label);
      setupDataChannel(event.channel);
      dataChannelRef.current = event.channel;
    };

    return pc;
  }, [roomId, sendSignal]);

  // ── Data channel setup ────────────────────────────────────────────────────

  /**
   * Attaches event listeners to an RTCDataChannel.
   * Handles both text messages and binary file chunks.
   */
  const setupDataChannel = useCallback((channel) => {
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      console.log("[DataChannel] Open");
      setIsConnected(true);
      // Send our display name directly to the peer over the encrypted DataChannel.
      // The signaling server never sees this — it travels P2P only.
      try {
        channel.send(JSON.stringify({ type: "peer-hello", name: userNameRef.current }));
      } catch (e) {
        console.warn("[DataChannel] Could not send peer-hello:", e);
      }
    };

    channel.onclose = () => {
      console.log("[DataChannel] Closed");
      setIsConnected(false);
    };

    channel.onerror = (err) => {
      console.error("[DataChannel] Error:", err);
    };

    channel.onmessage = (event) => {
      // ── Binary data → file chunk ─────────────────────────────────────
      if (event.data instanceof ArrayBuffer) {
        handleIncomingChunk(event.data);
        return;
      }

      // ── Text messages ────────────────────────────────────────────────
      try {
        const parsed = JSON.parse(event.data);

        if (parsed.type === "file-meta") {
          // Prepare to receive a new file
          incomingFileRef.current = {
            name: parsed.name,
            type: parsed.fileType,
            size: parsed.size,
            chunks: [],
            receivedSize: 0,
            viewOnce: !!parsed.viewOnce,  // carry the sender's view-once flag
          };
          console.log("[DataChannel] Incoming file:", parsed.name, parsed.size, "bytes", parsed.viewOnce ? "(view once)" : "");
          return;
        }

        if (parsed.type === "file-end") {
          // All chunks received — assemble and deliver the file
          assembleFile();
          return;
        }

        // Private name exchange — never went through the server
        if (parsed.type === "peer-hello") {
          onMessageRef.current?.({ type: "peer-hello", name: parsed.name });
          return;
        }

        // Regular chat message
        onMessageRef.current?.({
          id: Date.now(),
          from: parsed.from ?? "Peer",
          text: parsed.text,
          replyTo: parsed.replyTo ?? null,
          timestamp: parsed.timestamp ?? Date.now(),
          isSelf: false,
        });

      } catch {
        // Plain text fallback
        onMessageRef.current?.({
          id: Date.now(),
          from: "Peer",
          text: event.data,
          timestamp: Date.now(),
          isSelf: false,
        });
      }
    };
  }, []);

  // ── File chunking ─────────────────────────────────────────────────────────

  const handleIncomingChunk = (buffer) => {
    const file = incomingFileRef.current;
    file.chunks.push(buffer);
    file.receivedSize += buffer.byteLength;
  };

  const assembleFile = () => {
    const { name, type, chunks, viewOnce } = incomingFileRef.current;
    const blob = new Blob(chunks, { type });
    const url = URL.createObjectURL(blob);
    onMessageRef.current?.({
      id: Date.now(),
      from: "Peer",
      fileUrl: url,
      fileName: name,
      fileType: type,
      timestamp: Date.now(),
      isSelf: false,
      viewOnce: !!viewOnce,
    });
    incomingFileRef.current = { name: "", type: "", size: 0, chunks: [], receivedSize: 0, viewOnce: false };
  };

  // ── Public: Initiate connection (caller side on "ready" signal) ───────────

  /**
   * Called when the signaling server sends "ready" to the first peer.
   * Creates the peer connection, opens data channel, and sends an SDP offer.
   */
  const initiatePeerConnection = useCallback(async () => {
    const pc = createPeerConnection();

    // Create data channel on the initiator side
    const dc = pc.createDataChannel("chat", { ordered: true });
    setupDataChannel(dc);
    dataChannelRef.current = dc;

    // Create and send SDP offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendSignal({
      type: "offer",
      roomId,
      payload: { sdp: pc.localDescription },
    });

    console.log("[WebRTC] Sent SDP offer");
  }, [createPeerConnection, setupDataChannel, roomId, sendSignal]);

  // ── Public: Handle incoming signaling messages ────────────────────────────

  /**
   * Processes signaling messages forwarded from the Spring Boot server.
   * Routes: offer → send answer | answer → set remote | ice-candidate → add ICE
   */
  const handleSignalMessage = useCallback(async (msg) => {
    switch (msg.type) {

      case "offer": {
        const pc = createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({
          type: "answer",
          roomId,
          payload: { sdp: pc.localDescription },
        });
        console.log("[WebRTC] Received offer → sent answer");
        break;
      }

      case "answer": {
        const pc = pcRef.current;
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
          console.log("[WebRTC] Set remote answer");
        }
        break;
      }

      case "ice-candidate": {
        const pc = pcRef.current;
        if (pc && msg.payload) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
          } catch (err) {
            console.warn("[WebRTC] ICE add failed:", err);
          }
        }
        break;
      }

      default:
        break;
    }
  }, [createPeerConnection, roomId, sendSignal]);

  // ── Public: Send chat text message ───────────────────────────────────────

  /**
   * Sends a text chat message directly to the peer over the data channel.
   * @param {string} text     - Message content
   * @param {Object} replyTo  - Optional: { id, text } of the message being replied to
   */
  const sendChatMessage = useCallback((text, replyTo = null) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") {
      console.warn("[DataChannel] Not ready to send");
      return null;
    }
    const msg = {
      type: "chat",
      from: userName,
      text,
      replyTo,
      timestamp: Date.now(),
    };
    dc.send(JSON.stringify(msg));
    return msg;
  }, [userName]);

  // ── Public: Send a file ───────────────────────────────────────────────────

  /**
   * Sends a File object to the peer over the data channel in 64 KB chunks.
   * Sends metadata first, then binary chunks, then "file-end" marker.
   * @param {File}    file
   * @param {boolean} viewOnce  - If true, receiver may view the media only once
   */
  const sendFile = useCallback(async (file, viewOnce = false) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") {
      console.warn("[DataChannel] Not ready to send file");
      return;
    }

    // Metadata frame
    dc.send(JSON.stringify({
      type: "file-meta",
      name: file.name,
      fileType: file.type,
      size: file.size,
      viewOnce: !!viewOnce,
    }));

    // ── Back-pressure aware chunking ────────────────────────────────────────
    // Set the low-water mark so the browser fires `bufferedamountlow` when the
    // send-buffer drains back below BUFFER_LOW_WATER.
    dc.bufferedAmountLowThreshold = BUFFER_LOW_WATER;

    const buffer = await file.arrayBuffer();
    let offset = 0;

    while (offset < buffer.byteLength) {
      // Pause and wait for the buffer to drain before sending more chunks.
      if (dc.bufferedAmount > BUFFER_HIGH_WATER) {
        await new Promise((resolve) => {
          const prevHandler = dc.onbufferedamountlow;
          dc.onbufferedamountlow = (ev) => {
            dc.onbufferedamountlow = prevHandler ?? null;
            resolve();
          };
        });
      }
      const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
      dc.send(chunk);
      offset += CHUNK_SIZE;
    }

    // End marker
    dc.send(JSON.stringify({ type: "file-end" }));
    console.log("[DataChannel] File sent:", file.name);
  }, []);

  // ── Video call ────────────────────────────────────────────────────────────

  /**
   * Requests camera + microphone access and adds tracks to the peer connection.
   * Renegotiation is handled automatically by the browser (onnegotiationneeded).
   */
  const startVideoCall = useCallback(async () => {
    try {
      // Request HD video — falls back gracefully if the device can't deliver.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:     { ideal: 1280 },
          height:    { ideal: 720  },
          frameRate: { ideal: 30   },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
        },
      });
      localStreamRef.current = stream;

      const pc = pcRef.current;
      if (pc) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      setIsVideoCallActive(true);
      setIsMicOn(true);
      setIsCameraOn(true);
      console.log("[WebRTC] Video call started");
    } catch (err) {
      console.error("[WebRTC] getUserMedia failed:", err);
      alert("Could not access camera/microphone: " + err.message);
    }
  }, []);

  /**
   * Stops all local media tracks and ends the video call.
   */
  const endVideoCall = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setIsVideoCallActive(false);
    setRemoteStream(null);
    console.log("[WebRTC] Video call ended");
  }, []);

  /**
   * Toggles the microphone on/off during a video call.
   */
  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audio = stream.getAudioTracks()[0];
    if (audio) {
      audio.enabled = !audio.enabled;
      setIsMicOn(audio.enabled);
    }
  }, []);

  /**
   * Toggles the camera on/off during a video call.
   */
  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const video = stream.getVideoTracks()[0];
    if (video) {
      video.enabled = !video.enabled;
      setIsCameraOn(video.enabled);
    }
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      endVideoCall();
      pcRef.current?.close();
    };
  }, [endVideoCall]);

  return {
    initiatePeerConnection,
    handleSignalMessage,
    sendChatMessage,
    sendFile,
    startVideoCall,
    endVideoCall,
    toggleMic,
    toggleCamera,
    localStreamRef,
    remoteStream,
    isConnected,
    isVideoCallActive,
    isMicOn,
    isCameraOn,
  };
}
