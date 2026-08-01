# Onyx (mtolly/onyx) — Linux/Docker headless viability

Repo: https://github.com/mtolly/onyx (GPL v3, Haskell). No wiki (`has_wiki: false`).

## Verdict

**Yes — official Linux x86_64 headless CLI build exists and is viable in a
Docker container**, with one caveat: it ships as an **AppImage**, which needs
either FUSE in the container or a one-time `--appimage-extract` step (see
below). No build-from-source needed for the common case; source build is
also officially supported and documented as a fallback (including a
maintainer-provided Dockerfile).

## 1. Releases — Linux artifacts

Latest release: **`20251011`**, published 2025-10-12
(https://github.com/mtolly/onyx/releases/tag/20251011).

Assets:
- `onyx-20251011-linux-x64.AppImage` (60 MB) — **the Linux build**
- `onyx-20251011-macos-x64.zip`
- `onyx-20251011-windows-x64.exe`
- `onyx-command-line-20251011-windows-x64.zip` (Windows-only CLI-only bundle; no Linux equivalent asset, but the Linux AppImage already contains the CLI — see below)

Release history shows a Linux `.AppImage` has been published on every
release for years (20240120, 20240202, 20240719, 20240928, 20251011, …) — this
is a stable, maintained pattern, not a one-off.

No `.deb`/`.tar.gz` — only the AppImage for Linux.

### AppImage + Docker caveat

AppImages need FUSE to mount themselves at runtime, and most minimal Docker
base images don't have FUSE. Two standard workarounds (well documented
upstream by AppImage itself, and used by the onyx maintainer's own Dockerfile
for a *different* embedded AppImage tool — see `haskell/Dockerfile`):
1. `apt-get install -y libfuse2` (or `fuse-overlayfs`) in the image, run the
   AppImage normally, **or**
2. Extract once and run the extracted binary directly (no FUSE needed):
   ```
   ./onyx-20251011-linux-x64.AppImage --appimage-extract
   ./squashfs-root/AppRun <args...>
   ```
   This is the more robust option for a container (no runtime FUSE
   dependency at all) and mirrors exactly what the project's own Dockerfile
   does for `linuxdeploy`'s AppImage (`haskell/Dockerfile`):
   > "extract linuxdeploy AppImage due to no FUSE in docker ... appimage-extract"

The onyx AppImage itself is a GUI+CLI combo build (same binary handles both
the preview GUI and CLI subcommands like `import`/`build`); running it
headless via CLI args works fine once extracted — GUI code paths are only
invoked if you launch it with no args / GUI-specific flags.

## 2. CLI usage / build-from-source

- Root `README.md` has no CLI docs (`doc from README` — just points to the
  releases page).
- `haskell/README.md` points to a hosted manual: https://onyxite.org/toolkit/readme.html (not fetched here — external site, not part of repo, so not verified in depth; treat as authoritative onyx-authored docs if reachable).
- `doc/onyx.md` is high-level design notes ("NOT FINAL, WORK IN PROGRESS"), not a CLI reference.
- **`haskell/BUILD.md`** documents build support explicitly:
  - "Supported platforms (all 64-bit) ... Ubuntu Linux, including via Docker"
  - Dependencies: `stack` (Haskell Tool Stack), `linuxdeploy` on Linux.
  - Build steps: `git submodule update --init` → `./pre-dependencies` → `./build-dependencies` → `./stack-local build` → `./copy-resources` → `./package`.
  - **Docker build path is officially supported**: "Install Docker ... `./build-docker` ... AppImage will be created" — this uses `haskell/Dockerfile` (base `ubuntu:16.04`, installs Haskell Stack + C deps, builds, packages into an AppImage). This is the same artifact type published in releases, so building it yourself reproduces the official Linux AppImage.
  - **CLI-only install** (no AppImage/GUI packaging): "Follow normal build instructions, but instead of `./package`, run `./install-cli <DIR>` to install `onyx` and `onyx-files` into `<DIR>`. Default `~/.local/bin`." This produces a plain `onyx` binary + `onyx-files/` support dir + a `run-cli` wrapper script that sets `LD_LIBRARY_PATH` — no AppImage/FUSE involved at all, which may be the cleanest option for a Docker image if built from source.
- Build-from-source is moderately heavy: needs Haskell Stack (compiles GHC + a large dependency set), Haskell C deps via `pre-dependencies`/`build-dependencies` scripts, `linuxdeploy` for AppImage packaging. Expect a non-trivial (tens of minutes) first build, but it is a known/repeatable path the maintainer uses for every release (their own release AppImages are presumably built this same way).
- No official Docker Hub / GHCR image found — only the *build recipe* (`haskell/Dockerfile`, `build-docker` script) for producing the AppImage, not a ready-to-pull runtime image. Nothing third-party found either; did not search exhaustively for unofficial mirrors and would not recommend an unverified one anyway.

Exact `import`/`build` CLI flag syntax is not documented in the repo's markdown files — confirmed empirically via clone-hero-chart-manager's own working invocation (below), not from onyx docs.

## 3. How clone-hero-chart-manager invokes onyx

File: `/Users/jaimeking/dev/clone-hero-chart-manager/app/src/main/core/converter.ts`

Two-step CLI pipeline for CON → Clone Hero:
```
onyx import <CON_PATH> --to <projDir>       # creates projDir/song.yml
# then: ensure song.yml has a `targets: / ps:` (Phase Shift) target block
onyx build <projDir>/song.yml --target ps --to <outDir>
# outDir ends up with song.ini + notes.mid + album.png + audio (.ogg) — directly Clone-Hero-readable
```
Exact code (converter.ts:107, :122-124):
```ts
const imp = await run(onyx, ['import', importPath, '--to', projDir], undefined, signal)
...
const build = await run(onyx, ['build', songYml, '--target', 'ps', '--to', outDir], ..., signal)
```
Same function (`onyxConvert`) is reused for DTXMania (`.dtx`/`set.def`) imports too — `kind: 'DTX'`.

### Binary path resolution (config.ts / platform.ts)

- Binary name: `onyxBinaryName()` in `platform.ts` → `onyx.exe` on Windows, plain `onyx` on macOS/Linux.
- `detectOnyxPath()` in `config.ts` auto-searches for a file named `onyx` inside `<root>/onyx`, `<root>/native/onyx`, `<root>/native/onyx-mac` (up to depth 5) relative to a set of `rootCandidates()` (app resource dirs / `PORTABLE_EXECUTABLE_DIR` / exe dir) — this is the Electron-packaged-app auto-detect, **not currently Linux-container-aware** (no `native/onyx-linux` candidate, and no env var lookup at all — only `PORTABLE_EXECUTABLE_DIR` is read from env, nothing onyx-specific).
- If auto-detection finds nothing (`def.onyxPath === ''`), `getConfig()` falls back to whatever `onyxPath` value is already saved in the user's JSON config file (`configPath()`) — i.e. it's user-configurable via the app's Settings UI/config file today, just not via a dedicated env var.
- `converterAvailable()` just checks `existsSync(getConfig().onyxPath)`.
- `ensureExecutable()` (platform.ts) chmods the binary +x on non-Windows — needed since packaged binaries can lose the exec bit; still required after extracting an AppImage's `squashfs-root/AppRun` if permissions get reset by tar/zip handling.

## Recommendation

- Add a `native/onyx-linux` (or reuse `native/onyx`) candidate path and/or a
  `CHM_ONYX_PATH` environment variable read in `detectOnyxPath()` /
  `getConfig()`, checked before the packaged-app auto-detect. This is small
  (a few lines in `config.ts`), avoids depending on Electron's
  `rootCandidates()` layout in a headless server container, and lets the
  Docker image bake in wherever it extracted the onyx binary
  (e.g. `/opt/onyx/onyx` from an extracted AppImage or from-source
  `install-cli` output).
- Prefer **extracting the AppImage at image-build time**
  (`--appimage-extract` → copy `squashfs-root` into the image, point
  `CHM_ONYX_PATH` at `squashfs-root/AppRun`) over installing FUSE at
  runtime — simpler, no privileged/`--device /dev/fuse` container flags
  needed.
- Do **not** feature-flag CON conversion off — the Linux AppImage is
  official, current (Oct 2025), and the CLI invocation CHM already uses
  (`import` / `build --target ps`) requires no GUI. The only real risk is
  environment-specific (FUSE availability, missing shared libs the AppImage
  bundles) — worth a smoke test in the actual target container image before
  committing, but nothing here suggests it won't work headless.
