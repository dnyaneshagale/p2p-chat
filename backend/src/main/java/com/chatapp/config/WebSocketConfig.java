package com.chatapp.config;

import com.chatapp.handler.SignalingHandler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Registers the WebSocket signaling endpoint.
 *
 * Clients connect to: ws(s)://<host>:<port>/signal
 * This endpoint is used ONLY for WebRTC signaling (SDP/ICE exchange).
 * After the WebRTC connection is established, all data flows peer-to-peer.
 *
 * Allowed origins are configured via the {@code app.cors.allowed-origins} property,
 * which reads the {@code ALLOWED_ORIGINS} environment variable at runtime.
 *   Development default : * (all origins)
 *   Production          : set ALLOWED_ORIGINS=https://your-app.web.app
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    @Autowired
    private SignalingHandler signalingHandler;

    /**
     * Comma-separated list of allowed WebSocket origins.
     * Spring automatically splits the string on commas when injecting into String[].
     * Examples:
     *   "*"                                (development)
     *   "https://your-app.web.app"         (single Firebase origin)
     *   "https://your-app.web.app,https://custom.domain.com"  (multiple)
     */
    @Value("#{'${app.cors.allowed-origins:*}'.split(',')}")
    private String[] allowedOrigins;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry
            .addHandler(signalingHandler, "/signal")
            .setAllowedOrigins(allowedOrigins);
    }
}
