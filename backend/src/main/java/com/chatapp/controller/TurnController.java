package com.chatapp.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;

/**
 * Proxies Cloudflare TURN credential requests so the API token never reaches
 * the browser.  The frontend calls GET /api/turn-credentials and receives a
 * fresh set of short-lived ICE servers it can pass straight to RTCPeerConnection.
 *
 * Env vars required on Cloud Run:
 *   CF_TURN_KEY_ID    – Cloudflare TURN Key ID
 *   CF_TURN_API_TOKEN – Cloudflare TURN API Token
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(originPatterns = "*")
public class TurnController {

    private static final Logger log = LoggerFactory.getLogger(TurnController.class);
    private static final String CF_TURN_URL =
            "https://rtc.live.cloudflare.com/v1/turn/keys/%s/credentials/generate";

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper mapper = new ObjectMapper();

    @Value("${CF_TURN_KEY_ID:}")
    private String turnKeyId;

    @Value("${CF_TURN_API_TOKEN:}")
    private String turnApiToken;

    @GetMapping("/turn-credentials")
    public ResponseEntity<?> getTurnCredentials() {
        // If Cloudflare credentials aren't configured, return Google STUN only
        if (turnKeyId.isBlank() || turnApiToken.isBlank()) {
            log.warn("CF_TURN_KEY_ID or CF_TURN_API_TOKEN not set — returning STUN only");
            Map<String, Object> fallback = Map.of(
                "iceServers", List.of(
                    Map.of("urls", List.of("stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"))
                )
            );
            return ResponseEntity.ok(fallback);
        }

        try {
            String url = String.format(CF_TURN_URL, turnKeyId);

            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(turnApiToken);
            headers.setContentType(MediaType.APPLICATION_JSON);

            // Request credentials valid for 24 hours (86400 seconds)
            String body = "{\"ttl\": 86400}";

            HttpEntity<String> request = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);

            JsonNode cfResponse = mapper.readTree(response.getBody());

            // Cloudflare returns: { iceServers: { urls: [...], username: "...", credential: "..." } }
            JsonNode iceServersNode = cfResponse.get("iceServers");

            // Build the response with STUN + Cloudflare TURN
            List<Map<String, Object>> iceServers = new ArrayList<>();

            // Always include Google STUN
            iceServers.add(Map.of("urls", List.of("stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302")));

            // Add Cloudflare TURN servers
            if (iceServersNode != null) {
                Map<String, Object> turnEntry = new HashMap<>();

                // Extract URLs
                List<String> urls = new ArrayList<>();
                if (iceServersNode.has("urls")) {
                    for (JsonNode urlNode : iceServersNode.get("urls")) {
                        urls.add(urlNode.asText());
                    }
                }
                turnEntry.put("urls", urls);

                if (iceServersNode.has("username")) {
                    turnEntry.put("username", iceServersNode.get("username").asText());
                }
                if (iceServersNode.has("credential")) {
                    turnEntry.put("credential", iceServersNode.get("credential").asText());
                }

                iceServers.add(turnEntry);
            }

            Map<String, Object> result = Map.of("iceServers", iceServers);
            log.info("Generated Cloudflare TURN credentials (TTL=24h), {} ICE servers", iceServers.size());
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("Failed to fetch Cloudflare TURN credentials: {}", e.getMessage());

            // Fallback to STUN only
            Map<String, Object> fallback = Map.of(
                "iceServers", List.of(
                    Map.of("urls", List.of("stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"))
                )
            );
            return ResponseEntity.ok(fallback);
        }
    }
}
