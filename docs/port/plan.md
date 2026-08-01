# Plan: Port Clone Hero Chart Manager to a self-hosted webapp

**Source:** [xlzipx/clone-hero-chart-manager](https://github.com/xlzipx/clone-hero-chart-manager) — Electron + React + TypeScript, MIT, npm + electron-vite.
**Target:** Node HTTP server + browser SPA, in Docker on the apps container, behind Traefik, managing `/mnt/media/clone-hero`.
**Security model (Jaime's decision, 2026-08-01):** no app auth, no user management. The trust boundary is the local network; Traefik and the server's network position are the whole access control. The app must therefore never be exposed on a router reachable from outside the LAN.
**Scope (Jaime's decision, 2026-08-01):** catalog search + download from sources, and management of the existing library. **No manual install / upload flow** — the two unportable Electron methods (`getDroppedFilePath`, `dialog:chooseSongFile`) are deleted, not rewritten.
**Basis:** the analysis in the vault note `60-Systems/Clone Hero Library.md` (§ "Considered, not decided"). Do not re-derive it.

Each phase below is written as a self-contained brief for one subagent. Phases marked **HUMAN** need Jaime; agents must stop and report at those points, not work around them.

---

## Standing guardrails (paste into every subagent prompt)

1. Never delete, move, or modify anything under `/mnt/media/clone-hero` — until Phase 8, all development runs against a local fixture library on the Mac.
2. No secrets in the repo, ever: no API keys, no `.env` with real values. `.env.example` only.
3. The whole point is the preload contract: `app/src/preload/index.ts` defines 69 typed methods as one `api` object and the renderer touches nothing else. Preserve those method names and TypeScript types exactly. A renderer diff beyond un-routing deleted features means the approach is wrong.
4. Manual install is out of scope: `getDroppedFilePath` and `dialog:chooseSongFile` (and the drag-drop / file-picker UI that calls them) are classified `delete`. Do not rewrite them as an upload flow.
5. Commit style: small commits, imperative subject, one concern per commit. Work on branch `webapp`, never on `main` (`main` tracks upstream).
6. Onyx (`onyx.exe`, GPL v3, separate binary) may not exist for Linux. CON conversion is feature-flagged, not load-bearing. Never vendor its binary into the repo (GPL v3 vs MIT).
7. If a phase's "done" check fails, report the failure verbatim — do not redefine done.

---

## Phase 0 — Dev environment on the Mac  *(Sonnet + HUMAN)*

Goal: Mac can build the stock Electron app; GitHub fork exists; repo cloned with correct remotes.

Current state (checked 2026-08-01): git 2.50.1 installed, **no `user.name`/`user.email` configured**; `gh` not installed; node v26.5.0 + npm 11.17.0 fine; SSH key `~/.ssh/id_ed25519` exists but its GitHub linkage is unverified; `github.com` not in `known_hosts`.

Steps:

1. **HUMAN — decide git identity.** Personal project → personal identity, not `jaime.king@bridgefund.nl`. Recommended: GitHub username + the GitHub-provided noreply address (`<id>+<user>@users.noreply.github.com`). Agent then runs:
   ```sh
   git config --global user.name "<name>"
   git config --global user.email "<noreply email>"
   git config --global init.defaultBranch main
   ```
2. Agent: `brew install gh`.
3. **HUMAN — authenticate:** `gh auth login` (GitHub.com, SSH protocol, browser device flow). Agents must never enter credentials; Jaime does this step at the keyboard. If the existing `id_ed25519` key isn't on the account, let `gh` upload it during login.
4. Agent verify: `gh auth status` and `ssh -T git@github.com` both succeed.
5. **HUMAN — approve fork** (creates a public repo on Jaime's account). Then agent:
   ```sh
   gh repo fork xlzipx/clone-hero-chart-manager --clone ~/dev/clone-hero-chart-manager
   cd ~/dev/clone-hero-chart-manager
   git checkout -b webapp
   ```
   (`gh repo fork` sets `origin` = fork, `upstream` = xlzipx automatically.)
6. Baseline build proof: `cd app && npm ci && npm run dev` — the stock Electron app must open and render its UI on the Mac. Screenshot it. This is the reference for "port bug vs upstream bug" forever after.
7. Create a fixture library: `~/dev/ch-fixture/Songs/` with ~10 real-shaped charts (copy a handful from the NAS over SMB, read-only copy), including at least one unicode-named chart (`Olivia Rodrigo - bad idea right？` style) and one inside a `packs/` subtree.

Done when: stock app runs, `gh auth status` clean, branch `webapp` exists, fixture library exists.

---

## Phase 1 — API inventory  *(Sonnet, read-only)*

Goal: the single source of truth every later phase codes against.

Steps:

1. Read `app/src/preload/index.ts` and every `ipcMain.handle`/`ipcMain.on` in `app/src/main/` (chiefly `ipc.ts`).
2. Produce `docs/port/api-inventory.md`: one row per method — preload name, IPC channel, kind (`invoke` / `send` / `on`-stream), argument types, return type, handler file:line, and port classification:
   - `http` — plain request/response (expected: ~60 of the 62 invoke/send methods)
   - `sse` — server-push stream (expected: 7)
   - `delete` — desktop-only or out-of-scope: tray/overlay/hotkeys/autoupdate/gamedetect/game-launch/reminder/menu, plus `getDroppedFilePath` and `dialog:chooseSongFile` (manual install dropped from scope)
3. Second table: every module in `app/src/main/core/` → keep as-is / shim (`config.ts`, `librarymgr.ts`, `localaudio.ts`) / delete, with the exact Electron imports that force the classification.
4. Flag anything the analysis missed (e.g. `shell.openExternal` in renderer, `process` access, Node built-ins in shared code).

Done when: the inventory totals reconcile against the preload's 69 exports and the doc is committed.

---

## Phase 2 — Server skeleton  *(Opus)*

Goal: a Node server that hosts the untouched core modules.

Decisions (pre-made, don't relitigate): **Fastify** for the server (typed, fast, first-class SSE via reply-raw), single deployable that serves both API and the built renderer, config via environment variables.

Steps:

1. New `server/` workspace in the repo (keep `app/` intact — the Electron build should still work on `main`).
2. `server/config.ts` shim replacing `app.getPath(...)`: data dir from `CHM_DATA_DIR`, library root from `CHM_LIBRARY_ROOT`. Same exported shape as `app/src/main/core/config.ts` so core modules import it unchanged (path-alias or symlink the import).
3. Mount the 11 uncoupled `main/core` modules as-is. Stub `librarymgr`/`localaudio` for now (Phase 5).
4. HTTP router: for every `http` row in the inventory, `POST /api/<channel>` with JSON body = args array, JSON response = return value. Mechanical; generate from the inventory, don't hand-craft creative routes.
5. Serve static files from the renderer build output.
6. Health endpoint `GET /healthz`.

Done when: server boots against the fixture library, `curl` on five representative endpoints (library list, settings get/set, search-related, jobs list) returns real data, and `npm run build` on `main` still produces the Electron app untouched.

---

## Phase 3 — Renderer web build + fetch shim  *(Sonnet)*

Goal: the React renderer runs in a plain browser tab against Phase 2's server.

Steps:

1. Vite web build target for the renderer (the electron-vite renderer config is already ~standard Vite; extract it).
2. Write `web-api.ts`: an object with the **identical 69-method type signature** as the preload `api`. The `http` methods become `fetch('/api/<channel>', ...)`. The 7 `on` streams get temporary throwing stubs with a clear message; `delete`-classified methods get permanent stubs that throw "removed in web port".
3. Swap the injection point: wherever the renderer reads `window.api`, provide the shim in the web build (define/alias — renderer source files themselves stay untouched, per guardrail 3).
4. Delete/exclude renderer references to desktop-only channels per the inventory's `delete` list — if that requires renderer edits, list them in the phase report; expected to be near-zero because deleted features have their own components that can simply be un-routed.

Done when: browser at `localhost` shows the app; library view lists fixture charts; settings round-trip; streams/upload visibly stubbed, not silently broken.

---

## Phase 4 — Event streams  *(Opus)*

Goal: the 7 `ipcRenderer.on` channels work over SSE.

Steps:

1. Single endpoint `GET /api/events` (SSE). Every event: `event: <channel>`, `data: <json args>`. `jobs.ts` already models the long-running work — bridge its emissions to the SSE bus.
2. Client side: one `EventSource` in `web-api.ts`; the 7 `on(channel, cb)` methods subscribe to it. Reconnect with `Last-Event-ID` where replay matters (job progress can just resnapshot via the jobs-list endpoint on reconnect).
3. Prove it end-to-end: start a real download job from the UI against the fixture, watch progress render live, kill the server mid-job, restart, confirm the UI recovers.

Done when: all 7 channels demonstrably deliver, including across a reconnect.

---

## Phase 5 — Shim the three coupled modules  *(Sonnet)*

1. `librarymgr.ts`: `shell.trashItem` → move into `<library>/.trash/<timestamp>/` preserving relative path (mirrors the ch-tools archive philosophy — nothing is ever hard-deleted). `shell.openPath` → remove; return the path so the UI can show it instead.
2. `localaudio.ts`: the custom Electron `protocol` for audio preview → `GET /api/audio?chart=<rel>` with HTTP Range support (seeking). Content-type by extension (ogg/opus/mp3).
3. **Read `safeAbs(rel)` adversarially** — it is now a path-traversal guard on an HTTP boundary. There is no auth in front of it, so anything on the LAN can hit it; it must be correct on its own. Test with `../`, absolute paths, URL-encoded traversal, and a symlink inside the fixture library. Fix or wrap before exposing.
4. Extraction: 7-Zip calls → `p7zip` (`7z` binary). Still needed with upload dropped — **downloads from the catalog sources arrive as archives**. Verify rar support (`p7zip-rar`/unrar); charts commonly ship as `.rar`.
5. Onyx investigation (bounded, ≤1 hour): does [mtolly/onyx](https://github.com/mtolly/onyx) publish working Linux CLI builds? Still relevant — sources host Rock Band CON files. If yes, wire behind `CHM_ONYX_PATH` env var. If no, feature-flag CON conversion off with a visible UI notice. Document the finding in `docs/port/onyx.md`.

Done when: audio preview plays and seeks in the browser; deletion lands in `.trash/`; traversal tests all rejected (added as automated tests); a downloaded archive from a source extracts and installs end-to-end on the fixture; Onyx question answered in writing.

---

## Phase 6 — Container + deploy  *(Sonnet; HUMAN approves go-live)*

1. Multi-stage Dockerfile: build renderer + server, runtime `node:26-slim` + `p7zip-full` (+ unrar if needed), non-root user, library mounted at `/library`, data volume at `/data`.
2. Compose stack in the apps container's stack layout (see vault `Apps Server` note for conventions): service `chart-manager`, `/mnt/media/clone-hero:/library`, named volume for `/data`. **First deploy mounts the library `:ro`** — flip to `rw` only after Phase 7 read-only checks pass.
3. Traefik file-provider router: `chart-manager.<domain>` → service. **No auth middleware** — per the security-model decision above, the LAN is the trust boundary. Consequence the deployer must honour: the router must only be reachable from inside the network (no port-forward, no tunnel, no public DNS pointing here).
4. The container user must be able to write the library: run with a uid in the container's `jaime` group (the `nobody:jaime 2775` + setgid scheme from `Clone Hero Library.md`). Verify with a write probe before declaring done — this exact trap has bitten before.

Done when: `https://chart-manager.<domain>` serves the app on the LAN, healthcheck green, library visible read-only.

---

## Phase 7 — Validate against the real library  *(Opus; HUMAN approves rw)*

1. Read-only pass over all 3402 charts: library scan completes, no crashes on unicode names (`Olivia Rodrigo - bad idea right？`, `Asuka Ōta`), CRLF genres, the three stray `.txt` manifests in `packs/`, and the `Archive/` tree (decide: exclude `Archive/` from the app's library root, or point the app at `Songs/` only — recommended: `CHM_LIBRARY_ROOT=/library/Songs`).
2. Run its duplicate detection over the 57 packs; save the report — this is the feature the whole port is for.
3. **HUMAN reviews** the read-only results, then flips the mount to `rw`.
4. Controlled write test: download one chart from a catalog source, delete it via UI, confirm it landed in `.trash/`, restore it by hand. Confirm the ch-tools scripts (`ch-index.sh`) still see a consistent library afterwards.

Done when: dedupe report delivered, one full write round-trip verified, ch-tools unaffected.

---

## Decisions Jaime must make (blocking, mostly Phase 0)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Git identity on this Mac | Personal name + GitHub noreply email — not the BridgeFund address |
| 2 | GitHub auth | `gh auth login`, SSH protocol, done by Jaime at the keyboard |
| 3 | Fork name | Keep `clone-hero-chart-manager` (simplest for `upstream` merges) |
| 4 | Server framework | Fastify (pre-made above; veto now or it ships) |
| 5 | Library root for the app | `Songs/` only, keeping `Archive/` invisible to it |

Decided 2026-08-01: no app auth (LAN is the trust boundary), and no manual install / upload flow — the app is for catalog search + download and managing the existing library.

## Sequencing and models

Strict order 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7; each phase's output is the next one's input. No parallelism worth the coordination cost except: the Onyx investigation (Phase 5 step 5) can run any time after Phase 0.

Opus for the phases that design (2, 4, 7), Sonnet for the mechanical ones (0, 1, 3, 5, 6). Every subagent gets: the guardrails block, its phase text, `docs/port/api-inventory.md` (from Phase 1 on), and the pointer to `60-Systems/Clone Hero Library.md`.
