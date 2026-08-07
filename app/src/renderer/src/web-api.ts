// The app's `window.api` implementation (installed by main.web.tsx). Started
// life as the browser-side counterpart to the Electron preload; since the
// fork went web-only it is the only implementation of `RendererApi`, and the
// `delete`-classified methods (docs/port/api-inventory.md) were removed from
// the interface together with their Electron-only callers.
//
// Classification source of truth: docs/port/api-inventory.md (Phase 1) plus
// the Phase 2/3 facts confirming `dialog:chooseDir` and `lib:moveOut` ship as
// real `http` routes (40 total) and `jobs:update` as the one real SSE event.
//
// - `http` methods  → POST /api/<channel> with { args: [...] }, unwrap
//   { result } / throw on { error }.
// - `onJobUpdate`   → shared EventSource('/api/events'), subscribes to the
//   `jobs:update` event, fans out to registered callbacks.
// - `platform` → `'web'` (see note below).

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
  SortKey
} from '../../shared/types'

/** POST /api/<channel> with the original IPC argument order, JSON body {args}. */
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

  // `openExternal` was classified `delete` in the inventory, but only because
  // its Electron implementation (`shell.openExternal`) has no server-side
  // meaning — the feature itself (open a manual-download page in a new tab)
  // is trivially portable client-side, so it kept a real, if tiny,
  // implementation ("manual host" download links depend on it).
  openExternal: (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  },

  appVersion: () => callHttp<string>('app:version', []),
  // Settings volá setUiScale při ±/Reset/Cancel a App.tsx při Escape —
  // reject tu házel unhandled rejection při běžném ovládání Nastavení.
  // Na webu škálu řeší zoom prohlížeče; no-op resolve místo výjimky.
  setUiScale: (_scale: number) => Promise.resolve(),
  getReleaseNotes: (version?: string) =>
    callHttp<ReleaseNotes | null>('app:releaseNotes', [version]),
  getReleaseNotesSince: (since?: string, max?: number) =>
    callHttp<ReleaseNotes[]>('app:releaseNotesSince', [since, max])
}
