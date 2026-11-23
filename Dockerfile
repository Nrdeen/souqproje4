# SouqAlGhanam 2.0 (سوق الغنم 2.0) — Production Container Image
# Multi-stage, multi-arch build supporting linux/arm64 (Oracle Always Free Ampere A1) & linux/amd64

FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Build essentials ensure native modules (e.g. argon2 on ARM64) compile cleanly if prebuilds are unavailable
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Vite React production bundle into /app/dist
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=768"

# Create writable local fallback upload directory owned by non-root node user
RUN mkdir -p /app/data/uploads && chown -R node:node /app

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/server.ts ./server.ts
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/src/lib/listing-search.ts ./src/lib/listing-search.ts
COPY --from=builder --chown=node:node /app/src/assets/images ./src/assets/images
COPY --from=builder --chown=node:node /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json

USER node
EXPOSE 3000

# Check process liveness only so transient object-storage glitches do not force unnecessary container restarts.
# External monitors and load balancers should probe /api/v1/ready for DB + media readiness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/live').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
