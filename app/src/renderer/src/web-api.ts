// Web build's implementation of `window.api` — the browser-side counterpart
// to `app/src/preload/index.ts`. Same method-name surface, same TypeScript
// types (`RendererApi`), so renderer source (App.tsx, store.ts, components/*)
// needs zero changes to run against this instead of the Electron preload.
//
// Classification source of truth: docs/port/api-inventory.md (Phase 1) plus
// the Phase 2/3 facts confirming `dialog:chooseDir` and `lib:moveOut` ship as
// real `http` routes (40 total) and `jobs:update` as the one real SSE event.
//
// - `http` methods  → POST /api/<channel> with { args: [...] }, unwrap
//   { result } / throw on { error }.
// - `onJobUpdate`   → shared EventSource('/api/events'), subscribes to the
//   `jobs:update` event, fans out to registered callbacks.
// - other `on*` streams (game/update/hotkey/maximize — all `delete`) → no-op
//   subscribe so mounting components don't crash; returns a matching
//   unsubscribe function.
// - `delete`-classified invoke/send methods → throw `<name>: removed in web
//   port`, except `openExternal`, which has a trivial, fully-portable client
//   implementation (`window.open`) and would be a pointless regression to
//   stub out — see the note on it below.
// - `platform` → `'web'` (see note below).
// - `getDroppedFilePath` → throws (manual-install feature is deleted).

import type {
  AppConfig,
  Database,
  DownloadJob,
  DupGroup,
  FilterOptions,
  LibListing,
  LibSongInfo,
  PlaylistAddResult,
  PlaylistInfo,
  PlaylistResolveResult,
  PlaylistSong,
  PreviewResult,
  RendererApi,
  ReleaseNotes,
  RhythmVerseSystem,
  SearchFilters,
  SearchResponse,
  SongAudio,
  SongDetail,
  SongMeta,
  SongResult,
  SortDir,
  SortKey,
  UpdateCheckResult
} from '../../shared/types'

/** POST /api/<channel> with the preload's argument order, JSON body {args}. */
async function callHttp<T>(channel: string, args: unknown[]): Promise<T> {
  const res = await fetch(`/api/${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args })
  })
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new Error(`${channel}: invalid server response (HTTP ${res.status})`)
  }
  const body = (json ?? {}) as { result?: T; error?: { message?: string } }
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `${channel}: request failed (HTTP ${res.status})`)
  }
  return body.result as T
}

/** Permanent stub for a channel classified `delete` in the API inventory. */
function removed(name: string): never {
  throw new Error(`${name}: removed in web port`)
}

// ---- jobs:update over SSE — single shared EventSource for the whole tab ----
let jobsEventSource: EventSource | null = null
const jobUpdateListeners = new Set<(job: DownloadJob) => void>()

function ensureJobsStream(): void {
  if (jobsEventSource) return
  jobsEventSource = new EventSource('/api/events')
  jobsEventSource.addEventListener('jobs:update', (evt) => {
    try {
      const job = JSON.parse((evt as MessageEvent<string>).data) as DownloadJob
      jobUpdateListeners.forEach((cb) => cb(job))
    } catch {
      // Malformed/heartbeat event — ignore, don't take down the stream.
    }
  })
  // Reconnects are handled by the browser's native EventSource retry; job
  // state is idempotent (full DownloadJob per event), so no replay/backfill
  // is needed here — callers that want a fresh snapshot after a reconnect
  // can re-call getJobs() (see App.tsx's existing getJobs().then(...) seed).
}

export const webApi: RendererApi = {
  // `platform` only feeds renderer/src/platform.ts's IS_MAC/IS_WIN, which
  // gate the frameless-titlebar mac/Windows tweaks — a feature that doesn't
  // exist in a browser tab. 'web' makes both false, i.e. the plainest
  // (non-mac, non-Windows) UI branch, which is the closest match to a real
  // browser tab. Cast is intentional: RendererApi types this as
  // NodeJS.Platform to match the preload exactly; 'web' is not one of
  // Node's platform strings.
  platform: 'web' as unknown as NodeJS.Platform,

  search: (
    text: string,
    page: number,
    records: number,
    system?: RhythmVerseSystem,
    database?: Database,
    filters?: SearchFilters,
    sort?: SortKey,
    sortDir?: SortDir
  ) =>
    callHttp<SearchResponse>('search', [
      text,
      page,
      records,
      system,
      database,
      filters,
      sort,
      sortDir
    ]),
  getFilterOptions: (system?: RhythmVerseSystem) =>
    callHttp<FilterOptions>('search:filterOptions', [system]),

  resolvePlaylist: (url: string) => callHttp<PlaylistResolveResult>('playlist:resolve', [url]),

  enqueueDownload: (song: SongResult, targetSubfolder?: string) =>
    callHttp<string>('jobs:enqueue', [song, targetSubfolder]),

  // Manual-install pipeline — deleted (plan: no manual install/upload flow).
  enqueueLocalFile: (_localPath: string, _song: SongResult, _targetSubfolder?: string) =>
    Promise.reject(new Error('enqueueLocalFile: removed in web port')),
  enqueueLocalBatch: (_paths: string[], _targetSubfolder?: string) =>
    Promise.reject(new Error('enqueueLocalBatch: removed in web port')),

  listSongFolders: () => callHttp<string[]>('library:listFolders', []),
  ownedSongKeys: () => callHttp<string[]>('library:ownedKeys', []),
  ownedFolders: (artist: string, title: string) =>
    callHttp<string[]>('library:ownedFolders', [artist, title]),

  libList: (rel: string) => callHttp<LibListing>('lib:list', [rel]),
  libFolderCounts: (rel: string) =>
    callHttp<Record<string, number>>('lib:folderCounts', [rel]),
  libCreateFolder: (rel: string, name: string) =>
    callHttp<void>('lib:createFolder', [rel, name]),
  libRename: (relItem: string, newName: string) =>
    callHttp<void>('lib:rename', [relItem, newName]),
  libTrash: (relItem: string) => callHttp<void>('lib:trash', [relItem]),
  libMoveOut: (relItems: string[], destAbsDir: string) =>
    callHttp<void>('lib:moveOut', [relItems, destAbsDir]),
  libMove: (src: string, destDir: string) => callHttp<void>('lib:move', [src, destDir]),
  libCopy: (src: string, destDir: string) => callHttp<void>('lib:copy', [src, destDir]),
  // Native file-manager openers — no server-side equivalent.
  libOpen: (_rel: string) => removed('libOpen'),
  libReveal: (_relItem: string) => removed('libReveal'),
  libReadMeta: (relItem: string) => callHttp<SongMeta>('lib:readMeta', [relItem]),
  libWriteMeta: (relItem: string, fields: SongMeta) =>
    callHttp<void>('lib:writeMeta', [relItem, fields]),
  libSongInfo: (rels: string[]) => callHttp<LibSongInfo[]>('lib:songInfo', [rels]),
  libSongDetail: (rel: string) => callHttp<SongDetail>('lib:songDetail', [rel]),
  libFindDuplicates: (scope?: string[]) => callHttp<DupGroup[]>('lib:findDuplicates', [scope]),
  libListPlaylists: () => callHttp<PlaylistInfo[]>('lib:listPlaylists', []),
  libAddToPlaylist: (name: string, relItems: string[]) =>
    callHttp<PlaylistAddResult>('lib:addToPlaylist', [name, relItems]),
  libDeletePlaylist: (name: string) => callHttp<void>('lib:deletePlaylist', [name]),
  libRenamePlaylist: (oldName: string, newName: string) =>
    callHttp<void>('lib:renamePlaylist', [oldName, newName]),
  libPlaylistSongs: (name: string) => callHttp<PlaylistSong[]>('lib:playlistSongs', [name]),
  libRemoveFromPlaylist: (name: string, hashes: string[]) =>
    callHttp<void>('lib:removeFromPlaylist', [name, hashes]),

  getJobs: () => callHttp<DownloadJob[]>('jobs:getAll', []),
  clearFinishedJobs: () => callHttp<void>('jobs:clearFinished', []),
  cancelJob: (id: string) => callHttp<void>('jobs:cancel', [id]),
  cancelAllJobs: () => callHttp<void>('jobs:cancelAll', []),

  onJobUpdate: (cb: (job: DownloadJob) => void) => {
    ensureJobsStream()
    jobUpdateListeners.add(cb)
    return () => jobUpdateListeners.delete(cb)
  },

  getConfig: () => callHttp<AppConfig>('config:get', []),
  setConfig: (patch: Partial<AppConfig>) => callHttp<AppConfig>('config:set', [patch]),
  songsDirExists: () => callHttp<boolean>('config:songsDirExists', []),

  chooseDirectory: (defaultPath?: string) =>
    callHttp<string | null>('dialog:chooseDir', [defaultPath]),

  // Manual-install (drag/drop + native file picker) — out of scope per plan.
  getDroppedFilePath: (_file: File): string | null => removed('getDroppedFilePath'),
  chooseSongFile: () =>
    Promise.reject(new Error('chooseSongFile: removed in web port')) as Promise<{
      path: string
      name: string
    } | null>,

  peekFileMeta: (_path: string) =>
    Promise.reject(new Error('peekFileMeta: removed in web port')) as Promise<{
      artist: string
      title: string
    } | null>,

  resolveUrl: (url: string) => callHttp<string>('url:resolve', [url]),

  preview: async (artist: string, title: string) => {
    // The server sends the 30s clip base64-encoded (`dataB64`) because
    // ArrayBuffer doesn't survive JSON; restore the PreviewResult contract.
    const res = await callHttp<PreviewResult & { dataB64?: string }>('preview:get', [
      artist,
      title
    ])
    if (!res.dataB64) return res
    const { dataB64, ...rest } = res
    const bytes = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0))
    return { ...rest, data: bytes.buffer }
  },
  songAudio: (rel: string) => callHttp<SongAudio>('preview:songAudio', [rel]),

  // ---- Desktop game-detection / launch — no server-side meaning, deleted ----
  runningGame: () =>
    Promise.reject(new Error('runningGame: removed in web port')) as Promise<
      'clone-hero' | 'yarg' | null
    >,
  bringGameToFront: (_prefer?: 'clone-hero' | 'yarg') =>
    Promise.reject(new Error('bringGameToFront: removed in web port')) as Promise<
      { ok: true; game?: 'clone-hero' | 'yarg' } | { ok: false; error: string }
    >,
  chExeStatus: () =>
    Promise.reject(new Error('chExeStatus: removed in web port')) as Promise<{
      path: string | null
      autoDetected: boolean
    }>,
  yargExeStatus: () =>
    Promise.reject(new Error('yargExeStatus: removed in web port')) as Promise<{
      path: string | null
      autoDetected: boolean
    }>,
  chooseExeFile: () =>
    Promise.reject(new Error('chooseExeFile: removed in web port')) as Promise<string | null>,
  onGameStatus: (_cb: (game: 'clone-hero' | 'yarg' | null) => void) => () => {},

  // ---- Window-chrome (frameless titlebar) — no BrowserWindow in a tab ----
  hideOverlay: () => removed('hideOverlay'),
  toggleMaximize: () => removed('toggleMaximize'),
  isMaximized: () => Promise.reject(new Error('isMaximized: removed in web port')),
  onMaximizeChange: (_cb: (max: boolean) => void) => () => {},
  quitApp: () => removed('quitApp'),
  pauseHotkeys: () => removed('pauseHotkeys'),
  resumeHotkeys: () => removed('resumeHotkeys'),
  onHotkey: (_cb: (action: string) => void) => () => {},

  // `openExternal` is classified `delete` in the inventory, but only because
  // its Electron implementation (`shell.openExternal`) has no server-side
  // meaning — the feature itself (open a manual-download page in a new tab)
  // is trivially portable client-side. Stubbing it to throw would silently
  // break "manual host" download links (App.tsx's openSongExternal / the
  // MEGA-Mediafire hint) for no reason, so it gets a real, if tiny,
  // implementation instead of a removal stub. Flagged here since it's the
  // one deliberate deviation from the blanket "delete → throw" rule.
  openExternal: (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  },

  // ---- electron-updater — updates ship as a new container image instead ----
  downloadUpdate: () =>
    Promise.reject(new Error('downloadUpdate: removed in web port')) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  installUpdate: () => Promise.reject(new Error('installUpdate: removed in web port')),
  onUpdateAvailable: () => () => {},
  onUpdateProgress: () => () => {},
  onUpdateDownloaded: () => () => {},

  appVersion: () => callHttp<string>('app:version', []),
  checkForUpdates: () =>
    Promise.reject(new Error('checkForUpdates: removed in web port')) as Promise<UpdateCheckResult>,
  setUiScale: (_scale: number) =>
    Promise.reject(new Error('setUiScale: removed in web port')) as Promise<void>,
  getReleaseNotes: (version?: string) =>
    callHttp<ReleaseNotes | null>('app:releaseNotes', [version]),
  getReleaseNotesSince: (since?: string, max?: number) =>
    callHttp<ReleaseNotes[]>('app:releaseNotesSince', [since, max])
}
