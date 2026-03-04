package com.chatapp.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Minimal health-check endpoint.
 *
 * GET /health → 200 {"status":"UP"}
 *
 * Used by Render's health-check polling to keep the free-tier container
 * alive and to confirm the service started correctly after a deploy.
 */
@RestController
public class HealthController {

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "UP"));
    }
}
