import { useEffect, useRef, useCallback } from "react";

// Reconnect backoff: 1s → 2s → 4s → 8s → 16s → 30s (capped)
const BACKOFF_BASE_MS  = 1_000;
const BACKOFF_MAX_MS   = 30_000;
const BACKOFF_FACTOR   = 2;

/**
 * useSignaling
 *
 * Manages the WebSocket connection to the Spring Boot signaling server.
 * Automatically reconnects with exponential backoff on failure or disconnect.
 * Used ONLY for WebRTC negotiation (SDP offers/answers + ICE candidates).
 * All actual chat/media data travels directly peer-to-peer via WebRTC.
 *
 * @param {string} signalingUrl  - WebSocket URL, e.g. "wss://host/signal"
 * @param {function} onMessage   - Callback invoked with a parsed SignalMessage object
 * @returns {{ joinRoom, sendSignal, disconnect }}
 */
export function useSignaling(signalingUrl, onMessage) {
  const wsRef          = useRef(null);       // active WebSocket instance
  const onMessageRef   = useRef(onMessage);  // latest callback (avoid stale closure)
  const retryDelay     = useRef(BACKOFF_BASE_MS);
  const retryTimer     = useRef(null);
  const destroyed      = useRef(false);      // true after explicit disconnect / unmount
  const pendingJoin    = useRef(null);       // room to re-join after reconnect

  // Always keep the latest callback reference
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // ── Connection factory (called on first connect + every reconnect) ─────────
  const connect = useCallback(() => {
    if (destroyed.current || !signalingUrl) return;

    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      retryDelay.current = BACKOFF_BASE_MS; // reset backoff on success

      // Re-join the room if we were already in one before the reconnect
      if (pendingJoin.current) {
        ws.send(JSON.stringify({ type: "join", roomId: pendingJoin.current }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessageRef.current?.(msg);
      } catch (err) {
        console.error("[Signaling] Failed to parse message:", err);
      }
    };

    ws.onerror = () => {
      // onclose always fires after onerror, so reconnect logic lives there
    };

    ws.onclose = (event) => {
      if (destroyed.current) return;   // intentional close — do not reconnect

      const delay = retryDelay.current;
      retryTimer.current = setTimeout(() => {
        if (!destroyed.current) connect();
      }, delay);

      // Increase backoff for next attempt (capped)
      retryDelay.current = Math.min(delay * BACKOFF_FACTOR, BACKOFF_MAX_MS);
    };
  }, [signalingUrl]);

  // ── Bootstrap connection when URL becomes available ────────────────────────
  useEffect(() => {
    if (!signalingUrl) return;
    destroyed.current = false;
    connect();

    return () => {
      destroyed.current = true;
      clearTimeout(retryTimer.current);
      wsRef.current?.close();
    };
  }, [signalingUrl, connect]);

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Send a raw signaling message. */
  const sendSignal = useCallback((message) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  /**
   * Join a signaling room. Stores the room ID so it can be re-joined
   * automatically after a reconnect.
   * @param {string} hashedRoomId - SHA-256 hash of the room code
   */
  const joinRoom = useCallback((hashedRoomId) => {
    pendingJoin.current = hashedRoomId;
    sendSignal({ type: "join", roomId: hashedRoomId });
  }, [sendSignal]);

  /**
   * Intentionally close the WebSocket and stop all reconnect attempts.
   * Call this when the user explicitly leaves the session.
   */
  const disconnect = useCallback(() => {
    destroyed.current = true;
    pendingJoin.current = null;
    clearTimeout(retryTimer.current);
    wsRef.current?.close();
  }, []);

  return { joinRoom, sendSignal, disconnect };
}
