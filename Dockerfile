# syntax=docker/dockerfile:1

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Copy dependency manifests first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY patches/ ./patches/

# Install all dependencies (including devDeps needed for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build: Vite (client) + esbuild (server)
RUN pnpm build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install pnpm (needed for production install)
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Copy manifests for production install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY patches/ ./patches/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy public assets (sprites, etc.) served by Express in production
COPY --from=builder /app/public ./public

# Copy bridge script (useful for users running bridge inside container)
COPY --from=builder /app/bridge ./bridge

# Non-root user for security
RUN addgroup -S dungeon && adduser -S dungeon -G dungeon && mkdir -p /home/dungeon/.claude-dungeon && chown -R dungeon:dungeon /home/dungeon
RUN chown -R dungeon:dungeon /app
USER dungeon

# Data directory (API key + event persistence)
VOLUME ["/home/dungeon/.claude-dungeon"]

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
