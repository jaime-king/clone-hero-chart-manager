// HTTP router — one POST route per `http`-classified channel in
// docs/port/api-inventory.md (38 rows + the 2 resolved ambiguities:
// dialog:chooseDir and lib:moveOut). `delete`-classified channels get no route.
//
// Contract: POST /api/<channel> (channel verbatim in the URL, e.g.
// POST /api/lib:list), JSON body { "args": [...] } in preload-argument order,
// JSON response { "result": ... } on success or { "error": { "message" } }
// with status 500 (400 for request-validation failures).
//
// Route-mapping note: Fastify/find-my-way treats ':' as a path-param marker, so
// routes are REGISTERED with the escaped literal '::' (lib:list → '/api/lib::list')
// but MATCH the verbatim URL '/api/lib:list'. Clients use the channel unchanged.
//
// Handlers are wired to the same core functions the ipcMain registrations in
// app/src/main/ipc.ts called; the few inline handler bodies there (search,
// config:set, url:resolve) are replicated below minus their Electron-only parts.

import type { FastifyInstance } from 'fastify'
import { existsSync, mkdirSync, statSync } from 'fs'
import { resolve, sep } from 'path'
import type {
  Database,
  RhythmVerseSystem,
  SearchFilters,
  SearchResponse,
  SongMeta,
  SongResult,
  SortDir,
  SortKey
} from './gen/shared/types'
import { asError } from './gen/shared/errors'
import { mergeBoth } from './gen/shared/songid'
import { getConfig, quarantineDir, setConfig } from './config'
import { search as searchEnchor } from './gen/main/core/enchor'
import { fetchFilterOptions, search as searchRhythmverse } from './gen/main/core/rhythmverse'
import { getPreview } from './gen/main/core/preview'
import { getSongAudio } from './gen/main/core/localaudio'
import { toHttpAudioUrl } from './audio'
import { jobManager } from './gen/main/core/jobs'
import { listSongFolders, ownedFolders, ownedSongKeys } from './gen/main/core/library'
import {
  libAddToPlaylist,
  libCopy,
  libCreateFolder,
  libDeletePlaylist,
  libFindDuplicates,
  libFolderCounts,
  libList,
  libListPlaylists,
  libMove,
  libMoveOut,
  libPlaylistSongs,
  libReadMeta,
  libRemoveFromPlaylist,
  libRename,
  libRenamePlaylist,
  libSongDetail,
  libSongInfo,
  libTrash,
  libWriteMeta
} from './gen/main/core/librarymgr'
import { resolveSpotifyPlaylist } from './gen/main/core/spotify'
import { getReleaseNotes, getReleaseNotesSince } from './gen/main/core/update'
import { serverVersion } from './version'

/** Error carrying an HTTP status (thrown by request validation). */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
  }
}

/**
 * lib:moveOut guard. destAbsDir arrives from the client; with no auth on this
 * server (LAN trust boundary), this containment check is the ONLY protection
 * against writing to arbitrary filesystem locations. The resolved destination
 * must be the quarantine root or inside it — anything else is a 400.
 */
function assertInsideQuarantine(destAbsDir: unknown): string {
  if (typeof destAbsDir !== 'string' || !destAbsDir) {
    throw new HttpError(400, 'destAbsDir must be a non-empty string')
  }
  const q = quarantineDir()
  const dest = resolve(destAbsDir)
  if (dest !== q && !dest.startsWith(q + sep)) {
    throw new HttpError(400, `Destination must be inside the quarantine directory (${q})`)
  }
  // Quarantine root is created on demand; subfolders inside it must exist.
  if (dest === q && !existsSync(q)) mkdirSync(q, { recursive: true })
  return dest
}

/** Replicates the 'search' ipcMain handler (app/src/main/ipc.ts) verbatim. */
async function search(
  text: string,
  page: number,
  records: number,
  system?: RhythmVerseSystem,
  database?: Database,
  filters?: SearchFilters,
  sort?: SortKey,
  sortDir?: SortDir
): Promise<SearchResponse> {
  const db: Database = database ?? 'rhythmverse'
  if (db === 'enchor') {
    return searchEnchor(text, page, records, filters, sort, sortDir)
  }
  if (db === 'both') {
    // Genre/year/length filters are server-side only on RhythmVerse — with any
    // active, Encore would leak an unfiltered catalog into the merged results.
    const rvOnlyFilter = !!(
      filters?.genre?.length ||
      filters?.year?.length ||
      filters?.decade?.length ||
      filters?.songLength?.length
    )
    if (rvOnlyFilter) {
      return searchRhythmverse(text, page, records, system ?? 'ch', filters, sort, sortDir)
    }
    const [rv, en] = await Promise.allSettled([
      searchRhythmverse(text, page, records, system ?? 'ch', filters, sort, sortDir),
      searchEnchor(text, page, records, filters, sort, sortDir)
    ])
    if (rv.status === 'rejected' && en.status === 'rejected') {
      throw asError(rv.reason)
    }
    const rvSongs = rv.status === 'fulfilled' ? rv.value.songs : []
    const enSongs = en.status === 'fulfilled' ? en.value.songs : []
    const merged = mergeBoth(rvSongs, enSongs, sort)
    const rvTotal = rv.status === 'fulfilled' ? rv.value.totalFiltered : 0
    const enTotal = en.status === 'fulfilled' ? en.value.totalFiltered : 0
    return {
      songs: merged,
      totalFiltered: Math.max(rvTotal, enTotal),
      resultCount: rvTotal + enTotal,
      page,
      records
    }
  }
  return searchRhythmverse(text, page, records, system ?? 'ch', filters, sort, sortDir)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => unknown

/**
 * channel → handler, argument order identical to the preload methods.
 * Mechanically generated from api-inventory.md Table 1 (`http` rows only).
 */
const handlers: Record<string, Handler> = {
  // ── Search / catalog ────────────────────────────────────────────────
  search: (text, page, records, system, database, filters, sort, sortDir) =>
    search(text, page, records, system, database, filters, sort, sortDir),
  'search:filterOptions': (system?: RhythmVerseSystem) => fetchFilterOptions(system ?? 'ch'),
  'playlist:resolve': (url: string) => resolveSpotifyPlaylist(url),
  'url:resolve': async (url: string) => {
    try {
      const { expandShortlink } = await import('./gen/main/core/download')
      return expandShortlink(url)
    } catch {
      return url
    }
  },

  // ── Preview ─────────────────────────────────────────────────────────
  'preview:get': (artist: string, title: string) => getPreview(artist, title),
  // getSongAudio (core/localaudio.ts) returns track URLs shaped for Electron's
  // chm-audio:// protocol; rewrite them to the Phase 5 HTTP Range endpoint
  // (server/src/audio.ts) here at the route layer, not in core or the
  // renderer, so the core module stays byte-identical for Electron.
  'preview:songAudio': async (rel: string) => {
    const audio = await getSongAudio(rel)
    return {
      ...audio,
      tracks: audio.tracks.map((t) => ({ ...t, url: toHttpAudioUrl(t.url) }))
    }
  },

  // ── Jobs ────────────────────────────────────────────────────────────
  'jobs:enqueue': (song: SongResult, targetSubfolder?: string) =>
    jobManager.enqueue(song, targetSubfolder),
  'jobs:getAll': () => jobManager.getAll(),
  'jobs:clearFinished': () => jobManager.clearFinished(),
  'jobs:cancel': (id: string) => jobManager.cancel(id),
  'jobs:cancelAll': () => jobManager.cancelAll(),

  // ── Library (owned index) ───────────────────────────────────────────
  'library:listFolders': () => listSongFolders(),
  'library:ownedKeys': () => ownedSongKeys(),
  'library:ownedFolders': (artist: string, title: string) => ownedFolders(artist, title),

  // ── Library manager ─────────────────────────────────────────────────
  'lib:list': (rel: string) => libList(rel),
  'lib:folderCounts': (rel: string) => libFolderCounts(rel),
  'lib:createFolder': (rel: string, name: string) => libCreateFolder(rel, name),
  'lib:rename': (relItem: string, newName: string) => libRename(relItem, newName),
  'lib:trash': (relItem: string) => libTrash(relItem),
  'lib:moveOut': (relItems: string[], destAbsDir: string) =>
    libMoveOut(relItems, assertInsideQuarantine(destAbsDir)),
  'lib:move': (src: string, destDir: string) => libMove(src, destDir),
  'lib:copy': (src: string, destDir: string) => libCopy(src, destDir),
  'lib:readMeta': (relItem: string) => libReadMeta(relItem),
  'lib:writeMeta': (relItem: string, fields: SongMeta) => libWriteMeta(relItem, fields),
  'lib:songInfo': (rels: string[]) => libSongInfo(rels),
  'lib:songDetail': (rel: string) => libSongDetail(rel),
  'lib:findDuplicates': (scope?: string[]) =>
    libFindDuplicates(Array.isArray(scope) ? scope : undefined),
  'lib:listPlaylists': () => libListPlaylists(),
  'lib:addToPlaylist': (name: string, relItems: string[]) => libAddToPlaylist(name, relItems),
  'lib:deletePlaylist': (name: string) => libDeletePlaylist(name),
  'lib:renamePlaylist': (oldName: string, newName: string) => libRenamePlaylist(oldName, newName),
  'lib:playlistSongs': (name: string) => libPlaylistSongs(name),
  'lib:removeFromPlaylist': (name: string, hashes: string[]) =>
    libRemoveFromPlaylist(name, hashes),

  // ── Config ──────────────────────────────────────────────────────────
  'config:get': () => getConfig(),
  'config:songsDirExists': () => existsSync(getConfig().songsDir),
  // ipc.ts also re-registered hotkeys / applied UI zoom here (Electron-only)
  // and invalidated indexes on a songsDir change — songsDir is pinned to
  // CHM_LIBRARY_ROOT server-side, so it can never change via this route.
  'config:set': (patch) => setConfig(patch),

  // Resolved ambiguity (Phase 2 brief): no dialog opens — returns the
  // configured quarantine directory, created on demand, so the
  // DuplicatesModal quarantine flow works with zero renderer changes.
  'dialog:chooseDir': (_defaultPath?: string) => {
    const q = quarantineDir()
    mkdirSync(q, { recursive: true })
    return q
  },

  // ── App meta ────────────────────────────────────────────────────────
  'app:version': () => serverVersion(),
  'app:releaseNotes': (version?: string) => getReleaseNotes(version),
  'app:releaseNotesSince': (since?: string, max?: number) => getReleaseNotesSince(since, max)
}

export function registerRoutes(app: FastifyInstance): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    // '::' = find-my-way escape for a literal ':' — the URL stays verbatim.
    const path = `/api/${channel.replace(/:/g, '::')}`
    app.post(path, async (req, reply) => {
      const body = (req.body ?? {}) as { args?: unknown[] }
      const args = Array.isArray(body.args) ? body.args : []
      try {
        const result = await handler(...args)
        return { result: result === undefined ? null : result }
      } catch (err) {
        const status = err instanceof HttpError ? err.statusCode : 500
        reply.code(status)
        return { error: { message: asError(err).message } }
      }
    })
  }
}
