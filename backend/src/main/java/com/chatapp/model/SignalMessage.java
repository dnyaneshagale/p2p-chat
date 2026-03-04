package com.chatapp.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents a signaling message exchanged between peers.
 *
 * Message Types:
 * - "join"          → Client requests to join a room
 * - "offer"         → Caller sends SDP offer to callee
 * - "answer"        → Callee responds with SDP answer
 * - "ice-candidate" → Either peer sends an ICE candidate
 * - "peer-joined"   → Server notifies existing peer that someone new joined
 * - "peer-left"     → Server notifies remaining peer when a peer disconnects
 * - "ready"         → Server notifies caller to initiate the WebRTC offer
 * - "error"         → Server sends an error message
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)  // Omit null fields in JSON output
public class SignalMessage {

    /** Message type (e.g., "join", "offer", "answer", "ice-candidate") */
    private String type;

    /** Room ID that both peers must share to connect */
    private String roomId;

    /**
     * Generic payload for SDP or ICE data.
     * For "offer"/"answer": { "sdp": "..." }
     * For "ice-candidate": { "candidate": "...", "sdpMid": "...", "sdpMLineIndex": ... }
     */
    private JsonNode payload;

    /** Optional sender display name */
    private String fromName;

    /** Optional error message (for "error" type) */
    private String message;
}
