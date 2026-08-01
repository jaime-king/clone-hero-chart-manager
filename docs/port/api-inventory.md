# API inventory — Phase 1

Read-only survey of `app/src/preload/index.ts` (the `api` object) against every
`ipcMain.handle`/`ipcMain.on` registration in `app/src/main/**`. Source of truth for
Phases 2–5. Method names/types are exactly as declared in the preload; do not
rename anything here without updating the preload contract itself (guardrail 3).

## Table 1 — preload methods

Legend: **http** = `POST /api/<channel>`. **sse** = server-push, part of the
`GET /api/events` bus. **delete** = desktop-only or explicitly out of scope,
deleted not rewritten. **`?`** suffix = genuinely ambiguous, see the note.

| # | Preload method | Channel | Kind | Args | Return | Handler (file:line) | Class |
|---|---|---|---|---|---|---|---|
| 1 | `platform` | — (plain value, `process.platform`) | other | — | `NodeJS.Platform` | preload/index.ts:33 | delete — only consumed by `renderer/src/platform.ts` (`IS_MAC`/`IS_WIN`) to lay out the custom frameless titlebar; that whole feature (`toggleMaximize`/`isMaximized`/`quitApp`) is deleted |
| 2 | `search` | `search` | invoke | `text, page, records, system?, database?, filters?, sort?, sortDir?` | `Promise<SearchResponse>` | main/ipc.ts:69-132 | http |
| 3 | `getFilterOptions` | `search:filterOptions` | invoke | `system?` | `Promise<FilterOptions>` | main/ipc.ts:135-139 | http |
| 4 | `resolvePlaylist` | `playlist:resolve` | invoke | `url` | `Promise<PlaylistResolveResult>` | main/ipc.ts:294 | http |
| 5 | `enqueueDownload` | `jobs:enqueue` | invoke | `song, targetSubfolder?` | `Promise<string>` | main/ipc.ts:146-148 → core/jobs.ts:134-142 | http |
| 6 | `enqueueLocalFile` | `jobs:enqueueLocal` | invoke | `localPath, song, targetSubfolder?` | `Promise<string>` | main/ipc.ts:149-153 → core/jobs.ts:148-173 | delete — this is the manual-install pipeline: jobs.ts:144-147 comment says explicitly "soubor, který uživatel ručně stáhnul z MEGA/Mediafire… a chce nainstalovat" (a file the user manually downloaded and wants installed). Same out-of-scope feature as `getDroppedFilePath`/`chooseSongFile`, just not named in the guardrails — see Strays §3.1 |
| 7 | `enqueueLocalBatch` | `jobs:enqueueLocalBatch` | invoke | `paths, targetSubfolder?` | `Promise<string[]>` | main/ipc.ts:154-158 → core/jobs.ts:182-200 | delete — batch variant of #6, same reasoning |
| 8 | `listSongFolders` | `library:listFolders` | invoke | — | `Promise<string[]>` | main/ipc.ts:163 | http |
| 9 | `ownedSongKeys` | `library:ownedKeys` | invoke | — | `Promise<string[]>` | main/ipc.ts:164 | http |
| 10 | `ownedFolders` | `library:ownedFolders` | invoke | `artist, title` | `Promise<string[]>` | main/ipc.ts:165-167 | http |
| 11 | `libList` | `lib:list` | invoke | `rel` | `Promise<LibListing>` | main/ipc.ts:170 | http |
| 12 | `libFolderCounts` | `lib:folderCounts` | invoke | `rel` | `Promise<Record<string, number>>` | main/ipc.ts:171 | http |
| 13 | `libCreateFolder` | `lib:createFolder` | invoke | `rel, name` | `Promise<void>` | main/ipc.ts:172 | http |
| 14 | `libRename` | `lib:rename` | invoke | `relItem, newName` | `Promise<void>` | main/ipc.ts:173-175 | http |
| 15 | `libTrash` | `lib:trash` | invoke | `relItem` | `Promise<void>` | main/ipc.ts:176 → core/librarymgr.ts:184-190 (`shell.trashItem`) | http (behind the Phase 5 trash shim) |
| 16 | `libMoveOut` | `lib:moveOut` | invoke | `relItems, destAbsDir` | `Promise<void>` | main/ipc.ts:177-179 → core/librarymgr.ts:217-260 | delete? — `destAbsDir` is an arbitrary absolute path on the machine's filesystem, normally supplied via the `dialog:chooseDir` native picker (#40). No browser client can hand the server an arbitrary server-side path; this only makes sense if paired with a server-side directory-browse UI, which is a new feature, not a mechanical port |
| 17 | `libMove` | `lib:move` | invoke | `src, destDir` | `Promise<void>` | main/ipc.ts:180 | http |
| 18 | `libCopy` | `lib:copy` | invoke | `src, destDir` | `Promise<void>` | main/ipc.ts:181 | http |
| 19 | `libOpen` | `lib:open` | send | `rel` | `void` | main/ipc.ts:182 → core/librarymgr.ts:269-271 (`shell.openPath`) | delete — opens the item in the native OS file manager; no server equivalent. Not named in the guardrails' delete-category list — see Strays §3.2 |
| 20 | `libReveal` | `lib:reveal` | send | `relItem` | `void` | main/ipc.ts:183 → core/librarymgr.ts:273-275 (`shell.showItemInFolder`) | delete — reveals in Finder/Explorer; same reasoning as #19 |
| 21 | `libReadMeta` | `lib:readMeta` | invoke | `relItem` | `Promise<SongMeta>` | main/ipc.ts:184 | http |
| 22 | `libWriteMeta` | `lib:writeMeta` | invoke | `relItem, fields` | `Promise<void>` | main/ipc.ts:185-187 | http |
| 23 | `libSongInfo` | `lib:songInfo` | invoke | `rels` | `Promise<LibSongInfo[]>` | main/ipc.ts:188 | http |
| 24 | `libSongDetail` | `lib:songDetail` | invoke | `rel` | `Promise<SongDetail>` | main/ipc.ts:189 | http |
| 25 | `libFindDuplicates` | `lib:findDuplicates` | invoke | `scope?` | `Promise<DupGroup[]>` | main/ipc.ts:190-192 | http |
| 26 | `libListPlaylists` | `lib:listPlaylists` | invoke | — | `Promise<PlaylistInfo[]>` | main/ipc.ts:193 | http |
| 27 | `libAddToPlaylist` | `lib:addToPlaylist` | invoke | `name, relItems` | `Promise<PlaylistAddResult>` | main/ipc.ts:194-196 | http |
| 28 | `libDeletePlaylist` | `lib:deletePlaylist` | invoke | `name` | `Promise<void>` | main/ipc.ts:197 | http |
| 29 | `libRenamePlaylist` | `lib:renamePlaylist` | invoke | `oldName, newName` | `Promise<void>` | main/ipc.ts:198-200 | http |
| 30 | `libPlaylistSongs` | `lib:playlistSongs` | invoke | `name` | `Promise<PlaylistSong[]>` | main/ipc.ts:201 | http |
| 31 | `libRemoveFromPlaylist` | `lib:removeFromPlaylist` | invoke | `name, hashes` | `Promise<void>` | main/ipc.ts:202-204 | http |
| 32 | `getJobs` | `jobs:getAll` | invoke | — | `Promise<DownloadJob[]>` | main/ipc.ts:159 | http |
| 33 | `clearFinishedJobs` | `jobs:clearFinished` | invoke | — | `Promise<void>` | main/ipc.ts:160 | http |
| 34 | `cancelJob` | `jobs:cancel` | invoke | `id` | `Promise<void>` | main/ipc.ts:161 | http |
| 35 | `cancelAllJobs` | `jobs:cancelAll` | invoke | — | `Promise<void>` | main/ipc.ts:162 | http |
| 36 | `onJobUpdate` | `jobs:update` | on-stream | `cb: (job: DownloadJob) => void` | unsubscribe fn | emitted main/ipc.ts:312-314 (`jobManager.on('update', ...)` → `webContents.send`) | sse |
| 37 | `getConfig` | `config:get` | invoke | — | `Promise<AppConfig>` | main/ipc.ts:206 | http |
| 38 | `setConfig` | `config:set` | invoke | `patch` | `Promise<AppConfig>` | main/ipc.ts:208-220 | http |
| 39 | `songsDirExists` | `config:songsDirExists` | invoke | — | `Promise<boolean>` | main/ipc.ts:207 | http |
| 40 | `chooseDirectory` | `dialog:chooseDir` | invoke | `defaultPath?` | `Promise<string \| null>` | main/ipc.ts:224-232 (`dialog.showOpenDialog`) | delete? — native Electron folder-picker over the server's own filesystem; used today for (a) overriding `songsDir` in Settings — moot once `CHM_LIBRARY_ROOT` is the source of truth (plan §Phase 2), and (b) picking the duplicate-quarantine target in `DuplicatesModal.tsx` — a genuine feature need with no direct web equivalent |
| 41 | `getDroppedFilePath` | — (no IPC; `webUtils.getPathForFile` in preload only) | other | `file: File` | `string \| null` | preload/index.ts:137-143 (no main handler) | delete — named out of scope in the plan (manual install) |
| 42 | `chooseSongFile` | `dialog:chooseSongFile` | invoke | — | `Promise<{path,name}\|null>` | main/ipc.ts:234-251 | delete — named out of scope in the plan (manual install) |
| 43 | `peekFileMeta` | `file:peekMeta` | invoke | `path` | `Promise<{artist,title}\|null>` | main/ipc.ts:280 | delete — only caller is `renderer/src/store.ts:1248`, itself only reachable from the dropped/picked-file (manual install) flow being deleted |
| 44 | `resolveUrl` | `url:resolve` | invoke | `url` | `Promise<string>` | main/ipc.ts:284-291 | http |
| 45 | `preview` | `preview:get` | invoke | `artist, title` | `Promise<PreviewResult>` | main/ipc.ts:142 | http |
| 46 | `songAudio` | `preview:songAudio` | invoke | `rel` | `Promise<SongAudio>` | main/ipc.ts:144 | http (metadata call; actual audio bytes move to the Phase 5 `GET /api/audio` range endpoint) |
| 47 | `runningGame` | `game:running` | invoke | — | `Promise<'clone-hero'\|'yarg'\|null>` | main/ipc.ts:253 → core/gamedetect.ts | delete — desktop process detection, no server-side meaning — **removed 2026-08-02** |
| 48 | `bringGameToFront` | `game:bringToFront` | invoke | `prefer?` | `Promise<{ok,...}>` | main/ipc.ts:254-256 | delete — focuses a local desktop window — **removed 2026-08-02** |
| 49 | `chExeStatus` | `game:chExeStatus` | invoke | — | `Promise<{path,autoDetected}>` | main/ipc.ts:257 | delete — desktop exe-path detection — **removed 2026-08-02** |
| 50 | `yargExeStatus` | `game:yargExeStatus` | invoke | — | `Promise<{path,autoDetected}>` | main/ipc.ts:258 | delete — same — **removed 2026-08-02** |
| 51 | `chooseExeFile` | `dialog:chooseExe` | invoke | — | `Promise<string\|null>` | main/ipc.ts:260-278 | delete — picks the CH/YARG executable for the deleted game-launch feature — **removed 2026-08-02** |
| 52 | `onGameStatus` | `game:status` | on-stream | `cb: (game) => void` | unsubscribe fn | emitted main/ipc.ts:338 (`pollGameInner`) | delete — feeds the deleted game-detection feature, not a portable stream — **removed 2026-08-02** |
| 53 | `hideOverlay` | `overlay:hide` | send | — | `void` | main/ipc.ts:296 | delete — window control |
| 54 | `toggleMaximize` | `overlay:toggleMaximize` | send | — | `void` | main/ipc.ts:297 | delete — window control |
| 55 | `isMaximized` | `overlay:isMaximized` | invoke | — | `Promise<boolean>` | main/ipc.ts:298 | delete — window control |
| 56 | `onMaximizeChange` | `overlay:maximized` | on-stream | `cb: (max) => void` | unsubscribe fn | emitted main/overlay.ts:145-149 (`sendMax`) | delete — window-control stream |
| 57 | `quitApp` | `app:quit` | send | — | `void` | main/ipc.ts:299 | delete — desktop app lifecycle |
| 58 | `pauseHotkeys` | `hotkeys:pause` | send | — | `void` | main/ipc.ts:300 | delete — global hotkeys |
| 59 | `resumeHotkeys` | `hotkeys:resume` | send | — | `void` | main/ipc.ts:301 | delete — global hotkeys |
| 60 | `onHotkey` | `hotkey` | on-stream | `cb: (action) => void` | unsubscribe fn | emitter `sendHotkey()` main/hotkeys.ts:37-39 | delete — global-hotkey stream; also dead code today, see Strays §3.3 |
| 61 | `openExternal` | `shell:openExternal` | send | `url` | `void` | main/ipc.ts:302-304 (`shell.openExternal`) | delete — becomes a plain `<a target="_blank">` in the browser, no server round-trip needed |
| 62 | `downloadUpdate` | `update:download` | invoke | — | `Promise<{ok,...}>` | core/autoupdate.ts:71-78 (win) / 127-130 (mac) | delete — electron-updater |
| 63 | `installUpdate` | `update:install` | invoke | — | `Promise<void>` | core/autoupdate.ts:79-81 / 131-133 | delete — electron-updater |
| 64 | `onUpdateAvailable` | `update:available` | on-stream | `cb: (info) => void` | unsubscribe fn | emitted core/autoupdate.ts:47-49, 63, 105, 139, 150 | delete — autoupdate stream |
| 65 | `onUpdateProgress` | `update:progress` | on-stream | `cb: (p) => void` | unsubscribe fn | emitted core/autoupdate.ts:50-52 | delete — autoupdate stream |
| 66 | `onUpdateDownloaded` | `update:downloaded` | on-stream | `cb: (info) => void` | unsubscribe fn | emitted core/autoupdate.ts:53-55 | delete — autoupdate stream |
| 67 | `appVersion` | `app:version` | invoke | — | `Promise<string>` | main/ipc.ts:305 (`app.getVersion()`) | http — needs a version-source shim (package.json version or `CHM_VERSION` env var) since `app.getVersion()` won't exist server-side; see Table 2 note on `update.ts` |
| 68 | `checkForUpdates` | `update:check` | invoke | — | `Promise<UpdateCheckResult>` | core/autoupdate.ts:84-109 / 135-143 | delete — electron-updater / manual-update feature |
| 69 | `setUiScale` | `ui:scale` | invoke | `scale` | `Promise<void>` | main/ipc.ts:222 → main/overlay.ts:43-47 (`webContents.setZoomFactor`) | delete — mutates an Electron `BrowserWindow`'s zoom; the browser has its own native zoom |
| 70 | `getReleaseNotes` | `app:releaseNotes` | invoke | `version?` | `Promise<ReleaseNotes\|null>` | main/ipc.ts:306 → core/update.ts | http |
| 71 | `getReleaseNotesSince` | `app:releaseNotesSince` | invoke | `since?, max?` | `Promise<ReleaseNotes[]>` | main/ipc.ts:307-309 → core/update.ts | http |

## Table 2 — `app/src/main/core/` modules

| Module | Class | Electron / desktop-only imports and call sites forcing the classification |
|---|---|---|
| `autoupdate.ts` | delete | `import { app, ipcMain, type BrowserWindow } from 'electron'` (line 14); wraps `electron-updater`'s `autoUpdater` throughout (lines 21, 44-118). The feature itself (in-app update download/install) is out of scope for a server deployment — updates ship as a new container image — so the module is deleted rather than shimmed. |
| `config.ts` | shim | `import { app } from 'electron'` (line 3); `app.getPath('userData')` at lines 14, 209; `app.getPath('exe')` at line 27. **Expected shim, confirmed.** |
| `converter.ts` | keep | No electron import. Uses `getConfig()` (shimmed) and `run()` from `proc.ts`. Onyx CON conversion, feature-flagged per plan Phase 5 §5, but the module itself is unchanged. |
| `download.ts` | keep | No electron import. Pure Node `fs`/`stream` for fetching and writing archive files. |
| `duplicates.ts` | keep | No electron import. |
| `enchor.ts` | keep | No electron import (catalog search source). |
| `extractor.ts` | keep | No electron import. Uses `config.ts` (shimmed) + `proc.ts` to invoke the 7z binary. |
| `filemeta.ts` | keep | No electron import. |
| `filetype.ts` | keep | No electron import. |
| `gamedetect.ts` | delete | No electron import at all, but implements OS process detection (Clone Hero/YARG running-process probing) and window-focus bring-to-front for a local game — a desktop-only feature with no server-side meaning. Every `game:*` channel it backs is `delete` in Table 1. **File removed 2026-08-02**, along with its two callers in `main/overlay.ts` (`toggleOverlay`/`hideOverlay`'s game-focus-restore branches) and the `game:*`/`dialog:chooseExe` registrations + poll loop in `main/ipc.ts`. The `chExePath`/`yargExePath` `AppConfig` fields it read were dropped from `shared/types.ts`, `main/core/config.ts` and `server/src/config.ts`. The now-unreachable "reminder pill" feature (`main/reminder.ts`, `showReminder`/`reminderPosition` config, and its Settings UI section) was removed in the same pass — its only trigger points were inside the deleted game-detection poll/focus-restore code. |
| `gameformats.ts` | keep | No electron import. |
| `jobs.ts` | keep | No electron import. This is the core, portable download→extract→convert→install queue — the feature the whole port exists for. It emits a plain Node `EventEmitter` `'update'` event, bridged to `webContents.send('jobs:update', ...)` in `main/ipc.ts:312-314`; only that one bridging line moves (to the Phase 4 SSE bus), `jobs.ts` itself is untouched. |
| `library.ts` | keep | No electron import. |
| `librarymgr.ts` | shim | `import { shell } from 'electron'` (line 4). `shell.trashItem` at lines 187, 206 (→ `.trash/` shim, Phase 5 §1). `shell.openPath` at line 271 (backs `libOpen`) and `shell.showItemInFolder` at line 275 (backs `libReveal`) have **no server equivalent** — the Phase 5 brief only anticipates the trash-item migration, not these two. **Expected shim, confirmed, but scope is narrower than "the whole module shims cleanly": `libOpen`/`libReveal` are `delete` at the channel level (Table 1 #19–20), not shimmed.** |
| `localaudio.ts` | shim | `import { protocol } from 'electron'` (line 15); `protocol.registerSchemesAsPrivileged(...)` (line 48) and `protocol.handle(AUDIO_SCHEME, ...)` (line 92) implement the custom `chm-audio://` scheme. **Expected shim, confirmed.** |
| `platform.ts` | keep | No electron import. Pure `process.platform` + `chmod` helpers for naming/making-executable the bundled 7z/onyx binaries — still needed inside the Linux container. |
| `playlists.ts` | **shim (not in plan's expected list)** | `import { app } from 'electron'` (line 20); `app.getPath('documents')` at line 35 (Setlists folder) and `app.getPath('userData')` at line 256 (`hash-index.json`). Same shape of fix as `config.ts` — route through the same path shim instead of calling `app.getPath` directly. |
| `preview.ts` | keep | No electron import. |
| `proc.ts` | keep | No electron import; thin `child_process.spawn` wrapper (line 3) used by `converter.ts`/`extractor.ts`. |
| `rhythmverse.ts` | keep | No electron import (catalog search source). |
| `sngextract.ts` | keep | No electron import. |
| `songmeta.ts` | keep | No electron import. |
| `spotify.ts` | keep | No electron import. |
| `update.ts` | **shim (not in plan's expected list)** | `import { app } from 'electron'` (line 7); `app.getVersion()` at lines 15, 46, 106 — used both by the deleted update-check flow and by `getReleaseNotes`/`getReleaseNotesSince`, which stay in scope (Table 1 #70-71) and by `appVersion` (#67). Needs a version-source shim (package.json version or `CHM_VERSION` env var). |

**Totals:** 24 modules — 17 keep, 5 shim (`config.ts`, `librarymgr.ts`, `localaudio.ts`, plus `playlists.ts` and `update.ts` which the plan did not anticipate), 2 delete (`autoupdate.ts`, `gamedetect.ts`).

## Section 3 — strays

1. **`enqueueLocalFile`/`enqueueLocalBatch` are part of the out-of-scope manual-install feature.** The guardrails name only `getDroppedFilePath` and `dialog:chooseSongFile` as deleted, but `jobs:enqueueLocal`/`jobs:enqueueLocalBatch` (`core/jobs.ts:148-173, 182-200`) are the very next step in the same pipeline — they take a raw local filesystem path and skip straight to extract→convert→install. With the drop/picker UI gone, nothing in a browser client can ever supply that `localPath` argument. Reclassified `delete` in Table 1 (#6, #7).
2. **`libOpen`/`libReveal` are desktop-only openers not named in the guardrails' delete-category list.** They wrap `shell.openPath`/`shell.showItemInFolder` (`core/librarymgr.ts:271, 275`) — open the item in the native file manager / reveal it in Finder-Explorer. No server equivalent. Reclassified `delete` (Table 1 #19, #20), even though the rest of `librarymgr.ts` is a `shim` module.
3. **Dead code, upstream of the port:** `sendHotkey()` (`main/hotkeys.ts:37-39`) sends the `'hotkey'` channel, but nothing in `app/src/main/**` ever calls it — grepped for `sendHotkey` and the literal `'hotkey'` channel string across the whole `app/src` tree and found only the definition and the preload's `onHotkey` listener (`preload/index.ts:199-203`). This stream is already inert in the current Electron app; not a porting concern, but worth knowing before spending Phase 4 effort wiring an SSE channel for it.
4. **`dialog:chooseDir` (`chooseDirectory`) and `lib:moveOut` (`libMoveOut`) are genuinely ambiguous**, not cleanly `http` or `delete` — see the `?` notes in Table 1 (#40, #16). Both hinge on picking/using an arbitrary path on the server's own filesystem, which has no direct browser equivalent short of a bespoke directory-browse feature.
5. **Two extra module-level shims beyond the plan's expected three:** `playlists.ts` and `update.ts` both import Electron's `app` directly (`app.getPath` and `app.getVersion()` respectively) — see Table 2.
6. **No stray Node built-ins / `process` / `__dirname` usage found outside main.** Grepped `app/src/shared` and `app/src/renderer` for `process.`, `__dirname`, `require(` — zero hits.
7. **No stray Electron imports found outside `main/**` and `preload/**`.** Grepped `from 'electron'` across all of `app/src` — every hit is inside `app/src/main/` (including `main/core/`); `app/src/renderer` and `app/src/shared` are clean.
8. **`shell.openExternal` also appears once more, outside the preload-exposed channel:** `main/overlay.ts:108-111` calls it inside `win.webContents.setWindowOpenHandler(...)` (intercepting target=_blank navigations from the renderer). This has no preload method and no channel — it's an internal Electron `BrowserWindow` behavior that simply ceases to exist once the app runs in a real browser tab (the browser's own popup/target handling takes over).
9. **No dead channels found the other direction:** every `ipcMain.handle`/`ipcMain.on` registration found in `main/ipc.ts` and `main/core/autoupdate.ts` corresponds to exactly one preload method. No orphaned main-side channels with no preload caller.

## Section 4 — totals reconciliation

**Preload method count:** the `api` object in `app/src/preload/index.ts` has **71** top-level keys (verified via `grep -nE '^  [a-zA-Z][a-zA-Z0-9_]*:'`, cross-checked by hand against the source). Of those, **69 are IPC-channel-backed** (`invoke`/`send`/`on` wrappers) — this matches the plan's "69 typed methods" figure exactly, once you read it as "69 channel methods" rather than "69 keys in the object." The other 2 keys are **not** IPC at all: `platform` (a plain value copied from `process.platform` at preload-eval time) and `getDroppedFilePath` (calls `webUtils.getPathForFile` directly in the preload, no `ipcMain` round-trip). **Actual total = 71, not 69** — state this plainly since it doesn't match the plan's number on its face.

Of the 69 channel-backed methods: 62 are `invoke`/`send` (request-response shaped), 7 are `on`-stream (server-push shaped) — **this exactly matches the plan's "62 invoke/send" and "~7 sse" breakdown.**

Where it diverges is what those 62 and 7 become after classification:

| Classification | Count | Plan's expectation | Match? |
|---|---|---|---|
| `http` | 38 | ~60 of 62 invoke/send | **No — 22 fewer.** The plan's own delete-category list (tray/overlay/hotkeys/autoupdate/gamedetect/game-launch/reminder/menu) already implies most of this gap; the ~60 figure in the plan's Phase 1 brief undercounts how many invoke/send methods those categories actually cover (`game:*` ×5, `overlay:*`/`ui:scale` ×4, `hotkeys:*` ×2, `update:*` ×3, `dialog:chooseExe`, `dialog:chooseSongFile`) plus the two strays found here (`jobs:enqueueLocal(Batch)`, `lib:open`/`lib:reveal`) and 2 ambiguous (`dialog:chooseDir`, `lib:moveOut`). |
| `sse` | 1 | ~7 | **No — 6 fewer.** Only `onJobUpdate` survives as a real SSE channel. The other 6 `on`-stream methods (`onGameStatus`, `onMaximizeChange`, `onHotkey`, `onUpdateAvailable`, `onUpdateProgress`, `onUpdateDownloaded`) all feed features being deleted outright (game detection, window-maximize state, global hotkeys, autoupdate), so there is nothing left to stream. Phase 4 only needs to build one SSE channel, not seven. |
| `delete` (firm) | 30 | (implied by the plan's delete-category list, not numbered) | Includes `platform`, `getDroppedFilePath`, both local-install methods, `libOpen`/`libReveal`, `chooseSongFile`, `peekFileMeta`, all 5 `game:*`, `chooseExeFile`, all 4 window-control methods, `quitApp`, both `hotkeys:*`, `onHotkey`, `openExternal`, both `update:download/install`, all 3 `on-update-*` streams, `checkForUpdates`, `setUiScale`. |
| `delete?` (ambiguous) | 2 | — | `chooseDirectory`, `libMoveOut` — flagged, not silently bucketed either way. |
| **Total** | **71** | 69 | Reconciles: 38 + 1 + 30 + 2 = 71, matching the 71 keys actually found. |

**Module-level (Table 2):** plan expected exactly 3 shims (`config.ts`, `librarymgr.ts`, `localaudio.ts`). Actual is **5 shims** — `playlists.ts` and `update.ts` also call Electron's `app` API directly and were not anticipated. 2 modules (`autoupdate.ts`, `gamedetect.ts`) are `delete` rather than shim/keep; the plan didn't call out a module-delete category explicitly but its channel-level delete list implies it. 17 modules are unchanged `keep`. 17 + 5 + 2 = 24, all 24 files in `app/src/main/core/` accounted for.
