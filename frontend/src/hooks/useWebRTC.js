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
// WHY THERE IS NO WEB AUDIO PROCESSING CHAIN
// ──────────────────────────────────────────────────────────────────────────────
// A Web Audio API chain (filters → noise gate → compressor → MediaStreamDestination)
// introduces 30–80 ms of pipeline latency onto the outgoing audio track's RTP
// timestamps.  Because audio and video are added to the PeerConnection with the
// same stream reference, Chrome groups them into the same RTCP synchronisation
// context.  The remote peer reads RTCP SR reports and sees:
//   audio RTP ts  →  NTP: wall_clock − 50 ms   (processing delay)
//   video RTP ts  →  NTP: wall_clock
// To maintain A/V sync it holds video back to match the late-timestamped audio.
// Result: audio leads, video permanently lags by exactly the chain latency —
// the longer the call, the more noticeable (video renderer keeps accumulating
// presentation offset).
//
// The browser's built-in audio processing requested via getUserMedia constraints
// (echoCancellation → AEC3, noiseSuppression → RNNoise, autoGainControl → AGC2)
// runs in the native capture pipeline BEFORE timestamps are applied, so it adds
// zero RTP timestamp skew.  Chrome's AEC3 / RNNoise are also higher quality than
// anything achievable with Web Audio biquad nodes for speech.
// ──────────────────────────────────────────────────────────────────────────────

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
    minptime:                  "10",
    ptime:                     "10",     // 10 ms frame size — reduces speech latency vs 20 ms
    maxptime:                  "20",     // 20 ms packets — best latency/quality tradeoff
    useinbandfec:              "1",      // FEC — recovers lost packets without retransmit
    usedtx:                    "0",      // DTX off — no silence-detection dropouts
    maxaveragebitrate:         "128000", // 128 kbps — HD voice (up from 64 kbps)
    "sprop-maxcapturerate":    "48000",  // tell remote we capture at 48 kHz
    maxplaybackrate:           "48000",  // request 48 kHz playback (Opus wideband)
    stereo:                    "0",      // Mono — better quality per bit for voice
    "sprop-stereo":            "0",      // tell remote we send mono (prevents stereo negotiation)
    cbr:                       "0",      // VBR — adapts quality to content
    packetlossperc:            "10",     // tell encoder to expect 10% loss → denser FEC redundancy
    plc:                       "1",      // Packet Loss Concealment — synthesizes missing frames, prevents robotic artifacts
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
 * Ensure Transport-CC RTCP feedback is advertised for every video codec.
 * Transport-CC replaces REMB for bandwidth estimation — it gives the sender
 * fine-grained per-packet RTT and loss info so GCC (Google Congestion Control)
 * can react in <100 ms instead of the 1-2 s REMB cycle.
 * Modern Chrome includes this by default; this makes it explicit for
 * Firefox and Safari which may omit it.
 */
function addTransportCC(sdp) {
  const lines = sdp.split("\r\n");
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    const m = lines[i].match(/^a=rtpmap:(\d+) (?:H264|VP8|VP9|AV1)/i);
    if (m) {
      const pt = m[1];
      if (!lines.some((l) => l === `a=rtcp-fb:${pt} transport-cc`)) {
        result.push(`a=rtcp-fb:${pt} transport-cc`);
      }
    }
  }
  return result.join("\r\n");
}

/** Run all SDP mutations: Opus tuning + Transport-CC injection. */
function processSdp(sdp) {
  return addTransportCC(optimizeOpusSdp(sdp));
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
      if (!params.encodings?.length) return;
      params.encodings[0].maxBitrate      = 128_000; // 128 kbps — matches Opus SDP
      params.encodings[0].minBitrate      = 32_000;  // 32 kbps floor — enough for intelligible speech under severe loss
      params.encodings[0].priority        = "very-high"; // audio survives congestion; GCC cuts video first
      params.encodings[0].networkPriority = "high";
      sender.setParameters(params).catch(() => {});
    } catch (_) {}
  });
}

/**
 * Prefer H.264 → VP8 for video transceivers.  VP9 is intentionally excluded.
 *
 * VP9 on Windows/Android/iOS commonly falls back to software decode (libvpx)
 * which uses a 2-5 frame decode lookahead buffer that audio (Opus) does not
 * have — producing systematic A/V desync that grows over the call.
 * H.264 is hardware-accelerated on virtually every device (Intel QSV,
 * NVIDIA NVDEC, AMD VCN, Apple VideoToolbox, Qualcomm HW decoder).
 * VP8 is the legacy fallback — also hardware on most mobile SoCs.
 *
 * Must be called after addTrack() but before createOffer/createAnswer.
 */
function applyVideoCodecPreferences(pc) {
  if (!pc || typeof RTCRtpReceiver.getCapabilities !== "function") return;
  try {
    const codecs = RTCRtpReceiver.getCapabilities("video")?.codecs ?? [];
    if (!codecs.length) return;
    // H.264 first — hardware en/decode, deterministic latency → frame-accurate A/V sync.
    // VP8 second — hardware on most mobile SoCs, no multi-frame lookahead.
    // VP9 excluded — software decode lookahead causes progressive A/V drift.
    const sorted = [
      ...codecs.filter((c) => c.mimeType === "video/H264"),
      ...codecs.filter((c) => c.mimeType === "video/VP8"),
      ...codecs.filter((c) => !["video/H264", "video/VP8", "video/VP9"].includes(c.mimeType)),
    ];
    if (!sorted.length) return;
    pc.getTransceivers().forEach((tc) => {
      try {
        if (tc.sender.track?.kind === "video") tc.setCodecPreferences(sorted);
      } catch (_) {}
    });
  } catch (_) {}
}

/**
 * Set video sender parameters for 360p real-time mode.
 *
 * degradationPreference = "maintain-framerate":
 *   When bandwidth is low the encoder drops quality/resolution instead of
 *   buffering frames. Without this, encoders (especially VP9 software) hold
 *   2-4 frames in a look-ahead buffer (~130 ms at 30fps) to improve
 *   compression — that buffer is exactly why video drifts behind audio.
 *   Discord, Google Meet, and Steam use this mode.
 *
 * scaleResolutionDownBy = 1.0:
 *   Prevents the browser from silently downscaling frames inside the encoder
 *   pipeline, which can stagger frame timing and cause drift.
 */
function tuneVideoSenders(pc) {
  if (!pc) return;
  pc.getSenders().forEach((sender) => {
    if (sender.track?.kind !== "video") return;
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) return;
      params.degradationPreference        = "maintain-framerate";
      params.encodings[0].maxBitrate      = 900_000; // 900 kbps — generous for 360p, room to adapt
      params.encodings[0].minBitrate      = 150_000; // 150 kbps floor — GCC adapts within this range
      params.encodings[0].maxFramerate    = 30;
      params.encodings[0].scaleResolutionDownBy = 1.0;
      params.encodings[0].scalabilityMode = "L1T1"; // single spatial+temporal layer — fastest keyframe recovery
      params.encodings[0].priority        = "high";
      params.encodings[0].networkPriority = "high";
      sender.setParameters(params).catch(() => {});
    } catch (_) {}
  });
}

/**
 * Prefer RED+Opus for audio transceivers if the browser supports it.
 * RED (RFC 2198) sends the current audio frame PLUS the previous frame in each
 * packet. If either packet is lost the redundant copy provides full recovery —
 * better than FEC alone at the same bitrate. Used by WhatsApp and Chrome
 * internal calls on poor networks.
 * Falls back gracefully: if audio/RED is not in the codec list the function
 * is a no-op and Opus FEC still applies.
 */
function applyAudioCodecPreferences(pc) {
  if (!pc || typeof RTCRtpReceiver.getCapabilities !== "function") return;
  try {
    const codecs = RTCRtpReceiver.getCapabilities("audio")?.codecs ?? [];
    if (!codecs.length) return;
    // RED first — redundant Opus packets, best packet-loss recovery.
    // Opus next — plain Opus with FEC as fallback.
    // Everything else last.
    const sorted = [
      ...codecs.filter((c) => c.mimeType === "audio/red"),
      ...codecs.filter((c) => c.mimeType === "audio/opus"),
      ...codecs.filter((c) => !["audio/red", "audio/opus"].includes(c.mimeType)),
    ];
    pc.getTransceivers().forEach((tc) => {
      try {
        if (tc.sender.track?.kind === "audio") tc.setCodecPreferences(sorted);
      } catch (_) {}
    });
  } catch (_) {}
}

/**
 * Combined adaptive video parameter loop — runs every 3 s while connected.
 *
 * In a single pass it:
 *   1. Samples audio receiver inbound-rtp stats (jitter + packet loss rate)
 *      to gauge overall network health — audio degrades first when the
 *      network is congested.
 *   2. Samples video sender outbound-rtp stats for qualityLimitationReason
 *      to detect CPU / encoder backlog.
 *   3. Applies both maxFramerate AND maxBitrate in ONE setParameters() call
 *      per sender — avoids the race condition of two concurrent
 *      getParameters/setParameters sequences clobbering each other.
 *
 * Adaptive framerate (CPU/bandwidth pressure — WhatsApp frame-drop trick):
 *   "cpu"       → 15 fps  — drain encoder queue, prevent freeze-then-burst
 *   "bandwidth" → 24 fps  — reduce burst packet size
 *   "none"      → 30 fps  — full rate
 *
 * Adaptive bitrate (audio health → network congestion signal):
 *   loss > 10% or jitter > 60 ms → 200 kbps  (severe congestion)
 *   loss >  5% or jitter > 30 ms → 400 kbps  (moderate congestion)
 *   otherwise                    → 900 kbps  (healthy — full budget)
 *
 * Using audio health as a proxy for video bitrate is the same technique
 * Zoom and Google Meet use: audio is low-bitrate and loss-sensitive, so
 * it's the earliest signal of network stress before video visibly degrades.
 */
async function adaptVideoSenderParams(pc) {
  if (!pc) return;

  // ── Step 1: sample audio receiver stats ────────────────────────────────
  let worstJitter = 0;   // seconds (WebRTC stat unit)
  let worstLoss   = 0;   // fraction 0–1
  for (const recv of pc.getReceivers()) {
    if (recv.track?.kind !== "audio") continue;
    try {
      const stats = await recv.getStats();
      stats.forEach((r) => {
        if (r.type !== "inbound-rtp" || r.kind !== "audio") return;
        worstJitter = Math.max(worstJitter, r.jitter ?? 0);
        const total = (r.packetsReceived ?? 0) + (r.packetsLost ?? 0);
        if (total > 0) worstLoss = Math.max(worstLoss, (r.packetsLost ?? 0) / total);
      });
    } catch (_) {}
  }

  // Derived bitrate cap from audio health
  const targetBitrate =
    worstLoss > 0.10 || worstJitter > 0.060 ? 200_000 : // severe
    worstLoss > 0.05 || worstJitter > 0.030 ? 400_000 : // moderate
    900_000;                                             // healthy

  // ── Step 2: per video sender — sample CPU stats + apply both params ────
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== "video") continue;
    try {
      const sendStats = await sender.getStats();
      let limitation = "none";
      sendStats.forEach((r) => {
        if (r.type === "outbound-rtp" && r.kind === "video") {
          limitation = r.qualityLimitationReason ?? "none";
        }
      });

      const targetFps = limitation === "cpu" ? 15 : limitation === "bandwidth" ? 24 : 30;

      const params = sender.getParameters();
      if (!params.encodings?.length) continue;

      const curFps     = params.encodings[0].maxFramerate;
      const curBitrate = params.encodings[0].maxBitrate;
      if (curFps === targetFps && curBitrate === targetBitrate) continue; // nothing to do

      params.encodings[0].maxFramerate = targetFps;
      params.encodings[0].maxBitrate   = targetBitrate;
      sender.setParameters(params).catch(() => {});
      console.log(
        `[WebRTC] Video adapt: fps=${targetFps} bitrate=${targetBitrate / 1000}kbps` +
        ` (cpu="${limitation}" jitter=${(worstJitter * 1000).toFixed(0)}ms` +
        ` loss=${(worstLoss * 100).toFixed(1)}%)`
      );
    } catch (_) {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop all tracks on a MediaStream acquired via getUserMedia.
// ─────────────────────────────────────────────────────────────────────────────
function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
}

// File transfer constants
const CHUNK_SIZE = 64 * 1024;
const BUFFER_HIGH_WATER = 8 * 1024 * 1024;
const BUFFER_LOW_WATER  = 1 * 1024 * 1024;

function createEmptyIncomingFileState() {
  return {
    id: null,
    name: "",
    type: "",
    size: 0,
    chunks: [],
    receivedSize: 0,
    viewOnce: false,
    lastUiEmit: 0,
  };
}

function buildTransferPayload(state, sentBytes = 0, totalBytes = 0, progress = 0) {
  return {
    state,
    sentBytes,
    totalBytes,
    progress,
  };
}

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
  // Holds a pre-warmed { type, promise } so getUserMedia runs during ring time,
  // not after the peer answers — eliminates the largest single source of call delay.
  const warmMediaRef = useRef(null);
  // Throwaway PC created on room-join to pre-warm OS STUN/TURN paths.
  // Ensures UDP sockets + NAT entries are allocated before a call starts.
  const warmPcRef = useRef(null);
  // Stable remote MediaStream — tracks are added/removed in-place via addTrack/
  // removeTrack rather than creating a new object each time. This means the DOM
  // element's srcObject never changes reference → no decoder buffer reset → no
  // A/V desync when the video track arrives after the audio track.
  const remoteStreamStableRef = useRef(null);

  const incomingFileRef = useRef(createEmptyIncomingFileState());
  const pendingOutgoingFileOffersRef = useRef(new Map());
  const outgoingFileTransferQueueRef = useRef(Promise.resolve());
  const acceptedIncomingFilesRef = useRef(new Set());

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

  // Transition connecting → active as soon as remote media arrives.
  // For the first call, ontrack fires on the receiver and handles this.
  // For subsequent calls the same RTCRtpReceiver objects are reused — Chrome
  // does not re-fire ontrack for existing receivers on renegotiation, so we
  // watch remoteStream state directly as the authoritative "media is flowing" signal.
  useEffect(() => {
    if (
      remoteStream &&
      (callStateRef.current === "connecting" || callStateRef.current === "outgoing-ringing")
    ) {
      setCallState("active");
      setCallStartTime(Date.now());
    }
  }, [remoteStream]);

  // Fetch TURN credentials on mount, then immediately pre-warm ICE gathering.
  // A throwaway RTCPeerConnection with iceCandidatePoolSize triggers UDP socket
  // allocation, STUN binds, and TURN allocations in the background — so by the
  // time the user places a call those OS-level network paths are already warm.
  // This saves 200–400 ms of perceived call setup time.
  useEffect(() => {
    let cancelled = false;
    fetchIceConfig().then((c) => {
      if (!cancelled) {
        iceConfigRef.current = c;
        try {
          if (warmPcRef.current) { warmPcRef.current.close(); warmPcRef.current = null; }
          const warmPc = new RTCPeerConnection({ ...c, iceCandidatePoolSize: 6 });
          warmPc.createDataChannel("warmup");
          // createOffer + setLocalDescription starts ICE gathering immediately
          warmPc.createOffer()
            .then((offer) => warmPc.setLocalDescription(offer))
            .catch(() => {});
          warmPcRef.current = warmPc;
          // NAT mappings expire at ~30-60 s — close before they go stale
          setTimeout(() => {
            if (warmPcRef.current === warmPc) { warmPc.close(); warmPcRef.current = null; }
          }, 55_000);
        } catch (_) {}
      }
    });
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

  const acquireMedia = useCallback(async (type) => {
    const constraints = {
      // All quality processing is handled by the browser's native capture pipeline
      // (Chrome: AEC3 echo cancel, RNNoise suppression, AGC2 gain control).
      // These run BEFORE audio frames are timestamped so they add zero RTP
      // timestamp offset relative to the video track — essential for A/V sync.
      // NOTE: do NOT set `latency` — requesting very low latency (e.g. 0.01 s)
      // can trigger a different Windows WASAPI audio mode whose internal clock
      // domain differs from the camera clock, producing systematic A/V drift.
      // Chrome's default WebRTC capture path is already latency-optimised.
      // Exact constraints (not ideal: wrappers so browsers cannot ignore them).
      // goog* flags are deprecated — modern Chrome already runs AEC3 / RNNoise /
      // AGC2 automatically; listing them can trigger legacy code paths.
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
        channelCount:     1,
        sampleRate:       48000,
        sampleSize:       16,
      },
    };
    if (type === "video") {
      constraints.video = {
        // 640×360 — half of 720p: 4× fewer pixels to encode/decode.
        // H.264 baseline encodes a 360p frame in <1 ms on any HW encoder.
        // Lower encode latency = fewer buffered frames = tighter A/V sync.
        // min=30 forces a stable 30 Hz clock — mixed frame rates cause RTP
        // timestamp jitter that produces subtle A/V drift on PC browsers.
        width:       { ideal: 640 },
        height:      { ideal: 360 },
        frameRate:   { min: 30, ideal: 30, max: 30 },
        aspectRatio: { ideal: 16 / 9 },
        facingMode:  "user",
      };
    }
    // Return the raw getUserMedia stream directly — no Web Audio pipeline.
    // See the comment block above for why.
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    // contentHint tells the encoder what to optimise for.
    // "speech" → voice clarity / pitch preservation (Opus speech mode)
    // "motion" → low-latency frame pacing, no look-ahead buffering
    stream.getAudioTracks().forEach((t) => { t.contentHint = "speech"; });
    stream.getVideoTracks().forEach((t) => { t.contentHint = "motion"; });
    return stream;
  }, []);

  const resetIncomingFile = useCallback(() => {
    incomingFileRef.current = createEmptyIncomingFileState();
  }, []);

  const emitIncomingTransferStart = useCallback((fileId, payload) => {
    onMessageRef.current?.({
      type: "file-transfer-start",
      id: fileId,
      from: "Peer",
      fileName: payload.name,
      fileType: payload.fileType,
      timestamp: Date.now(),
      isSelf: false,
      viewOnce: !!payload.viewOnce,
      transfer: buildTransferPayload("receiving", 0, payload.size || 0, 0),
    });
  }, []);

  const emitIncomingTransferUpdate = useCallback((fileId, sentBytes, totalBytes) => {
    onMessageRef.current?.({
      type: "file-transfer-update",
      id: fileId,
      transfer: buildTransferPayload(
        "receiving",
        sentBytes,
        totalBytes,
        totalBytes > 0 ? Math.min(99, Math.floor((sentBytes / totalBytes) * 100)) : 0
      ),
    });
  }, []);

  const runOutgoingAcceptedFileTransfer = useCallback(async (messageId) => {
    const offer = pendingOutgoingFileOffersRef.current.get(messageId);
    if (!offer) return;

    const {
      file,
      viewOnce,
      onProgress,
      totalBytes,
      safeFileName,
      safeFileType,
    } = offer;
    let sentBytes = 0;
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") {
      onProgress?.({ stage: "error" });
      pendingOutgoingFileOffersRef.current.delete(messageId);
      return;
    }

    try {
      onProgress?.({
        sentBytes,
        totalBytes,
        progress: totalBytes > 0 ? 0 : 100,
        stage: "starting",
      });
      dc.send(JSON.stringify({
        type: "file-meta",
        name: safeFileName,
        fileType: safeFileType,
        size: file.size,
        viewOnce: !!viewOnce,
        messageId,
      }));
      onProgress?.({
        sentBytes,
        totalBytes,
        progress: totalBytes > 0 ? 0 : 100,
        stage: "sending",
      });

      dc.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
      const buffer = await file.arrayBuffer();
      let offset = 0;
      while (offset < buffer.byteLength) {
        if (dc.readyState !== "open") {
          onProgress?.({ stage: "error" });
          pendingOutgoingFileOffersRef.current.delete(messageId);
          return;
        }
        if (dc.bufferedAmount > BUFFER_HIGH_WATER) {
          onProgress?.({
            sentBytes,
            totalBytes,
            progress: totalBytes > 0 ? Math.min(99, Math.floor((sentBytes / totalBytes) * 100)) : 100,
            stage: "buffering",
          });
          await new Promise((resolve) => {
            const prev = dc.onbufferedamountlow;
            dc.onbufferedamountlow = () => { dc.onbufferedamountlow = prev ?? null; resolve(); };
          });
          if (dc.readyState !== "open") {
            onProgress?.({ stage: "error" });
            pendingOutgoingFileOffersRef.current.delete(messageId);
            return;
          }
        }
        const end = Math.min(offset + CHUNK_SIZE, buffer.byteLength);
        dc.send(buffer.slice(offset, end));
        sentBytes += (end - offset);
        offset = end;
        onProgress?.({
          sentBytes,
          totalBytes,
          progress: totalBytes > 0 ? Math.min(99, Math.floor((sentBytes / totalBytes) * 100)) : 100,
          stage: "sending",
        });
      }
      dc.send(JSON.stringify({ type: "file-end" }));
      onProgress?.({
        sentBytes: totalBytes,
        totalBytes,
        progress: 100,
        stage: "done",
      });
    } catch (err) {
      onProgress?.({ stage: "error" });
      console.error("[sendFile] Transfer failed:", err.message);
      try {
        if (dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "file-cancel", messageId }));
        }
      } catch (_) {}
    } finally {
      pendingOutgoingFileOffersRef.current.delete(messageId);
    }
  }, []);

  // ── Cleanup call media & state ────────────────────────────────────────────
  const cleanupCall = useCallback((immediate = true) => {
    // Discard any pre-warmed stream that was never consumed
    const warm = warmMediaRef.current;
    warmMediaRef.current = null;
    if (warm?.promise) warm.promise.then(stopStream).catch(() => {});

    const pc = pcRef.current;
    if (pc) {
      if (pc._jbTimer) { clearInterval(pc._jbTimer); pc._jbTimer = null; }
      if (pc._fpTimer) { clearInterval(pc._fpTimer); pc._fpTimer = null; }
      pc.getSenders().forEach((sender) => {
        if (sender.track) { try { pc.removeTrack(sender); } catch (_) {} }
      });
    }
    const stream = localStreamRef.current;
    if (stream) {
      stopStream(stream);
      localStreamRef.current = null;
    }
    // Clear stable remote stream tracks. Don't stop remote tracks — we don't own them.
    // Reset to a fresh empty MediaStream rather than null: rebuildRemoteStream() guards
    // with `if (!stable) return`, so setting null here would silently drop all incoming
    // tracks on the second (and every subsequent) call without recreating the PC.
    const stableRemote = remoteStreamStableRef.current;
    if (stableRemote) {
      stableRemote.getTracks().forEach((t) => { try { stableRemote.removeTrack(t); } catch (_) {} });
    }
    remoteStreamStableRef.current = new MediaStream();
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
    // Real call PC takes over — close warm PC so its TURN allocations are freed
    if (warmPcRef.current) { warmPcRef.current.close(); warmPcRef.current = null; }

    console.log("[WebRTC] Creating PeerConnection with", iceConfigRef.current.iceServers?.length, "ICE servers");
    const pc = new RTCPeerConnection({
      ...iceConfigRef.current,
      // Bundle audio + video onto one ICE connection — halves candidate pairs,
      // makes ICE complete ~200 ms faster than the default "balanced" policy.
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      // 6 candidates is enough to cover host + srflx + relay for one interface.
      // Larger pools waste sockets and TURN allocations, especially on mobile.
      iceCandidatePoolSize: 6,
    });
    pcRef.current = pc;

    // Pin receiver jitter buffers to zero added target delay.
    // Chrome's adaptive algorithm silently increases the VIDEO jitter buffer over
    // time (while audio stays at ~20 ms), causing progressive A/V drift — the
    // longer the call the more the video lags behind audio.
    // Clamping both receivers to jitterBufferTarget=0 prevents this.
    // Called from ontrack (immediately per receiver) and refreshed every 4 s in
    // onconnectionstatechange so Chrome cannot raise it back mid-call.
    const pinJitterBuffers = () => {
      try {
        pc.getReceivers().forEach((recv) => {
          if ("jitterBufferTarget" in recv) recv.jitterBufferTarget = 0;
          // playoutDelayHint controls the decoder render queue (separate from the
          // jitter buffer). Without this, browsers add 80–150 ms of decode-to-render
          // buffering on top of the jitter buffer. Setting it to 0 collapses that
          // stage and gives the minimum achievable end-to-end latency.
          if ("playoutDelayHint" in recv) recv.playoutDelayHint = 0;
        });
      } catch (_) {}
    };

    // Fresh stable stream for this PeerConnection. Tracks are added/removed in
    // place — the DOM element's srcObject stays the same object so the decoder
    // never resets, guaranteeing frame-accurate A/V sync on PC browsers.
    remoteStreamStableRef.current = new MediaStream();

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
            offer.sdp = processSdp(offer.sdp);
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
        // Apply sender parameters immediately on DTLS connected — by this point
        // encodings exist and setParameters succeeds without a timeout race.
        tuneAudioSenders(pc);
        tuneVideoSenders(pc);
        // Pin jitter buffers at connect and then every 12 s.
        // Chrome's adaptive jitter buffer algorithm collects RTT samples for the
        // first ~10-15 s and then *raises* the video jitter buffer target to
        // absorb estimated network jitter — audio stays at ~20 ms while video
        // climbs to 150-400 ms, causing the A/V delay that starts at ~15-20 s.
        // Re-pinning every 12 s stays ahead of that growth window.
        pinJitterBuffers();
        pc._jbTimer = setInterval(pinJitterBuffers, 12_000);
        // Poll video sender quality stats every 3 s; lower maxFramerate under
        // CPU pressure so the encoder queue never grows (WhatsApp frame-drop trick).
        pc._fpTimer = setInterval(() => adaptVideoSenderParams(pc), 3_000);
      } else if (["failed", "closed"].includes(pc.connectionState)) {
        // "disconnected" is transient — browser retries ICE automatically.
        // Only mark disconnected on terminal states to avoid false UI flickers.
        if (pc._jbTimer) { clearInterval(pc._jbTimer); pc._jbTimer = null; }
        if (pc._fpTimer) { clearInterval(pc._fpTimer); pc._fpTimer = null; }
        setIsConnected(false);
      }
    };

    pc.ontrack = (event) => {
      console.log("[WebRTC] Remote track:", event.track.kind, "muted:", event.track.muted);

      const rebuildRemoteStream = () => {
        const stable = remoteStreamStableRef.current;
        if (!stable) return;
        const allTracks = pc.getReceivers().map((r) => r.track).filter(Boolean);
        const existing = new Set(stable.getTracks());
        const incoming = new Set(allTracks);
        // Add new tracks in-place — browser picks them up on the existing
        // srcObject immediately with no buffer reset.
        allTracks.forEach((t) => { if (!existing.has(t)) stable.addTrack(t); });
        // Remove departed tracks
        existing.forEach((t) => { if (!incoming.has(t)) stable.removeTrack(t); });
        // Only notify React on null → stream transition. Same-object updates are
        // invisible to useState but visible to the DOM (addTrack is live).
        setRemoteStream((prev) => {
          if (allTracks.length === 0) return null;
          return prev ?? stable; // null → stable causes re-render; stable → stable skips it
        });
      };

      // Rebuild stream immediately
      rebuildRemoteStream();
      // Pin this receiver's jitter buffer the moment we know about it.
      pinJitterBuffers();

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
        // Apply codec preferences on all transceivers before generating the offer
        applyVideoCodecPreferences(pc);
        applyAudioCodecPreferences(pc);
        const offer = await pc.createOffer();
        offer.sdp = processSdp(offer.sdp);
        await pc.setLocalDescription(offer);
        sendSignal({ type: "offer", roomId, payload: { sdp: pc.localDescription } });
        // Tune sender bitrates immediately — no timeout so video starts at
        // target quality from the first encoded frame.
        tuneAudioSenders(pc);
        tuneVideoSenders(pc);
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

    channel.onclose = () => {
      setIsConnected(false);
      pendingOutgoingFileOffersRef.current.forEach(({ onProgress }) => {
        onProgress?.({ stage: "error" });
      });
      pendingOutgoingFileOffersRef.current.clear();
      acceptedIncomingFilesRef.current.clear();
    };
    channel.onerror = (err) => console.error("[DataChannel] Error:", err);

    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) { handleIncomingChunk(event.data); return; }

      try {
        const p = JSON.parse(event.data);

        if (p.type === "file-offer-response") {
          const pending = pendingOutgoingFileOffersRef.current.get(p.messageId);
          if (!pending) return;

          if (p.accept === false) {
            pending.onProgress?.({ stage: "error" });
            pendingOutgoingFileOffersRef.current.delete(p.messageId);
            return;
          }

          outgoingFileTransferQueueRef.current = outgoingFileTransferQueueRef.current
            .catch(() => {})
            .then(() => runOutgoingAcceptedFileTransfer(p.messageId));
          return;
        }

        if (p.type === "file-offer") {
          onMessageRef.current?.({
            type: "file-offer",
            id: p.messageId,
            from: p.from || "Peer",
            fileName: p.name,
            fileType: p.fileType,
            timestamp: p.timestamp || Date.now(),
            isSelf: false,
            viewOnce: !!p.viewOnce,
            transfer: {
              state: "offer",
              progress: 0,
              sentBytes: 0,
              totalBytes: p.size || 0,
            },
          });
          return;
        }

        // File transfer
        if (p.type === "file-meta") {
          if (!acceptedIncomingFilesRef.current.has(p.messageId)) {
            console.warn("[DataChannel] Ignoring unaccepted file payload:", p.messageId);
            try {
              channel.send(JSON.stringify({ type: "file-cancel", messageId: p.messageId }));
            } catch (_) {}
            return;
          }
          acceptedIncomingFilesRef.current.delete(p.messageId);
          const fileId = p.messageId ?? (Date.now() + Math.random());
          incomingFileRef.current = {
            id: fileId,
            name: p.name, type: p.fileType, size: p.size,
            chunks: [], receivedSize: 0, viewOnce: !!p.viewOnce,
            lastUiEmit: 0,
          };
          emitIncomingTransferStart(fileId, p);
          return;
        }
        if (p.type === "file-end") {
          const fileId = incomingFileRef.current?.id;
          assembleFile();
          if (fileId != null) {
            channel.send(JSON.stringify({
              type: "message-ack",
              messageId: fileId,
              status: "delivered",
              timestamp: Date.now(),
            }));
          }
          return;
        }
        if (p.type === "file-cancel") {
          console.warn("[DataChannel] Peer cancelled file transfer.");
          const f = incomingFileRef.current;
          const targetId = p.messageId ?? f.id;
          if (targetId) {
            onMessageRef.current?.({
              type: "file-transfer-update",
              id: targetId,
              transfer: { state: "failed" },
            });
          }
          acceptedIncomingFilesRef.current.delete(targetId);
          resetIncomingFile();
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

        // Reaction toggle
        if (p.type === "reaction-toggle") {
          onMessageRef.current?.({
            type: "reaction-toggle",
            messageId: p.messageId,
            emoji: p.emoji,
            from: p.from ?? "Peer",
            timestamp: p.timestamp ?? Date.now(),
          });
          return;
        }

        if (p.type === "message-ack") {
          onMessageRef.current?.({
            type: "delivery-update",
            messageId: p.messageId,
            status: p.status || "delivered",
            timestamp: p.timestamp ?? Date.now(),
          });
          return;
        }

        // Chat message
        onMessageRef.current?.({
          id: p.id ?? Date.now(), from: p.from ?? "Peer", text: p.text,
          replyTo: p.replyTo ?? null, timestamp: p.timestamp ?? Date.now(), isSelf: false,
        });
        if (p.id != null) {
          channel.send(JSON.stringify({
            type: "message-ack",
            messageId: p.id,
            status: "delivered",
            timestamp: Date.now(),
          }));
        }
      } catch {
        onMessageRef.current?.({
          id: Date.now(), from: "Peer", text: event.data,
          timestamp: Date.now(), isSelf: false,
        });
      }
    };
  }, [emitIncomingTransferStart, resetIncomingFile, runOutgoingAcceptedFileTransfer]);

  // ── File chunking helpers ─────────────────────────────────────────────────
  const handleIncomingChunk = (buffer) => {
    const f = incomingFileRef.current;
    f.chunks.push(buffer);
    f.receivedSize += buffer.byteLength;
    const now = Date.now();
    if (!f.id) return;
    // Throttle UI updates to avoid re-rendering on every binary chunk.
    if (now - f.lastUiEmit < 120 && f.receivedSize < f.size) return;
    f.lastUiEmit = now;
    emitIncomingTransferUpdate(f.id, f.receivedSize, f.size || 0);
  };

  const assembleFile = () => {
    const { id, name, type, chunks, viewOnce, size } = incomingFileRef.current;
    const blob = new Blob(chunks, { type });
    const url = URL.createObjectURL(blob);
    onMessageRef.current?.({
      type: "file-transfer-complete",
      id,
      from: "Peer",
      fileUrl: url,
      fileName: name,
      fileType: type,
      timestamp: Date.now(),
      isSelf: false,
      viewOnce: !!viewOnce,
      transfer: {
        state: "sent",
        progress: 100,
        sentBytes: size || blob.size,
        totalBytes: size || blob.size,
      },
    });
    resetIncomingFile();
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
      offer.sdp = processSdp(offer.sdp);
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
        // Create a fresh PC when:
        //   a) there is no PC yet (first connection), OR
        //   b) the existing PC is closed — this happens when a peer leaves and
        //      rejoins; pcRef still holds the old closed PC from the previous
        //      session, and calling setRemoteDescription on it throws
        //      InvalidStateError, silently killing the reconnect attempt.
        const pcIsClosed = pc && (pc.signalingState === "closed" || pc.connectionState === "closed");
        if (!pc || pcIsClosed) {
          // First offer (or reconnect after peer left) — fetch fresh TURN credentials
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
        // Add any local media tracks not yet on the connection, using
        // addTransceiver(kind) + replaceTrack so all transceivers are created
        // synchronously and codec prefs apply before the answer is generated.
        const ls = localStreamRef.current;
        if (ls) {
          ls.getTracks().forEach((t) => {
            // After setRemoteDescription, the remote's new m-sections already have
            // matching receiver transceivers with sender.track=null.
            // Plug our track into those instead of calling addTransceiver, which
            // would create transceivers outside the current offer's m-sections and
            // therefore excluded from the answer — causing one-way media.
            const reuse = pc.getTransceivers().find(
              (x) => !x.stopped && x.sender.track === null && x.receiver.track?.kind === t.kind
            );
            if (reuse) {
              reuse.direction = "sendrecv";
              reuse.sender.replaceTrack(t).catch(() => {});
            } else {
              // Fresh PC (first call) or no matching transceiver — create one
              const tc = pc.addTransceiver(t.kind, { direction: "sendrecv", streams: [ls] });
              tc.sender.replaceTrack(t).catch(() => {});
            }
          });
        }
        // Apply codec preferences before generating the answer
        applyVideoCodecPreferences(pc);
        applyAudioCodecPreferences(pc);
        const answer = await pc.createAnswer();
        answer.sdp = processSdp(answer.sdp);
        await pc.setLocalDescription(answer);
        sendSignal({ type: "answer", roomId, payload: { sdp: pc.localDescription } });
        tuneAudioSenders(pc);
        tuneVideoSenders(pc);
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
    const msg = {
      type: "chat",
      id: Date.now() + Math.random(),
      from: userName,
      text,
      replyTo,
      timestamp: Date.now(),
    };
    dc.send(JSON.stringify(msg));
    return msg;
  }, [userName]);

  // ── Public: Toggle reaction on a message ─────────────────────────────────
  const sendReactionToggle = useCallback((messageId, emoji) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") return false;
    dc.send(JSON.stringify({
      type: "reaction-toggle",
      messageId,
      emoji,
      from: userName,
      timestamp: Date.now(),
    }));
    return true;
  }, [userName]);

  // ── Public: Send file ─────────────────────────────────────────────────────
  const sendFile = useCallback(async (file, viewOnce = false, onProgress, messageId) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") return;
    let stableMessageId = messageId ?? (Date.now() + Math.random());
    const safeFileName = file?.name || "file";
    const safeFileType = file?.type || "application/octet-stream";
    try {
      const totalBytes = file.size || 0;

      onProgress?.({
        sentBytes: 0,
        totalBytes,
        progress: 0,
        stage: "offer",
      });
      pendingOutgoingFileOffersRef.current.set(stableMessageId, {
        file,
        viewOnce,
        onProgress,
        totalBytes,
        safeFileName,
        safeFileType,
      });
      dc.send(JSON.stringify({
        type: "file-offer",
        messageId: stableMessageId,
        name: safeFileName,
        fileType: safeFileType,
        size: file.size,
        viewOnce: !!viewOnce,
        from: userNameRef.current,
        timestamp: Date.now(),
      }));
    } catch (err) {
      onProgress?.({ stage: "error" });
      console.error("[sendFile] Transfer failed:", err.message);
      // Attempt to notify the peer that the transfer was cancelled
      try {
        if (dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "file-cancel", messageId: stableMessageId }));
        }
      } catch (_) {}
      pendingOutgoingFileOffersRef.current.delete(stableMessageId);
      throw err; // re-throw so caller can show an error
    }
  }, []);

  // ── Public: Accept/decline incoming file offer ───────────────────────────
  const sendFileOfferDecision = useCallback((messageId, accept) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open" || messageId == null) return false;
    if (accept) acceptedIncomingFilesRef.current.add(messageId);
    else acceptedIncomingFilesRef.current.delete(messageId);
    dc.send(JSON.stringify({
      type: "file-offer-response",
      messageId,
      accept: !!accept,
      timestamp: Date.now(),
    }));
    return true;
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
    // Pre-warm: start getUserMedia immediately so the stream is ready by the
    // time the peer accepts — eliminates the media-acquisition wait from
    // the perceived call setup time.
    const promise = acquireMedia(type);
    warmMediaRef.current = { type, promise };
    promise.catch(() => { if (warmMediaRef.current?.promise === promise) warmMediaRef.current = null; });
  }, [dcSend, acquireMedia]);

  /** Accept incoming call. */
  const acceptCall = useCallback(async () => {
    if (callStateRef.current !== "incoming-ringing") return;
    const type = callTypeRef.current;
    setCallState("connecting");
    try {
      // Consume the pre-warmed stream (started in handleCallInvite) if it matches
      // the call type; fall back to fresh acquisition if something went wrong.
      const warm = warmMediaRef.current;
      warmMediaRef.current = null;
      let stream;
      if (warm?.type === type && warm.promise) {
        try { stream = await warm.promise; } catch { stream = await acquireMedia(type); }
      } else {
        if (warm?.promise) warm.promise.then(stopStream).catch(() => {});
        stream = await acquireMedia(type);
      }
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
    // cleanupCall already discards warmMediaRef, so just call that
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
    // Pre-warm while the ringing UI shows — by the time the user taps Accept
    // getUserMedia is already resolved and the call connects instantly.
    const promise = acquireMedia(type);
    warmMediaRef.current = { type, promise };
    promise.catch(() => { if (warmMediaRef.current?.promise === promise) warmMediaRef.current = null; });
  }, [dcSend, acquireMedia]);

  /** Handle call-accept from peer. */
  const handleCallAccepted = useCallback(async (type) => {
    if (callStateRef.current !== "outgoing-ringing") return;
    setCallState("connecting");
    try {
      const resolvedType = type || callTypeRef.current;
      const warm = warmMediaRef.current;
      warmMediaRef.current = null;
      let stream;
      if (warm?.type === resolvedType && warm.promise) {
        try { stream = await warm.promise; } catch { stream = await acquireMedia(resolvedType); }
      } else {
        if (warm?.promise) warm.promise.then(stopStream).catch(() => {});
        stream = await acquireMedia(resolvedType);
      }
      localStreamRef.current = stream;
      const pc = pcRef.current;
      if (pc) {
        // Reuse existing transceivers when available (second+ call on the same PC).
        // After cleanupCall runs removeTrack, each sender has track=null but the
        // transceiver+m-section still exists.  Calling addTransceiver(kind) here
        // would create a SECOND transceiver for that kind — those new transceivers
        // are not present in the next offer and the answerer's addTransceiver calls
        // (which happen after setRemoteDescription) are excluded from the answer
        // per JSEP, so the answerer's media never reaches the caller.
        // Reusing the empty sender avoids m-section accumulation entirely.
        stream.getTracks().forEach((t) => {
          const reuse = pc.getTransceivers().find(
            (x) => !x.stopped && x.sender.track === null && x.receiver.track?.kind === t.kind
          );
          if (reuse) {
            reuse.direction = "sendrecv";
            reuse.sender.replaceTrack(t).catch(() => {});
          } else {
            const tc = pc.addTransceiver(t.kind, { direction: "sendrecv", streams: [stream] });
            tc.sender.replaceTrack(t).catch(() => {});
          }
        });
        // Apply codec preferences before the renegotiation offer fires
        applyVideoCodecPreferences(pc);
        applyAudioCodecPreferences(pc);
        tuneAudioSenders(pc);
        tuneVideoSenders(pc);
      }
      setIsMicOn(true);
      setIsCameraOn(resolvedType === "video");
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
        video: {
          width:       { min: 640, ideal: 1280 },
          height:      { min: 480, ideal: 720  },
          frameRate:   { min: 15,  ideal: 30   },
          aspectRatio: { ideal: 16 / 9 },
          facingMode:  "user",
        },
      });
      const vt = vs.getVideoTracks()[0];
      const pc = pcRef.current;
      const stream = localStreamRef.current;
      if (pc && stream) {
        stream.addTrack(vt);
        pc.addTrack(vt, stream);
        applyVideoCodecPreferences(pc);
        tuneVideoSenders(pc);
      }
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
      stopStream(localStreamRef.current);
      pcRef.current?.close();
      if (warmPcRef.current) { warmPcRef.current.close(); warmPcRef.current = null; }
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
    sendChatMessage, sendFile, sendReactionToggle, sendFileOfferDecision,
    // Call management
    initiateCall, acceptCall, rejectCall, endCall,
    handleCallInvite, handleCallAccepted, handleCallRejected, handleCallEnd,
    switchToVideo, toggleMic, toggleCamera,
    // State
    localStreamRef, remoteStream, isConnected,
    callState, callType, callStartTime, isMicOn, isCameraOn,
    // Exposed for CallScreen stats (RTT + audio level)
    peerConnectionRef: pcRef,
  };
}
