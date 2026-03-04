import { useEffect, useRef, useCallback } from "react";

/**
 * useSignaling
 *
 * Manages the WebSocket connection to the Spring Boot signaling server.
 * Used ONLY for WebRTC negotiation (SDP offers/answers + ICE candidates).
 * All actual chat/media data travels directly peer-to-peer via WebRTC.
 *
 * @param {string} signalingUrl  - WebSocket URL, e.g. "wss://localhost:8080/signal"
 * @param {function} onMessage   - Callback invoked with a parsed SignalMessage object
 * @returns {{ joinRoom, sendSignal, disconnect }}
 */
export function useSignaling(signalingUrl, onMessage) {
  const wsRef = useRef(null);          // WebSocket instance
  const onMessageRef = useRef(onMessage); // Keep latest callback without re-subscribing

  // Always keep the latest callback in ref (avoid stale closure)
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Open WebSocket connection when URL is provided
  useEffect(() => {
    if (!signalingUrl) return;

    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Signaling] Connected to signaling server:", signalingUrl);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("[Signaling] Received:", msg.type, msg);
        onMessageRef.current?.(msg);
      } catch (err) {
        console.error("[Signaling] Failed to parse message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[Signaling] WebSocket error:", err);
    };

    ws.onclose = (event) => {
      console.log("[Signaling] Disconnected:", event.code, event.reason);
    };

    // Cleanup: close WebSocket on unmount or URL change
    return () => {
      ws.close();
    };
  }, [signalingUrl]);

  /**
   * Send a message through the signaling server.
   * @param {Object} message - SignalMessage-shaped object
   */
  const sendSignal = useCallback((message) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      console.log("[Signaling] Sent:", message.type, message);
    } else {
      console.warn("[Signaling] Cannot send — WebSocket not open. State:", ws?.readyState);
    }
  }, []);

  /**
   * Join a signaling room. Only the (pre-hashed) room ID is sent —
   * the user's display name is exchanged later over the encrypted DataChannel.
   * @param {string} hashedRoomId - SHA-256 hash of the room code (computed in App.js)
   */
  const joinRoom = useCallback((hashedRoomId) => {
    sendSignal({ type: "join", roomId: hashedRoomId });
  }, [sendSignal]);

  /**
   * Manually close the WebSocket connection.
   */
  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  return { joinRoom, sendSignal, disconnect };
}
