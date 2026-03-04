# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-17-alpine AS build

WORKDIR /app

# Copy POM first — lets Docker cache the dependency layer separately from source
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Copy source and build
COPY src ./src
RUN mvn package -DskipTests -q

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Non-root user for security
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

COPY --from=build /app/target/*.jar app.jar

# Expose the application port
EXPOSE 8080

# JVM tuning for container environments:
#   -XX:+UseContainerSupport     — respect cgroup CPU/memory limits
#   -XX:MaxRAMPercentage=75.0    — use up to 75% of container RAM for heap
#   -Djava.security.egd=...      — faster startup on Linux (avoid entropy wait)
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
