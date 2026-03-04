package com.chatapp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the WebRTC P2P Chat Signaling Server.
 *
 * This server is ONLY responsible for WebRTC signaling (SDP + ICE exchange).
 * All chat messages, media, and video streams flow directly peer-to-peer
 * between browsers via WebRTC — NOT through this server.
 */
@SpringBootApplication
public class ChatAppApplication {

    public static void main(String[] args) {
        SpringApplication.run(ChatAppApplication.class, args);
    }
}
