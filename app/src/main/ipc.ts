// IPC handlery mezi main a renderer procesem.

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import type {
  Database,
  FilterOptions,
  RhythmVerseSystem,
  SearchFilters,
  SearchResponse,
  SongResult,
  SortDir,
  SortKey
} from '../shared/types'
import { getConfig, setConfig } from './core/config'
import { search as searchEnchor } from './core/enchor'
import { peekFileMeta } from './core/filemeta'
import { jobManager } from './core/jobs'
import { invalidateOwnedIndex, listSongFolders, ownedFolders, ownedSongKeys } from './core/library'
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
  libOpen,
  libPlaylistSongs,
  libReadMeta,
  libRemoveFromPlaylist,
  libSongDetail,
  libSongInfo,
  libRename,
  libRenamePlaylist,
  libReveal,
  libTrash,
  libWriteMeta
} from './core/librarymgr'
import { mergeBoth } from '../shared/songid'
import { asError } from '../shared/errors'
import type { SongMeta } from '../shared/types'
import { invalidateLibraryIndex } from './core/playlists'
import { getPreview } from './core/preview'
import { getSongAudio } from './core/localaudio'
import { fetchFilterOptions, search as searchRhythmverse } from './core/rhythmverse'
import { resolveSpotifyPlaylist } from './core/spotify'
import { getReleaseNotes, getReleaseNotesSince } from './core/update'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { applyUiScale, getOverlay, hideOverlay, isMaximized, toggleMaximize } from './overlay'

let ipcRegistered = false

export function registerIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true
  ipcMain.handle(
    'search',
    async (
      _e,
      text: string,
      page: number,
      records: number,
      system?: RhythmVerseSystem,
      database?: Database,
      filters?: SearchFilters,
      sort?: SortKey,
      sortDir?: SortDir
    ): Promise<SearchResponse> => {
      const db: Database = database ?? 'rhythmverse'
      if (db === 'enchor') {
        return searchEnchor(text, page, records, filters, sort, sortDir)
      }
      if (db === 'both') {
        // Žánr / rok / délku umí serverově jen RhythmVerse. Když je některý
        // aktivní, Encore by vrátil NEfiltrovaný katalog a „prosákl" do výsledků
        // (a nafoukl by total) → v tom případě procházej jen RhythmVerse.
        const rvOnlyFilter = !!(
          filters?.genre?.length ||
          filters?.year?.length ||
          filters?.decade?.length ||
          filters?.songLength?.length
        )
        if (rvOnlyFilter) {
          return searchRhythmverse(text, page, records, system ?? 'ch', filters, sort, sortDir)
        }
        // Spojený režim: stáhne první stránku z obou a dedupuje.
        const [rv, en] = await Promise.allSettled([
          searchRhythmverse(text, page, records, system ?? 'ch', filters, sort, sortDir),
          searchEnchor(text, page, records, filters, sort, sortDir)
        ])
        // Spadly-li OBĚ, propaguj chybu (jinak by prázdný „success" ukázal
        // „Nothing found" místo chybové hlášky jako u jednotlivých databází).
        if (rv.status === 'rejected' && en.status === 'rejected') {
          throw asError(rv.reason)
        }
        const rvSongs = rv.status === 'fulfilled' ? rv.value.songs : []
        const enSongs = en.status === 'fulfilled' ? en.value.songs : []
        // Sloučení + dedup + pořadí sdílíme s rendererem (hluboká „Both" ve store),
        // ať mělké a hluboké stránky řadí identicky — viz `mergeBoth`.
        const merged = mergeBoth(rvSongs, enSongs, sort)
        // „Both" posouvá obě DB po stránkách v ZÁKRYTU (stránka P = RV[P]+Encore[P]),
        // takže STRÁNEK je tolik, co má delší katalog — NE součet obou (ten by
        // nafoukl pager o prázdné zadní stránky a rozbil losování „Surprise me").
        // Základ stránkování = max. Ale do LABELU patří SOUČET = kolik chartů je
        // dohromady k procházení (každá stránka ukazuje obě DB), jinak by Both
        // vypadal stejně jako samotný Encore.
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
  )

  // Volby filtrů pro advanced panel (žánry/dekády/roky/délky z RhythmVerse číselníku).
  ipcMain.handle(
    'search:filterOptions',
    (_e, system?: RhythmVerseSystem): Promise<FilterOptions> =>
      fetchFilterOptions(system ?? 'ch')
  )

  // 30s zvuková ukázka (poslech před stažením) — spáruje se v main procesu.
  ipcMain.handle('preview:get', (_e, artist: string, title: string) => getPreview(artist, title))
  // Cestu si `getSongAudio` sám ověří proti složce knihovny (renderer jí nesmí věřit).
  ipcMain.handle('preview:songAudio', (_e, rel: string) => getSongAudio(rel))

  ipcMain.handle('jobs:enqueue', (_e, song: SongResult, targetSubfolder?: string) =>
    jobManager.enqueue(song, targetSubfolder)
  )
  ipcMain.handle(
    'jobs:enqueueLocal',
    (_e, localPath: string, song: SongResult, targetSubfolder?: string) =>
      jobManager.enqueueLocal(localPath, song, targetSubfolder)
  )
  ipcMain.handle(
    'jobs:enqueueLocalBatch',
    (_e, paths: string[], targetSubfolder?: string) =>
      jobManager.enqueueLocalBatch(paths, targetSubfolder)
  )
  ipcMain.handle('jobs:getAll', () => jobManager.getAll())
  ipcMain.handle('jobs:clearFinished', () => jobManager.clearFinished())
  ipcMain.handle('jobs:cancel', (_e, id: string) => jobManager.cancel(id))
  ipcMain.handle('jobs:cancelAll', () => jobManager.cancelAll())
  ipcMain.handle('library:listFolders', () => listSongFolders())
  ipcMain.handle('library:ownedKeys', () => ownedSongKeys())
  ipcMain.handle('library:ownedFolders', (_e, artist: string, title: string) =>
    ownedFolders(artist, title)
  )

  // Správce knihovny
  ipcMain.handle('lib:list', (_e, rel: string) => libList(rel))
  ipcMain.handle('lib:folderCounts', (_e, rel: string) => libFolderCounts(rel))
  ipcMain.handle('lib:createFolder', (_e, rel: string, name: string) => libCreateFolder(rel, name))
  ipcMain.handle('lib:rename', (_e, relItem: string, newName: string) =>
    libRename(relItem, newName)
  )
  ipcMain.handle('lib:trash', (_e, relItem: string) => libTrash(relItem))
  ipcMain.handle('lib:moveOut', (_e, relItems: string[], destAbsDir: string) =>
    libMoveOut(relItems, destAbsDir)
  )
  ipcMain.handle('lib:move', (_e, src: string, destDir: string) => libMove(src, destDir))
  ipcMain.handle('lib:copy', (_e, src: string, destDir: string) => libCopy(src, destDir))
  ipcMain.on('lib:open', (_e, rel: string) => libOpen(rel))
  ipcMain.on('lib:reveal', (_e, relItem: string) => libReveal(relItem))
  ipcMain.handle('lib:readMeta', (_e, relItem: string) => libReadMeta(relItem))
  ipcMain.handle('lib:writeMeta', (_e, relItem: string, fields: SongMeta) =>
    libWriteMeta(relItem, fields)
  )
  ipcMain.handle('lib:songInfo', (_e, rels: string[]) => libSongInfo(rels))
  ipcMain.handle('lib:songDetail', (_e, rel: string) => libSongDetail(rel))
  ipcMain.handle('lib:findDuplicates', (_e, scope?: string[]) =>
    libFindDuplicates(Array.isArray(scope) ? scope : undefined)
  )
  ipcMain.handle('lib:listPlaylists', () => libListPlaylists())
  ipcMain.handle('lib:addToPlaylist', (_e, name: string, relItems: string[]) =>
    libAddToPlaylist(name, relItems)
  )
  ipcMain.handle('lib:deletePlaylist', (_e, name: string) => libDeletePlaylist(name))
  ipcMain.handle('lib:renamePlaylist', (_e, oldName: string, newName: string) =>
    libRenamePlaylist(oldName, newName)
  )
  ipcMain.handle('lib:playlistSongs', (_e, name: string) => libPlaylistSongs(name))
  ipcMain.handle('lib:removeFromPlaylist', (_e, name: string, hashes: string[]) =>
    libRemoveFromPlaylist(name, hashes)
  )

  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('config:songsDirExists', () => existsSync(getConfig().songsDir))
  ipcMain.handle('config:set', (_e, patch) => {
    const prevSongsDir = getConfig().songsDir
    const next = setConfig(patch)
    registerHotkeys() // hotkeys se mohly změnit
    applyUiScale(next.uiScale) // sjednoť zoom s uloženou hodnotou
    if (next.songsDir !== prevSongsDir) {
      // Jiná knihovna → starý index i „už mám" cache neplatí (jinak by se
      // relativní cesty odhalovaly proti novému kořenu = špatná složka).
      invalidateLibraryIndex()
      invalidateOwnedIndex()
    }
    return next
  })
  // Živý náhled UI scale (bez zápisu na disk) — Nastavení volá při posouvání.
  ipcMain.handle('ui:scale', (_e, scale: number) => applyUiScale(scale))

  ipcMain.handle('dialog:chooseDir', async (_e, defaultPath?: string) => {
    const win = getOverlay() ?? undefined
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      properties: ['openDirectory'],
      // Předvyplň naposledy použitou složku (např. karanténa duplicit).
      ...(defaultPath && existsSync(defaultPath) ? { defaultPath } : {})
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  ipcMain.handle('dialog:chooseSongFile', async () => {
    const win = getOverlay() ?? undefined
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Select a chart file to install',
      properties: ['openFile'],
      filters: [
        {
          name: 'Charts & archives',
          extensions: ['zip', 'rar', '7z', 'sng', 'rb3con', 'con']
        },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    const name = path.split(/[\\/]/).pop() || path
    return { path, name }
  })

  ipcMain.handle('file:peekMeta', (_e, path: string) => peekFileMeta(path))

  // Rozbalí bit.ly/tinyurl/… shortlink na finální URL — slouží jen pro UI label
  // (renderer pak rozpozná, jestli míří na MEGA / Mediafire / …).
  ipcMain.handle('url:resolve', async (_e, url: string): Promise<string> => {
    try {
      const { expandShortlink } = await import('./core/download')
      return expandShortlink(url)
    } catch {
      return url
    }
  })

  // Import playlistu (v1: veřejný Spotify přes embed, bez API klíče).
  ipcMain.handle('playlist:resolve', (_e, url: string) => resolveSpotifyPlaylist(url))

  ipcMain.on('overlay:hide', () => hideOverlay())
  ipcMain.on('overlay:toggleMaximize', () => toggleMaximize())
  ipcMain.handle('overlay:isMaximized', () => isMaximized())
  ipcMain.on('app:quit', () => app.quit())
  ipcMain.on('hotkeys:pause', () => unregisterHotkeys())
  ipcMain.on('hotkeys:resume', () => registerHotkeys())
  ipcMain.on('shell:openExternal', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url)
  })
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:releaseNotes', (_e, version?: string) => getReleaseNotes(version))
  ipcMain.handle('app:releaseNotesSince', (_e, since?: string, max?: number) =>
    getReleaseNotesSince(since, max)
  )

  // Přeposílání průběhu úloh do renderer procesu.
  jobManager.on('update', (job) => {
    getOverlay()?.webContents.send('jobs:update', job)
  })
}
