# MediaLoom Minimal Container Image
# Multi-stage build based on Alpine Linux for smallest possible footprint
# Includes: Bun runtime, full FFmpeg & ffprobe, OpenSSL for Prisma, and MediaLoom

# -----------------------------------------------------------------------------
# Base Image: Minimal Alpine Linux with Bun and Full FFmpeg
# -----------------------------------------------------------------------------
FROM oven/bun:1-alpine AS base

# Install full ffmpeg, ffprobe, and system dependencies
RUN apk update && apk add --no-cache \
    ffmpeg \
    openssl \
    libc6-compat \
    ca-certificates \
    tzdata

WORKDIR /app

# Set default environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL="file:/app/data/medialoom.db"

# -----------------------------------------------------------------------------
# Builder Stage: Install dependencies and build monorepo packages
# -----------------------------------------------------------------------------
FROM base AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package.json bun.lock tsconfig.json ./

# Copy package manifests across monorepo for caching
COPY apps/cli/package.json ./apps/cli/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/media/package.json ./packages/media/
COPY packages/profiles/package.json ./packages/profiles/
COPY packages/providers/package.json ./packages/providers/

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# Copy full source tree
COPY . .

# Generate Prisma Client for SQLite
RUN cd packages/db && bunx prisma generate

# Build packages
RUN bun run build

# -----------------------------------------------------------------------------
# Production Runner Stage: Lean execution environment
# -----------------------------------------------------------------------------
FROM base AS runner

WORKDIR /app

# Create directory for persistent SQLite database and media mounts
RUN mkdir -p /app/data /Volumes/Movies /Volumes/Series

# Copy built application and installed node_modules from builder
COPY --from=builder /app /app

# Expose web interface port
EXPOSE 3000

# Default command runs the CLI or web server (can be overridden at runtime)
ENTRYPOINT ["bun", "apps/cli/bin/medialoom.ts"]
CMD ["--help"]
