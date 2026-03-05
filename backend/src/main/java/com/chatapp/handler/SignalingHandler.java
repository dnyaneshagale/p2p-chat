package com.chatapp.handler;

import com.chatapp.model.SignalMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket signaling handler for WebRTC peer-to-peer connections.
 *
 * Responsibilities (ONLY signaling — no chat/media data passes through here):
 *   1. Accept client WebSocket connections.
 *   2. Allow clients to join named rooms (max 2 peers per room).
 *   3. Relay SDP offers, SDP answers, and ICE candidates between the two peers.
 *   4. Notify peers when the other peer connects or disconnects.
 *
 * Flow:
 *   Peer A joins room  → server stores session
 *   Peer B joins room  → server notifies Peer A ("peer-joined") and tells Peer B to wait
 *                        server sends "ready" to Peer A (the initiator)
 *   Peer A sends offer → server relays it to Peer B
 *   Peer B sends answer→ server relays it to Peer A
 *   Both exchange ICE candidates via server
 *   Direct WebRTC connection established — server is no longer in the data path
 */
@Slf4j
@Component
public class SignalingHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper = new ObjectMapper();

    // roomId → ordered list of WebSocket sessions (max 2 per room)
    private final Map<String, List<WebSocketSession>> rooms = new ConcurrentHashMap<>();

    // sessionId → roomId (reverse lookup for cleanup on disconnect)
    private final Map<String, String> sessionRooms = new ConcurrentHashMap<>();

    // -------------------------------------------------------------------------
    // Connection Lifecycle
    // -------------------------------------------------------------------------

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        // Log only the internal session ID — no user-identifying information.
        log.debug("New WebSocket connection: sessionId={}", session.getId());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = session.getId();
        String roomId = sessionRooms.remove(sessionId);

        if (roomId != null) {
            List<WebSocketSession> peers = rooms.get(roomId);
            if (peers != null) {
                peers.remove(session);
                // Notify the remaining peer that the other peer has left
                for (WebSocketSession peer : peers) {
                    sendMessage(peer, SignalMessage.builder()
                        .type("peer-left")
                        .roomId(roomId)
                        .message("Your peer has disconnected.")
                        .build());
                }
                // Clean up empty room
                if (peers.isEmpty()) {
                    rooms.remove(roomId);
                    log.debug("Room cleaned up (empty)");
                }
            }
        }

        log.debug("Connection closed: sessionId={}, status={}", sessionId, status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("Transport error for session {}: {}", session.getId(), exception.getMessage());
    }

    // -------------------------------------------------------------------------
    // Message Handling
    // -------------------------------------------------------------------------

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage textMessage) {
        try {
            SignalMessage msg = objectMapper.readValue(textMessage.getPayload(), SignalMessage.class);
            log.debug("Received [{}] from sessionId={}", msg.getType(), session.getId());

            switch (msg.getType()) {
                case "join"          -> handleJoin(session, msg);
                case "offer"         -> handleRelay(session, msg);
                case "answer"        -> handleRelay(session, msg);
                case "ice-candidate" -> handleRelay(session, msg);
                case "ping"          -> sendMessage(session, SignalMessage.builder().type("pong").build());
                default              -> log.warn("Unknown message type: {}", msg.getType());
            }

        } catch (Exception e) {
            log.error("Error processing message from session {}: {}", session.getId(), e.getMessage());
            sendMessage(session, SignalMessage.builder()
                .type("error")
                .message("Invalid message format: " + e.getMessage())
                .build());
        }
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    /**
     * Handles a peer joining a room.
     * - First peer: added to room, waits for second peer.
     * - Second peer: triggers "ready" signal to the first peer (initiator).
     * - Third+ peer: rejected (P2P is 1-to-1).
     */
    private void handleJoin(WebSocketSession session, SignalMessage msg) {
        String roomId = msg.getRoomId();
        if (roomId == null || roomId.isBlank()) {
            sendMessage(session, SignalMessage.builder()
                .type("error")
                .message("roomId is required to join.")
                .build());
            return;
        }

        List<WebSocketSession> peers = rooms.computeIfAbsent(roomId,
            id -> Collections.synchronizedList(new ArrayList<>()));

        if (peers.size() >= 2) {
            // Room full — reject the third peer
            sendMessage(session, SignalMessage.builder()
                .type("error")
                .roomId(roomId)
                .message("Room is full. Only 2 peers allowed per room.")
                .build());
            log.warn("Room full, rejected session {}", session.getId());
            return;
        }

        peers.add(session);
        sessionRooms.put(session.getId(), roomId);
        log.debug("Session {} joined a room. Peers in room: {}", session.getId(), peers.size());

        if (peers.size() == 1) {
            // First peer — tell them to wait for the other peer
            sendMessage(session, SignalMessage.builder()
                .type("waiting")
                .roomId(roomId)
                .message("Waiting for another peer to join...")
                .build());

        } else {
            // Second peer joined — kick off WebRTC negotiation
            // Tell the first peer (initiator) to create and send the SDP offer
            WebSocketSession initiator = peers.get(0);
            sendMessage(initiator, SignalMessage.builder()
                .type("ready")
                .roomId(roomId)
                .message("Peer joined. Start WebRTC negotiation.")
                .build());

            // Confirm to the second peer that they've joined successfully
            sendMessage(session, SignalMessage.builder()
                .type("joined")
                .roomId(roomId)
                .message("Joined room. Waiting for offer...")
                .build());

            log.debug("Both peers present. Initiator: {}", initiator.getId());
        }
    }

    /**
     * Relays a signaling message (offer, answer, or ICE candidate)
     * from the sender to the other peer in the same room.
     * fromName is stripped before forwarding — names are exchanged privately
     * over the encrypted DataChannel, never via this server.
     */
    private void handleRelay(WebSocketSession sender, SignalMessage msg) {
        // Defensive strip: ensure no display name leaks through the server
        msg.setFromName(null);
        String roomId = msg.getRoomId();
        List<WebSocketSession> peers = rooms.get(roomId);

        if (peers == null || peers.isEmpty()) {
            sendMessage(sender, SignalMessage.builder()
                .type("error")
                .roomId(roomId)
                .message("Room not found or empty.")
                .build());
            return;
        }

        // Find the OTHER peer in the room and forward the message
        peers.stream()
            .filter(peer -> !peer.getId().equals(sender.getId()))
            .findFirst()
            .ifPresentOrElse(
                target -> sendMessage(target, msg),
                // Other peer is gone (disconnected mid-negotiation) — silently drop.
                // The sender already received a "peer-left" event; sending an error here
                // would cause the frontend to crash back to the join screen unnecessarily.
                () -> log.debug("Relay miss for room {} — other peer already left.", roomId)
            );
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    /**
     * Serializes and sends a SignalMessage to a WebSocket session.
     * Synchronized to prevent concurrent write issues on the same session.
     */
    private void sendMessage(WebSocketSession session, SignalMessage msg) {
        if (!session.isOpen()) {
            log.warn("Attempted to send to closed session: {}", session.getId());
            return;
        }
        try {
            synchronized (session) {
                String json = objectMapper.writeValueAsString(msg);
                session.sendMessage(new TextMessage(json));
            }
        } catch (IOException e) {
            log.error("Failed to send message to session {}: {}", session.getId(), e.getMessage());
        }
    }
}
