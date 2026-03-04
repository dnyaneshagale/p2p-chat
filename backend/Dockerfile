# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21-alpine AS build

WORKDIR /app

# Copy POM first — lets Docker cache the dependency layer separately from source
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Copy source and build
COPY src ./src
RUN mvn package -DskipTests -q

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Non-root user for security
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

COPY --from=build /app/target/*.jar app.jar

# Expose the application port
EXPOSE 8080

# JVM tuning for FAST startup on Cloud Run:
#   -XX:+UseContainerSupport     — respect cgroup CPU/memory limits
#   -XX:MaxRAMPercentage=75.0    — use up to 75% of container RAM for heap
#   -XX:+TieredCompilation
#   -XX:TieredStopAtLevel=1      — skip C2 JIT (faster startup, ok for I/O bound)
#   -XX:+UseSerialGC             — minimal GC overhead for small container
#   -Xss256k                     — reduce thread stack size (signaling is lightweight)
#   -Djava.security.egd=...      — faster startup on Linux (avoid entropy wait)
#   -Dspring.jmx.enabled=false   — skip JMX registration
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-XX:+TieredCompilation", \
  "-XX:TieredStopAtLevel=1", \
  "-XX:+UseSerialGC", \
  "-Xss256k", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-Dspring.jmx.enabled=false", \
  "-Dspring.profiles.active=prod", \
  "-jar", "app.jar"]
