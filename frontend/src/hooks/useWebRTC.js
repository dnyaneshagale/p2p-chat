import { useRef, useCallback, useEffect, useState } from "react";

// ──────────────────────────────────────────────────────────────────────────────
// ICE / STUN+TURN configuration
// TURN credentials are fetched dynamically from the backend (Cloudflare TURN).
// ──────────────────────────────────────────────────────────────────────────────
const FALLBACK_ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function getTurnBaseUrl() {
  const wsUrl = process.env.REACT_APP_SIGNAL_URL || "";
  if (wsUrl) {
    return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/signal$/, "");
  }
  return window.location.origin;
}

async function fetchIceConfig() {
  try {
    const res = await fetch(`${getTurnBaseUrl()}/api/turn-credentials`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const hasTurn = data.iceServers?.some((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.some((u) => u.startsWith("turn:") || u.startsWith("turns:"));
    });
    console.log("[ICE] Fetched TURN credentials:", data.iceServers?.length, "servers, hasTURN:", hasTurn);
    return { iceServers: data.iceServers };
  } catch (err) {
    console.warn("[ICE] Failed to fetch TURN credentials, using STUN only:", err.message);
    return FALLBACK_ICE_CONFIG;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Audio processing — Web Audio API chain for cleaner mic input
// Noise gate silences background when you're not speaking.
// Filters narrow the band to voice frequencies, cutting rumble & hiss.
// ──────────────────────────────────────────────────────────────────────────────
function createAudioProcessingChain(rawStream) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    // iOS Safari (and some Android WebViews) start AudioContext in "suspended" state.
    // If we don't resume it here the entire processing chain outputs silence —
    // the peer receives an active-but-silent audio track instead of voice.
    ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(rawStream);

    // ── 1. High-pass: aggressively cut below 100 Hz ─────────────────────
    // Removes room rumble, AC hum, wind, handling noise
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 100;
    highpass.Q.value = 1.0;

    // ── 2. Low-pass: cut above 12 kHz ───────────────────────────────────
    // Removes high-frequency hiss, electronic buzzing
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 12000;
    lowpass.Q.value = 0.7;

    // ── 3. Voice presence boost: +3 dB at 2.5 kHz ──────────────────────
    // Makes speech cut through without raising overall level (and noise)
    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2500;
    presence.Q.value = 1.2;
    presence.gain.value = 3;

    // ── 4. Noise gate via analyser + gain automation ────────────────────
    // When RMS drops below threshold → mute. Voice resumes → unmute.
    // Uses setInterval (not rAF) so it works when tab is in background.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.4;

    const gateGain = ctx.createGain();
    gateGain.gain.value = 0; // start closed

    const dataArray = new Float32Array(analyser.fftSize);
    const GATE_OPEN_DB  = -50;  // open when signal rises above this
    const GATE_CLOSE_DB = -58;  // close when drops below (hysteresis prevents chatter)
    const ATTACK  = 0.008;      // 8 ms open — fast so words aren't clipped
    const RELEASE = 0.12;       // 120 ms close — smooth fade, no abrupt chop
    let gateOpen = false;

    const gateInterval = setInterval(() => {
      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sum / dataArray.length);
      const dB = rms > 0 ? 20 * Math.log10(rms) : -100;

      const now = ctx.currentTime;
      if (!gateOpen && dB > GATE_OPEN_DB) {
        gateOpen = true;
        gateGain.gain.cancelScheduledValues(now);
        gateGain.gain.setTargetAtTime(1.0, now, ATTACK);
      } else if (gateOpen && dB < GATE_CLOSE_DB) {
        gateOpen = false;
        gateGain.gain.cancelScheduledValues(now);
        gateGain.gain.setTargetAtTime(0.0, now, RELEASE);
      }
    }, 30); // ~33 Hz polling

    // ── 5. Light compressor (after gate) — smooths volume peaks ─────────
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;  // only compress loud peaks
    compressor.knee.value = 10;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    // Chain: mic → highpass → lowpass → analyser → gate → presence → compressor → out
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(analyser);
    analyser.connect(gateGain);
    gateGain.connect(presence);
    presence.connect(compressor);

    const dest = ctx.createMediaStreamDestination();
    compressor.connect(dest);

    // Carry over any video tracks from the original stream
    const processed = dest.stream;
    rawStream.getVideoTracks().forEach((vt) => processed.addTrack(vt));

    // Store refs for cleanup
    processed._audioCtx = ctx;
    processed._rawStream = rawStream;
    processed._gateInterval = gateInterval;

    // Re-resume the AudioContext whenever the tab becomes visible again.
    // Mobile browsers (iOS/Android) suspend it when the app goes to background.
    const resumeAudioCtx = () => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", resumeAudioCtx);
    processed._resumeListener = resumeAudioCtx;

    console.log("[Audio] Chain: highpass→lowpass→gate→presence→compressor");
    return processed;
  } catch (err) {
    console.warn("[Audio] Web Audio processing unavailable, using raw mic:", err.message);
    return rawStream;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Opus SDP optimization — dramatically improves voice quality over lossy networks
// ──────────────────────────────────────────────────────────────────────────────
function optimizeOpusSdp(sdp) {
  // Find Opus payload type from rtpmap line
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000/);
  if (!opusMatch) return sdp;
  const pt = opusMatch[1];

  // Desired Opus parameters
  const opusParams = {
    minptime:                 "10",
    useinbandfec:             "1",     // Forward Error Correction — recovers lost packets
    usedtx:                   "0",     // DTX off — prevents silence detection from muting audio
    maxaveragebitrate:        "64000", // 64 kbps — high quality mono voice
    stereo:                   "0",     // Mono — better quality per bit for voice
    cbr:                      "0",     // VBR — adapts quality to content
  };

  const fmtpRegex = new RegExp(`a=fmtp:${pt} (.+)`);
  const fmtpMatch = sdp.match(fmtpRegex);

  if (fmtpMatch) {
    // Parse existing params, merge ours (don't clobber browser defaults)
    const existing = {};
    fmtpMatch[1].split(";").forEach((p) => {
      const [k, v] = p.trim().split("=");
      if (k) existing[k] = v;
    });
    // Our params override existing — but keep any browser params we didn't specify
    const merged = { ...existing, ...opusParams };
    const paramStr = Object.entries(merged).map(([k, v]) => `${k}=${v}`).join(";");
    return sdp.replace(fmtpRegex, `a=fmtp:${pt} ${paramStr}`);
  }
  // No fmtp line yet — add one after the rtpmap
  const paramStr = Object.entries(opusParams).map(([k, v]) => `${k}=${v}`).join(";");
  return sdp.replace(
    `a=rtpmap:${pt} opus/48000/2`,
    `a=rtpmap:${pt} opus/48000/2\r\na=fmtp:${pt} ${paramStr}`
  );
}

/**
 * Tune audio sender bitrate + priority after tracks are added.
 * Uses RTCRtpSender.setParameters for runtime bitrate control.
 */
function tuneAudioSenders(pc) {
  if (!pc) return;
  pc.getSenders().forEach((sender) => {
    if (sender.track?.kind !== "audio") return;
    try {
      const params = sender.getParameters();
      // Only modify existing encodings — never create new ones
      if (!params.encodings?.length) return;
      params.encodings[0].maxBitrate = 64_000;        // 64 kbps
      params.encodings[0].priority = "high";
      params.encodings[0].networkPriority = "high";
      sender.setParameters(params).catch(() => {});
    } catch (_) {}
  });
}

// File transfer constants
const CHUNK_SIZE = 64 * 1024;
const BUFFER_HIGH_WATER = 8 * 1024 * 1024;
const BUFFER_LOW_WATER  = 1 * 1024 * 1024;

/**
 * useWebRTC — WebRTC peer connection, data channels, media streams,
 * and WhatsApp-style voice + video call flow.
 *
 * Call states:  idle → outgoing-ringing / incoming-ringing
 *               → connecting → active → ended → idle
 */
export function useWebRTC(roomId, userName, sendSignal, onMessage) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const pcRef          = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);
  const onMessageRef   = useRef(onMessage);
  const userNameRef    = useRef(userName);
  const isNegotiating  = useRef(false);
  const iceConfigRef   = useRef(FALLBACK_ICE_CONFIG);
  const callTypeRef    = useRef(null);   // "video" | "voice" | null
  const callStateRef   = useRef("idle"); // mirror of callState for non-stale reads
  const isPolitePeerRef = useRef(false); // true = we answered the first offer (polite)

  const incomingFileRef = useRef({
    name: "", type: "", size: 0, chunks: [], receivedSize: 0, viewOnce: false,
  });

  // ── State ─────────────────────────────────────────────────────────────────
  const [remoteStream, setRemoteStream]   = useState(null);
  const [isConnected, setIsConnected]     = useState(false);
  const [isMicOn, setIsMicOn]             = useState(true);
  const [isCameraOn, setIsCameraOn]       = useState(true);
  const [callState, setCallState]         = useState("idle");
  const [callType, setCallType]           = useState(null);
  const [callStartTime, setCallStartTime] = useState(null);

  // Keep refs in sync
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { userNameRef.current  = userName;  }, [userName]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Fetch TURN credentials on mount so they're ready before the first call
  useEffect(() => {
    let cancelled = false;
    fetchIceConfig().then((c) => { if (!cancelled) iceConfigRef.current = c; });
    return () => { cancelled = true; };
  }, []);

  // Helper: ensure fresh TURN creds before any connection
  const ensureFreshIceConfig = useCallback(async () => {
    try {
      const cfg = await fetchIceConfig();
      iceConfigRef.current = cfg;
      return cfg;
    } catch {
      return iceConfigRef.current;
    }
  }, []);

  // ── DataChannel send helper ───────────────────────────────────────────────
  const dcSend = useCallback((obj) => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === "open") {
      try { dc.send(JSON.stringify(obj)); } catch (_) {}
    }
  }, []);

  // ── getUserMedia helper ───────────────────────────────────────────────────
  const acquireMedia = useCallback(async (type) => {
    const constraints = {
      audio: {
        // Standard W3C constraints
        echoCancellation:  { ideal: true },
        noiseSuppression:  { ideal: true },
        autoGainControl:   { ideal: true },
        // Chrome-specific advanced noise handling (ignored by other browsers)
        googNoiseSuppression:  { ideal: true },
        googNoiseSuppression2: { ideal: true },
        googHighpassFilter:    { ideal: true },
        googEchoCancellation:  { ideal: true },
        googAutoGainControl:   { ideal: true },
      },
    };
    if (type === "video") {
      constraints.video = {
        width: { ideal: 1280 }, height: { ideal: 720 },
        frameRate: { ideal: 30 }, facingMode: "user",
      };
    }
    const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
    // Apply Web Audio processing chain for cleaner voice
    return createAudioProcessingChain(rawStream);
  }, []);

  // ── Cleanup call media & state ────────────────────────────────────────────
  const cleanupCall = useCallback((immediate = true) => {
    const pc = pcRef.current;
    if (pc) {
      pc.getSenders().forEach((sender) => {
        if (sender.track) { try { pc.removeTrack(sender); } catch (_) {} }
      });
    }
    const stream = localStreamRef.current;
    if (stream) {
      // Remove visibilitychange listener before closing context
      if (stream._resumeListener) {
        try { document.removeEventListener("visibilitychange", stream._resumeListener); } catch (_) {}
      }
      // Close the Web Audio processing context + noise gate timer
      if (stream._gateInterval) {
        try { clearInterval(stream._gateInterval); } catch (_) {}
      }
      if (stream._audioCtx) {
        try { stream._audioCtx.close(); } catch (_) {}
      }
      // Stop both processed and raw tracks
      if (stream._rawStream) {
        stream._rawStream.getTracks().forEach((t) => t.stop());
      }
      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (immediate) setCallState("idle");
    setCallType(null);
    callTypeRef.current = null;
    setCallStartTime(null);
    setRemoteStream(null);
    setIsMicOn(true);
    setIsCameraOn(true);
  }, []);

  // ── RTCPeerConnection factory ─────────────────────────────────────────────
  const iceRestartInProgress = useRef(false);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) pcRef.current.close();

    console.log("[WebRTC] Creating PeerConnection with", iceConfigRef.current.iceServers?.length, "ICE servers");
    const pc = new RTCPeerConnection(iceConfigRef.current);
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log("[ICE] Candidate:", candidate.type, candidate.protocol, candidate.address ? "(has addr)" : "");
        sendSignal({ type: "ice-candidate", roomId, payload: candidate.toJSON() });
      }
    };

    pc.onicecandidateerror = (e) => {
      console.warn("[ICE] Candidate error:", e.errorCode, e.errorText, e.url);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[ICE] Connection state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed" && !iceRestartInProgress.current) {
        console.warn("[ICE] Connection failed — attempting ICE restart with fresh TURN creds");
        iceRestartInProgress.current = true;
        ensureFreshIceConfig().then((cfg) => {
          try {
            pc.setConfiguration(cfg);
          } catch (e) {
            console.warn("[ICE] setConfiguration failed (OK on some browsers):", e.message);
          }
          pc.createOffer({ iceRestart: true }).then((offer) => {
            offer.sdp = optimizeOpusSdp(offer.sdp);
            pc.setLocalDescription(offer).then(() => {
              sendSignal({ type: "offer", roomId, payload: { sdp: pc.localDescription } });
              console.log("[ICE] Restart offer sent");
            });
          }).catch((e) => console.error("[ICE] Restart failed:", e));
        }).finally(() => {
          setTimeout(() => { iceRestartInProgress.current = false; }, 5000);
        });
      }
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        iceRestartInProgress.current = false;
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setIsConnected(true);
      } else if (["failed", "closed"].includes(pc.connectionState)) {
        // "disconnected" is transient — browser retries ICE automatically.
        // Only mark disconnected on terminal states to avoid false UI flickers.
        setIsConnected(false);
      }
    };

    pc.ontrack = (event) => {
      console.log("[WebRTC] Remote track:", event.track.kind, "muted:", event.track.muted);

      const rebuildRemoteStream = () => {
        const allTracks = pc.getReceivers().map((r) => r.track).filter(Boolean);
        setRemoteStream(allTracks.length ? new MediaStream(allTracks) : null);
      };

      // Rebuild stream immediately
      rebuildRemoteStream();

      // Also listen for unmute — tracks start muted before media flows.
      // When the first frames arrive, unmute fires and we rebuild so
      // React detects the change (especially for video appearing later).
      event.track.onunmute = () => {
        console.log("[WebRTC] Remote track unmuted:", event.track.kind);
        rebuildRemoteStream();
      };

      // Track ended — rebuild without it
      event.track.onended = () => {
        console.log("[WebRTC] Remote track ended:", event.track.kind);
        rebuildRemoteStream();
      };

      // Transition connecting → active when remote track arrives
      setCallState((prev) => {
        if (prev === "connecting" || prev === "outgoing-ringing") {
          setCallStartTime(Date.now());
          return "active";
        }
        return prev;
      });
    };

    pc.onnegotiationneeded = async () => {
      try {
        if (isNegotiating.current) return;
        isNegotiating.current = true;
        const offer = await pc.createOffer();
        offer.sdp = optimizeOpusSdp(offer.sdp);
        await pc.setLocalDescription(offer);
        sendSignal({ type: "offer", roomId, payload: { sdp: pc.localDescription } });
        // Tune audio senders after renegotiation
        setTimeout(() => tuneAudioSenders(pc), 500);
      } catch (err) {
        console.error("[WebRTC] Renegotiation failed:", err);
      } finally {
        isNegotiating.current = false;
      }
    };

    pc.onsignalingstatechange = () => {
      if (pc.signalingState === "stable") isNegotiating.current = false;
    };

    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
      dataChannelRef.current = event.channel;
    };

    return pc;
  }, [roomId, sendSignal, ensureFreshIceConfig]);

  // ── Data channel setup ────────────────────────────────────────────────────
  const setupDataChannel = useCallback((channel) => {
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      setIsConnected(true);
      try {
        channel.send(JSON.stringify({ type: "peer-hello", name: userNameRef.current }));
      } catch (_) {}
    };

    channel.onclose = () => setIsConnected(false);
    channel.onerror = (err) => console.error("[DataChannel] Error:", err);

    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) { handleIncomingChunk(event.data); return; }

      try {
        const p = JSON.parse(event.data);

        // File transfer
        if (p.type === "file-meta") {
          incomingFileRef.current = {
            name: p.name, type: p.fileType, size: p.size,
            chunks: [], receivedSize: 0, viewOnce: !!p.viewOnce,
          };
          return;
        }
        if (p.type === "file-end") { assembleFile(); return; }
        if (p.type === "file-cancel") {
          console.warn("[DataChannel] Peer cancelled file transfer.");
          incomingFileRef.current = { name: "", type: "", size: 0, chunks: [], receivedSize: 0, viewOnce: false };
          return;
        }

        // Peer name
        if (p.type === "peer-hello") {
          onMessageRef.current?.({ type: "peer-hello", name: p.name });
          return;
        }

        // Call signaling
        if (["call-invite", "call-accept", "call-reject", "call-end"].includes(p.type)) {
          onMessageRef.current?.({ type: p.type, callType: p.callType });
          return;
        }

        // Chat message
        onMessageRef.current?.({
          id: Date.now(), from: p.from ?? "Peer", text: p.text,
          replyTo: p.replyTo ?? null, timestamp: p.timestamp ?? Date.now(), isSelf: false,
        });
      } catch {
        onMessageRef.current?.({
          id: Date.now(), from: "Peer", text: event.data,
          timestamp: Date.now(), isSelf: false,
        });
      }
    };
  }, []);

  // ── File chunking helpers ─────────────────────────────────────────────────
  const handleIncomingChunk = (buffer) => {
    const f = incomingFileRef.current;
    f.chunks.push(buffer);
    f.receivedSize += buffer.byteLength;
  };

  const assembleFile = () => {
    const { name, type, chunks, viewOnce } = incomingFileRef.current;
    const blob = new Blob(chunks, { type });
    const url = URL.createObjectURL(blob);
    onMessageRef.current?.({
      id: Date.now(), from: "Peer", fileUrl: url, fileName: name, fileType: type,
      timestamp: Date.now(), isSelf: false, viewOnce: !!viewOnce,
    });
    incomingFileRef.current = { name: "", type: "", size: 0, chunks: [], receivedSize: 0, viewOnce: false };
  };

  // ── Public: Initiate P2P ──────────────────────────────────────────────────
  const initiatePeerConnection = useCallback(async () => {
    // Always fetch fresh TURN credentials before creating the connection
    await ensureFreshIceConfig();
    isPolitePeerRef.current = false; // we are the initiator (impolite)
    // Set the flag BEFORE createDataChannel so onnegotiationneeded (which fires
    // async when the channel is created) sees it and skips its own offer — we
    // are about to create the offer manually below.
    isNegotiating.current = true;
    const pc = createPeerConnection();
    const dc = pc.createDataChannel("chat", { ordered: true });
    setupDataChannel(dc);
    dataChannelRef.current = dc;
    try {
      const offer = await pc.createOffer();
      offer.sdp = optimizeOpusSdp(offer.sdp);
      await pc.setLocalDescription(offer);
      sendSignal({ type: "offer", roomId, payload: { sdp: pc.localDescription } });
    } finally {
      isNegotiating.current = false;
    }
  }, [createPeerConnection, setupDataChannel, roomId, sendSignal, ensureFreshIceConfig]);

  // ── Public: Handle signaling ──────────────────────────────────────────────
  const handleSignalMessage = useCallback(async (msg) => {
    switch (msg.type) {
      case "offer": {
        let pc = pcRef.current;
        if (!pc) {
          // First offer — fetch fresh TURN credentials before creating PC
          await ensureFreshIceConfig();
          isPolitePeerRef.current = true; // we are the answerer (polite)
          pc = createPeerConnection();
        }
        // Handle offer collision ("glare")
        const collision = pc.signalingState === "have-local-offer" || isNegotiating.current;
        if (collision) {
          if (!isPolitePeerRef.current) {
            // Impolite peer — ignore incoming offer, ours takes priority
            console.log("[WebRTC] Ignoring colliding offer (impolite peer)");
            break;
          }
          // Polite peer — rollback our pending offer and accept theirs
          console.log("[WebRTC] Rolling back local offer (polite peer, glare)");
          await pc.setLocalDescription({ type: "rollback" });
          isNegotiating.current = false;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
        // Add any local media tracks not yet on the connection
        const ls = localStreamRef.current;
        if (ls) {
          const senderIds = new Set(pc.getSenders().map((s) => s.track?.id).filter(Boolean));
          ls.getTracks().forEach((t) => { if (!senderIds.has(t.id)) pc.addTrack(t, ls); });
        }
        const answer = await pc.createAnswer();
        answer.sdp = optimizeOpusSdp(answer.sdp);
        await pc.setLocalDescription(answer);
        sendSignal({ type: "answer", roomId, payload: { sdp: pc.localDescription } });
        // Tune audio senders after answer is set
        setTimeout(() => tuneAudioSenders(pc), 500);
        break;
      }
      case "answer": {
        if (pcRef.current) await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
        break;
      }
      case "ice-candidate": {
        if (pcRef.current && msg.payload) {
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.payload)); } catch (_) {}
        }
        break;
      }
      default: break;
    }
  }, [createPeerConnection, roomId, sendSignal, ensureFreshIceConfig]);

  // ── Public: Send chat message ─────────────────────────────────────────────
  const sendChatMessage = useCallback((text, replyTo = null) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") return null;
    const msg = { type: "chat", from: userName, text, replyTo, timestamp: Date.now() };
    dc.send(JSON.stringify(msg));
    return msg;
  }, [userName]);

  // ── Public: Send file ─────────────────────────────────────────────────────
  const sendFile = useCallback(async (file, viewOnce = false) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") return;
    try {
      dc.send(JSON.stringify({
        type: "file-meta", name: file.name, fileType: file.type,
        size: file.size, viewOnce: !!viewOnce,
      }));
      dc.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
      const buffer = await file.arrayBuffer();
      let offset = 0;
      while (offset < buffer.byteLength) {
        // Abort if the channel closed while we were waiting on backpressure
        if (dc.readyState !== "open") {
          console.warn("[sendFile] DataChannel closed mid-transfer, aborting");
          return;
        }
        if (dc.bufferedAmount > BUFFER_HIGH_WATER) {
          await new Promise((resolve) => {
            const prev = dc.onbufferedamountlow;
            dc.onbufferedamountlow = () => { dc.onbufferedamountlow = prev ?? null; resolve(); };
          });
          // Re-check after waiting
          if (dc.readyState !== "open") {
            console.warn("[sendFile] DataChannel closed while draining buffer, aborting");
            return;
          }
        }
        dc.send(buffer.slice(offset, offset + CHUNK_SIZE));
        offset += CHUNK_SIZE;
      }
      dc.send(JSON.stringify({ type: "file-end" }));
    } catch (err) {
      console.error("[sendFile] Transfer failed:", err.message);
      // Attempt to notify the peer that the transfer was cancelled
      try {
        if (dc.readyState === "open") dc.send(JSON.stringify({ type: "file-cancel" }));
      } catch (_) {}
      throw err; // re-throw so caller can show an error
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // CALL MANAGEMENT — WhatsApp-style
  // ═══════════════════════════════════════════════════════════════════════════

  /** Initiate a call. */
  const initiateCall = useCallback((type) => {
    if (callStateRef.current !== "idle") return;
    callTypeRef.current = type;
    setCallType(type);
    setCallState("outgoing-ringing");
    dcSend({ type: "call-invite", callType: type });
  }, [dcSend]);

  /** Accept incoming call. */
  const acceptCall = useCallback(async () => {
    if (callStateRef.current !== "incoming-ringing") return;
    const type = callTypeRef.current;
    setCallState("connecting");
    try {
      const stream = await acquireMedia(type);
      localStreamRef.current = stream;
      // Don't add tracks to PC yet — the caller will send a renegotiation
      // offer after receiving call-accept, and we add our tracks when
      // handling that offer. This avoids "glare" (simultaneous offers).
      dcSend({ type: "call-accept", callType: type });
      setIsMicOn(true);
      setIsCameraOn(type === "video");
    } catch (err) {
      console.error("[Call] getUserMedia failed:", err);
      dcSend({ type: "call-reject" });
      cleanupCall(true);
    }
  }, [acquireMedia, dcSend, cleanupCall]);

  /** Reject incoming call. */
  const rejectCall = useCallback(() => {
    if (callStateRef.current !== "incoming-ringing") return;
    dcSend({ type: "call-reject" });
    cleanupCall(true);
  }, [dcSend, cleanupCall]);

  /** End an active or ringing call. */
  const endCall = useCallback(() => {
    dcSend({ type: "call-end" });
    setCallState("ended");
    setTimeout(() => cleanupCall(true), 1200);
  }, [dcSend, cleanupCall]);

  /** Handle incoming call-invite. */
  const handleCallInvite = useCallback((type) => {
    if (callStateRef.current !== "idle") {
      dcSend({ type: "call-reject" });
      return;
    }
    callTypeRef.current = type;
    setCallType(type);
    setCallState("incoming-ringing");
  }, [dcSend]);

  /** Handle call-accept from peer. */
  const handleCallAccepted = useCallback(async (type) => {
    if (callStateRef.current !== "outgoing-ringing") return;
    setCallState("connecting");
    try {
      const stream = await acquireMedia(type || callTypeRef.current);
      localStreamRef.current = stream;
      const pc = pcRef.current;
      if (pc) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        // Tune audio bitrate + priority after adding tracks
        setTimeout(() => tuneAudioSenders(pc), 500);
      }
      setIsMicOn(true);
      setIsCameraOn((type || callTypeRef.current) === "video");
      // callStartTime & "active" state are set by ontrack when remote media arrives
    } catch (err) {
      console.error("[Call] getUserMedia failed:", err);
      dcSend({ type: "call-end" });
      cleanupCall(true);
    }
  }, [acquireMedia, dcSend, cleanupCall]);

  /** Handle call-reject from peer. */
  const handleCallRejected = useCallback(() => {
    if (callStateRef.current === "outgoing-ringing") {
      setCallState("ended");
      setTimeout(() => cleanupCall(true), 2000);
    }
  }, [cleanupCall]);

  /** Handle call-end from peer. */
  const handleCallEnd = useCallback(() => {
    if (callStateRef.current !== "idle") {
      setCallState("ended");
      setTimeout(() => cleanupCall(true), 1200);
    }
  }, [cleanupCall]);

  // ── Toggle mic ────────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const a = s.getAudioTracks()[0];
    if (a) { a.enabled = !a.enabled; setIsMicOn(a.enabled); }
  }, []);

  // ── Toggle camera ─────────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const v = s.getVideoTracks()[0];
    if (v) { v.enabled = !v.enabled; setIsCameraOn(v.enabled); }
  }, []);

  // ── Switch voice → video mid-call ─────────────────────────────────────────
  const switchToVideo = useCallback(async () => {
    if (callStateRef.current !== "active" || callTypeRef.current === "video") return;
    try {
      const vs = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      });
      const vt = vs.getVideoTracks()[0];
      const pc = pcRef.current;
      const stream = localStreamRef.current;
      if (pc && stream) { stream.addTrack(vt); pc.addTrack(vt, stream); }
      callTypeRef.current = "video";
      setCallType("video");
      setIsCameraOn(true);
    } catch (err) {
      console.error("[Call] switchToVideo failed:", err);
    }
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const s = localStreamRef.current;
      if (s) {
        // Full audio-chain teardown (mirrors cleanupCall logic)
        if (s._resumeListener) { try { document.removeEventListener("visibilitychange", s._resumeListener); } catch (_) {} }
        if (s._gateInterval)   { try { clearInterval(s._gateInterval);                                       } catch (_) {} }
        if (s._audioCtx)       { try { s._audioCtx.close();                                                  } catch (_) {} }
        if (s._rawStream)      { s._rawStream.getTracks().forEach((t) => t.stop()); }
        s.getTracks().forEach((t) => t.stop());
      }
      pcRef.current?.close();
    };
  }, []);

  /**
   * Close the PeerConnection and reset data-channel state without touching
   * call-state. Call this when the signaling server reports "peer-left" so
   * ICE-candidate flow stops immediately (avoids relay-miss errors on server).
   */
  const resetPeerConnection = useCallback(() => {
    dataChannelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setIsConnected(false);
    isNegotiating.current = false;
  }, []);

  return {
    initiatePeerConnection, handleSignalMessage,
    resetPeerConnection,
    sendChatMessage, sendFile,
    // Call management
    initiateCall, acceptCall, rejectCall, endCall,
    handleCallInvite, handleCallAccepted, handleCallRejected, handleCallEnd,
    switchToVideo, toggleMic, toggleCamera,
    // State
    localStreamRef, remoteStream, isConnected,
    callState, callType, callStartTime, isMicOn, isCameraOn,
  };
}
