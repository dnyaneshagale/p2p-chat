package com.chatapp.config;

import com.chatapp.handler.SignalingHandler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

import java.util.Arrays;

/**
 * Registers the WebSocket signaling endpoint.
 *
 * Clients connect to: wss://<host>/signal
 * This endpoint is used ONLY for WebRTC signaling (SDP/ICE exchange).
 * After the WebRTC connection is established, all data flows peer-to-peer.
 *
 * Allowed origins are configured via the {@code app.cors.allowed-origins} property,
 * which reads the {@code ALLOWED_ORIGINS} environment variable at runtime.
 *   Development default : * (all origins)
 *   Production          : set ALLOWED_ORIGINS=https://chat-p2p-x.web.app
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    @Autowired
    private SignalingHandler signalingHandler;

    /**
     * Raw comma-separated allowed origins string from config.
     * Injected as a plain String and split manually to avoid SpEL type-conversion
     * issues (SpEL projection returns List which may not coerce to String[]).
     */
    @Value("${app.cors.allowed-origins:*}")
    private String allowedOriginsRaw;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        String[] origins = Arrays.stream(allowedOriginsRaw.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .toArray(String[]::new);

        registry
            .addHandler(signalingHandler, "/signal")
            .setAllowedOriginPatterns(origins);
    }

    /**
     * Sets the maximum WebSocket text message buffer size to 64 KB.
     * This is the correct way to configure it — the
     * spring.websocket.max-text-message-size property has no effect.
     */
    @Bean
    public ServletServerContainerFactoryBean createWebSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(65536);
        container.setMaxBinaryMessageBufferSize(65536);
        return container;
    }
}
