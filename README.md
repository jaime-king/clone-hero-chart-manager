# Clone Hero Chart Manager — self-hosted webapp

A **self-hosted web port** of [xlzipx/clone-hero-chart-manager](https://github.com/xlzipx/clone-hero-chart-manager):
search, download and manage Clone Hero charts from the
[RhythmVerse](https://rhythmverse.co/songfiles/game) and
[Chorus Encore](https://www.enchor.us) databases — running as a single
container on your own server, right next to the chart library it manages,
used from any browser on your network.

All credit for the app itself — the UI, the catalog integrations, the Spotify
import, the duplicate finder — goes to **[xlzipx](https://github.com/xlzipx)**.
This fork rehosts it: the Electron main process became a
[Fastify](https://fastify.dev) server, the renderer became a plain browser
SPA, and IPC became HTTP + one SSE stream.

> **No authentication.** This is built for a trusted home LAN behind a
> reverse proxy that is not reachable from the internet. Do not expose it
> publicly.

## What changed vs upstream

| Upstream (desktop) | This fork (webapp) |
|---|---|
| Windows/macOS Electron app | Linux container, any browser |
| Deletes go to the OS recycle bin | **Permanent delete**, restricted to the library root |
| Drag-and-drop manual install, native file pickers | Removed — catalog download + library management only |
| "Open Clone Hero / YARG" buttons, game detection, overlay hotkey, reminder pill, tray, auto-update | Removed — meaningless on a server |
| Per-user OS config | Environment variables |
| Electron desktop build target | Removed entirely (2026-08) — this fork is **web-only**; the Electron runtime, builder config and desktop-only UI chains are gone |

Everything else below survives from upstream unchanged.

## Features

### Import a Spotify playlist
- **Paste a Spotify link, get the charts** — drop a public Spotify playlist
  URL into the sidebar and CHM looks up a chart for every song in it, then lets
  you download the matches in bulk.
- **Any length** — it reads the whole playlist, not just the first 100 songs,
  through a small Cloudflare Worker that talks to the official Spotify Web API
  (the built-in reader is used as a fallback and covers up to 100).
- **Choose the chart** — when a song has more than one chart you can open
  its versions and pick which charter's to grab.
- Reads **public** playlists only; no Spotify login and no account data.

<p align="center">
  <img alt="Paste a public Spotify playlist link in the Import playlist window" width="720" src="docs/img/spotify_2.png" />
</p>

### Search & discovery
- **Two databases, one UI** — RhythmVerse + Chorus Encore. Pick one or
  search both at once (merged & de-duplicated by artist + title + charter).
- **Browse the whole catalog** — leave the search box empty and page through
  everything (140k+ files on RhythmVerse, 90k+ on Encore).
- **Type-ahead suggestions**, **instrument & difficulty** pickers, and an
  expandable **Filters** panel (genre, release year, song length, charter,
  album, hide-owned).
- **Sort** server-side by title, artist, length, most downloaded or recently
  added. **Surprise me** picks five random charts from what you're browsing.
- **Preview before you download** — hover a song's album art and press play
  for a 30-second clip of the real recording, matched by artist + title.
- **Download counts & "In library" tags** — spot at a glance which songs you
  already own.

<p align="center">
  <img alt="Live search results with type-ahead suggestions" width="780" src="docs/img/search-bar.webp" />
</p>

### Downloads
- **Multi-host downloader** — Google Drive (files & folders, including the
  virus-scan confirm bypass), Mediafire (HTML scrape), Dropbox (`dl=1`),
  shorteners (bit.ly, tinyurl, t.co, …) and direct links.
- **Manual hosts** (MEGA, Mediafire's browser-only flows) render as **Get on
  MEGA** / **Get on Mediafire** buttons that open the host in a new tab.
  Note: with manual install removed in this fork, charts from those hosts
  have to reach the `Songs` folder by your own means (e.g. the same network
  share the game uses).
- **Truncated download retry**, **batch download** (multi-select rows →
  Download selected), and a **live download queue** with per-item cancel,
  driven over SSE.

### Formats & conversion
- `ch` / `chart` / `ps` (Phase Shift) → **native**, just extract and copy.
- `.sng` (Chorus Encore container) → **unpacked** via `parse-sng` into a full
  folder of `song.ini` + chart + audio + album art.
- `rb3xbox` Xbox-360 CON / `.rb3con` → **converted** via
  [Onyx](https://github.com/mtolly/onyx) (bundled in the image, runs
  headless).
- Archives are extracted with **7-Zip 25.01** (rar-capable) inside the
  container.

### Library manager
- **Built-in file manager** for your `Songs` folder — multi-select,
  cut/copy/paste, rename, create folder, context menu and keyboard shortcuts.
  Every folder shows how many songs it holds.
  **Delete is permanent in this fork** (no recycle bin on a server); it can
  only touch paths inside the library root.
- **Playlists** — create and edit Clone Hero `.setlist` files.
- **Duplicate finder** — spot identical charts (same hash) and other copies
  of the same song, compare side by side, and move the ones you don't want
  into a quarantine folder (`CHM_QUARANTINE_DIR`).
- **Edit metadata** — adjust a song's `song.ini` in-app; **audio preview**
  streams the chart's real audio with seeking (HTTP range requests).

<p align="center">
  <img alt="Library manager: a full file browser for your Songs folder" width="820" src="docs/img/library-manager.png" />
</p>
<table>
  <tr>
    <td width="50%" valign="top"><img alt="Create and edit Clone Hero setlists" width="100%" src="docs/img/setlist-manager.png" /></td>
    <td width="50%" valign="top"><img alt="Duplicate finder comparing copies side by side" width="100%" src="docs/img/find-duplicates.webp" /></td>
  </tr>
</table>

> **Scanning into the game:** Clone Hero has no external rescan command —
> after downloading, open the game's **Settings → General → Scan Songs** and
> the new songs appear. The library folder the container manages is the same
> one the game reads (e.g. over a network share).

## Running it

Image: `ghcr.io/jaime-king/clone-hero-chart-manager:webapp` (linux/amd64,
built by [GitHub Actions](.github/workflows/build-image.yml) on every push;
each build is also tagged with its commit sha for rollbacks).

```yaml
services:
  chart-manager:
    image: ghcr.io/jaime-king/clone-hero-chart-manager:webapp
    restart: unless-stopped
    ports:
      - 8300:8300
    environment:
      CHM_LIBRARY_ROOT: /library
      CHM_DATA_DIR: /data
    volumes:
      - /path/to/your/Songs:/library
      - chart-manager-data:/data

volumes:
  chart-manager-data:
```

Open `http://<host>:8300`. The container runs as uid 1001 and must be able
to write the library for downloads and file management.

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `CHM_LIBRARY_ROOT` | `<data>/library` | The Songs folder the app manages |
| `CHM_DATA_DIR` | `./data` | App state (config, playlists) |
| `CHM_QUARANTINE_DIR` | `<data>/quarantine` | Where the duplicate finder moves charts out to |
| `CHM_PORT` / `CHM_HOST` | `8300` / `0.0.0.0` | Listen address |
| `CHM_STATIC_DIR` | bundled renderer | Override the served SPA build |
| `CHM_SEVENZIP_PATH` | `7z` | 7-Zip binary |
| `CHM_ONYX_PATH` | bundled AppImage extract | Onyx binary for CON conversion |

All documented in [`server/.env.example`](server/.env.example).

## Development

```sh
# API server against a local library (defaults to port 3000 in dev)
cd server && npm install
CHM_LIBRARY_ROOT=~/fixture/Songs CHM_DATA_DIR=/tmp/chm-data npm run dev

# Web renderer (the server serves app/out/renderer)
cd app && npm install && npm run build

# Security test suite (path containment — with no auth, this is the
# app's entire protection layer; keep it green)
cd server && npm test
```

### How the port works

The port hangs on one seam: upstream's preload exposed a single typed `api`
object (`window.api`) and the renderer touches nothing else. The web build
swaps that object for a `fetch` shim
([`app/src/renderer/src/web-api.ts`](app/src/renderer/src/web-api.ts)); the
server re-hosts the **unmodified** core modules (mirrored by
[`server/scripts/sync-core.mjs`](server/scripts/sync-core.mjs), with a fake
`electron` package supplying the few APIs they import) behind
`POST /api/<channel>` routes plus one SSE stream (`/api/events`) for job
progress. Details:

- [`docs/port/plan.md`](docs/port/plan.md) — the phased port plan
- [`docs/port/api-inventory.md`](docs/port/api-inventory.md) — every IPC method and its fate
- [`docs/port/onyx.md`](docs/port/onyx.md) — Onyx-on-Linux notes

## Related projects

**[Clone Hero Chart Studio](https://github.com/xlzipx/clone-hero-chart-studio)**
— a chart editor by the same upstream author. If Chart Manager is how you
find and organise charts, Chart Studio is how you make them.

## License

The app's own code (`app/`, `server/`) is licensed under the **MIT** license —
see [LICENSE](LICENSE).

The container image downloads and invokes separate programs with their own
licenses at build time (**Onyx** — GPLv3, from
[its releases](https://github.com/mtolly/onyx/releases); **7-Zip** — LGPL,
from Debian; **parse-sng** — MIT). They are invoked as external tools, not
linked or vendored into this repository. See
[THIRD-PARTY.txt](THIRD-PARTY.txt).
