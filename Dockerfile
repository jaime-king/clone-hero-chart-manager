# Clone Hero Chart Manager — self-hosted webapp image (Phase 6).
# Multi-stage: (1) build renderer SPA + server, (2) fetch & extract the Onyx
# Linux AppImage, (3) slim runtime with 7-Zip. Built ON the amd64 server
# (the Onyx AppImage is linux-x64 only; do not build on an arm64 Mac).
#
# Run contract (see server/.env.example and the compose example in README.md):
#   /library  — the Songs library mount (read-only in Phase 6)
#   /data     — named volume: config.json, trash/, documents/, hash-index.json
#   port 8300

# ---- Stage 1: build ---------------------------------------------------------
FROM node:26 AS build
WORKDIR /repo

# Electron is a dependency of app/ but its binary is useless here — skip the
# ~100 MB download its postinstall performs.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
# npm 11 gates dependency install scripts behind approval. app/package.json
# carries the allowScripts block, but a version bump or a non-TTY prompt must
# never hang/fail the image build, so approve globally for this build stage
# only (nothing from this stage's npm state reaches the runtime image).
ENV npm_config_dangerously_allow_all_scripts=true

COPY . .

# Renderer SPA. build:web, NOT build — both write app/out and the web build
# must win (it moves index.web.html into place as index.html).
RUN cd app && npm ci && npm run build:web

# Server. npm ci's postinstall runs scripts/sync-core.mjs (mirrors
# app/src/main/core + shared into server/src/gen); build = tsc → dist/.
# Then reinstall prod-only for the runtime copy (--ignore-scripts: the
# sync-core postinstall is a build-time concern, dist/ is already compiled).
RUN cd server && npm ci && npm run build \
 && rm -rf node_modules && npm ci --omit=dev --ignore-scripts

# ---- Stage 2: Onyx (CON/DTX -> Clone Hero conversion CLI) -------------------
# Official Linux x64 AppImage, extracted at build time so the runtime needs no
# FUSE (docs/port/onyx.md). GPL v3 binary: fetched, never vendored in the repo.
FROM debian:bookworm-slim AS onyx
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/onyx
RUN curl -fL -o onyx.AppImage \
      https://github.com/mtolly/onyx/releases/download/20251011/onyx-20251011-linux-x64.AppImage \
 && chmod +x onyx.AppImage \
 && ./onyx.AppImage --appimage-extract \
 && rm onyx.AppImage

# ---- Stage 3: runtime -------------------------------------------------------
FROM node:26-slim
# p7zip-full provides /usr/bin/7z (the default CHM_SEVENZIP_PATH) — on Debian
# trixie it is a transitional package for upstream 7-Zip 25.01, which lists
# Rar/Rar5 among its formats. unrar-free is a best-effort standalone fallback
# (the app itself only ever calls 7z). The lib* packages are the shared
# libraries the extracted Onyx AppImage needs at runtime (verified
# empirically: without them AppRun fails on libGL.so.1 / libfontconfig.so.1).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      p7zip-full \
      libgl1 libfontconfig1 libxkbcommon0 libdbus-1-3 \
 && (apt-get install -y --no-install-recommends unrar-free || true) \
 && rm -rf /var/lib/apt/lists/*

# Non-root. uid/gid 1001 = `jaime` on the apps container, so anything the
# container ever writes to a bind mount (Phase 7+, rw) lands with a sane owner.
RUN groupadd -g 1001 chm && useradd -u 1001 -g 1001 -m -s /usr/sbin/nologin chm

WORKDIR /app

# Server: compiled dist + prod node_modules. node_modules/electron is a
# symlink into src/shims/electron (the file: dep), so the shim source ships too.
COPY --from=build /repo/server/dist        server/dist
COPY --from=build /repo/server/node_modules server/node_modules
COPY --from=build /repo/server/src/shims   server/src/shims
COPY --from=build /repo/server/package.json server/package.json
# Renderer SPA at the path server/src/index.ts serves by default
# (../app/out/renderer relative to server/).
COPY --from=build /repo/app/out/renderer   app/out/renderer
# Onyx, extracted.
COPY --from=onyx  /opt/onyx/squashfs-root  /opt/onyx/squashfs-root

RUN mkdir -p /data && chown chm:chm /data

ENV NODE_ENV=production \
    CHM_PORT=8300 \
    CHM_HOST=0.0.0.0 \
    CHM_DATA_DIR=/data \
    CHM_LIBRARY_ROOT=/library \
    CHM_SEVENZIP_PATH=7z \
    CHM_ONYX_PATH=/opt/onyx/squashfs-root/AppRun

USER chm
WORKDIR /app/server
EXPOSE 8300
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8300/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
