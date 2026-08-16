# syntax=docker/dockerfile:1

# LeapFrog ships as a single image that can run either the web server or a worker
# pipeline command (see docker/entrypoint-*.sh). One image, two roles — so the web
# service and the worker in docker-compose / Render share identical, pinned deps.

# ---- build: install the whole workspace and compile core + web + worker ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Toolchain for native addons: better-sqlite3 falls back to a source build when no
# prebuilt binary matches the platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install against the lockfile first so `npm ci` is cached until a manifest changes.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci

# Build every workspace: core (tsc) → web (next build) → worker (tsc).
COPY . .
RUN npm run build

# ---- runtime: copy the built workspace onto a clean base (no compilers) ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    LEAPFROG_DB_PATH=/data/leapfrog.sqlite

# Native binaries built above target bookworm/glibc, matching this base image.
COPY --from=build /app ./

# Persistent store for the SQLite database and the cached embedding model.
VOLUME ["/data"]
EXPOSE 3000

# Default role is the web server; docker-compose/Render override CMD for the worker.
CMD ["sh", "docker/entrypoint-web.sh"]
