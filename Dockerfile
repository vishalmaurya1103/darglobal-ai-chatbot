# syntax=docker/dockerfile:1

# ─── Dependencies ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` installs exactly the lockfile, so the image cannot drift from what was tested.
RUN npm ci

# ─── Build ───────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Config is read lazily, so the build needs no runtime secrets.
RUN npm run build

# ─── Runtime ─────────────────────────────────────────────────────────────────
# Only the standalone output is copied forward: no source, no dev dependencies,
# no build toolchain, and nothing from the build context that is not needed to serve.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# `node` is an unprivileged user that ships with the base image.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Next.js handles SIGTERM on the standalone server, so no init shim is needed.
CMD ["node", "server.js"]
