# Cleanup audit — branch `mobile` (2026-08-06)

> [!note] Executed 2026-08-07 on branch `cleanup`
> Jaime decided the fork is **web-only** — the Electron desktop target is
> dropped. Executed: §3 dead CSS (all 10 groups + the Phase-1 orphan block,
> re-verified against the post-`2dc46b9` tree), §1d/`sync-core.mjs`
> `filemeta.ts` exclusion, the §1b web guards (superseded in the same branch
> by full removal), the whole Electron target (§1c: `main/` non-core files +
> `core/autoupdate.ts`, `preload/`, electron-vite/builder config, 6 deps,
> `make-release.ps1`, mac-build docs + workflow), and the §1b/§2 renderer
> chains + RendererApi methods end-to-end. NOT executed (per §4/§5 and the
> audit's own advice): queue-sheet → `.sheet` unification, `@media (hover:
> hover)` merging, ipc/router `search()`+`config:set` unification, styles.css
> reorganization, and the FilterBar/FilterSheet difficulty-dropdown dedup
> (safe but low value). Line numbers below are as of `96b7b76`.

Read-only audit of dead and duplicated code left by the webapp port (feature
deletions) and the five mobile CSS phases. Nothing here has been changed;
every finding lists evidence (file:line as of commit `96b7b76`), a risk
rating, and an estimated line count.

**Risk key:** `safe` = delete with a build+smoke check · `needs-judgment` =
depends on a decision (mostly: is the Electron desktop build still a target
on this branch?) · `risky` = don't touch without a dedicated pass.

**The one decision that gates half of this document:** the `mobile` branch
still carries the full Electron target (`app/src/main/`, `app/src/preload/`,
`electron-vite` scripts, `docs/mobile/plan.md` ground rule 4 explicitly keeps
`npm run build` green). The deployed product is web-only (Dockerfile builds
`build:web` + server). Everything marked *needs-judgment (Electron)* below is
dead **for the web deployment** but load-bearing **for the Electron build**.

---

## 1. Dead components / modules

### 1a. Surprise: no renderer component is unimported

Every candidate is still imported and rendered:

| Component | Importer | Evidence |
|---|---|---|
| `LocalDropModal.tsx` | `App.tsx:7` (import), `App.tsx:772` (rendered) | opens via `pendingLocal` state, set only by `openLocalDrop` (`store.ts:1290`), triggered only from the Electron-only dropzone (`FilterBar.tsx:157` guard `platform !== 'web'`) |
| `LocalPreview.tsx` | `DuplicatesModal.tsx:8,108`, `LibraryManager.tsx:9,617` | alive on web too (library audio preview) |
| `RowMenu.tsx` | `SongRow.tsx:14,348` | alive after IA changes |
| `TipsTicker.tsx` | `TitleBar.tsx:4,53` | alive (hidden <900px by CSS only) |

So there is nothing to `rm` under `components/`. What the deletions actually
left behind is **Electron-only UI that still ships in the web bundle**, some
of it reachable and broken on web:

### 1b. Electron-only renderer chains (dead weight in the web bundle)

- **Manual-install chain** — `FilterBar.tsx:65–93` (`handleDrop`),
  `FilterBar.tsx:157–189` (dropzone, correctly guarded `platform !== 'web'`),
  `LocalDropModal.tsx` (161 lines), `store.ts` `pendingLocal` /
  `pendingLocalBatch` / `openLocalDrop` / `openLocalBatch` /
  `confirmLocalDrop` / `cancelLocalDrop` (~120 lines around
  `store.ts:1262–1370`), plus dropzone CSS (`styles.css:~1431–1500`).
  Guarded, so *harmless* on web — just bundle weight.
  **Risk: needs-judgment (Electron). ~410 lines.**
- **Auto-update UI** — `Sidebar.tsx:38–105` (listeners + `checkUpdates` +
  `downloadUpdate`), `Sidebar.tsx:190–260` (update cards), `side-update-*`
  CSS. **NOT guarded on web**: the "Check for updates" footer button renders,
  and `web-api.ts:257` makes `checkForUpdates` always reject → the button
  always shows the error state. `onUpdate*` are no-op subscribes
  (`web-api.ts:252–254`), so the cards never appear.
  **Risk: needs-judgment (Electron) — but the visible always-failing button
  is a web UX bug worth fixing either way. ~220 lines (TSX+CSS).**
- **Window chrome** — `TitleBar.tsx:19–29` (isMaximized/onMaximizeChange/
  double-click-to-maximize) and `TitleBar.tsx:59–72` (Maximize + Quit
  buttons). Hidden only `<900px` (`styles.css:7640` `.titlebar__btn--window`);
  on a **desktop-width browser they are visible**, and Quit calls
  `web-api.ts:232 quitApp → removed()` which throws in the click handler.
  **Risk: needs-judgment (Electron); the missing web guard is a bug. ~40 lines.**
- **Native file-manager openers** — `LibraryManager.tsx:578`
  (`window.api.libOpen(cwd)`, "Open in Explorer" button) and
  `DuplicatesModal.tsx:114` (`window.api.libReveal(rel)`). Unguarded; on web
  both throw (`web-api.ts:159–160`). **Same pattern: bug on web, feature on
  Electron. ~15 lines.**

### 1c. Main-process modules

All of `app/src/main/` is wired to the Electron entry (`index.ts:6–11`
imports `ipc.ts`, `menu.ts`, `overlay.ts`, `core/autoupdate.ts`) — nothing is
orphaned *within* that target. `filemeta.ts` is imported only by `ipc.ts:17`
(the `file:peekMeta` channel = manual install); `filetype.ts` is **not**
manual-install-only — `jobs.ts:260,306` uses `isArchiveByMagic` in the
download pipeline, so it stays regardless.

Dropping the whole Electron target (`main/` ~730 lines, `preload/` 207,
`electron.vite.config.ts`, electron deps) is the single biggest deletion
available (~1,000+ lines + 4 deps) but contradicts the mobile plan's ground
rule 4. **Risk: risky until Jaime decides the fork is web-only.**

### 1d. Server side

- `server/src/` is tight: every module (`audio.ts`, `sse.ts`, `router.ts`,
  `version.ts`, `config.ts`, shims) is imported from `index.ts:12–16`.
  The electron shim's three throwing methods (`shims/electron/index.js`
  `openPath`/`showItemInFolder`/`openExternal`) back deliberately-unrouted
  channels — documented, keep.
- `scripts/sync-core.mjs` mirrors **`filemeta.ts` into `server/src/gen/`
  although no server code imports it** (`router.ts` has no `file:peekMeta`
  route). `gen/` is gitignored so it costs 0 repo lines, but adding
  `filemeta.ts` to the `EXCLUDED` set (`sync-core.mjs:~30`) keeps the mirror
  honest. **Risk: safe. 1-line change.**

## 2. Dead preload / web-api methods

**Headline: there are zero `RendererApi` methods with no renderer callers.**
Verified per-method (rg over `App.tsx`, `store.ts`, `components/`):

| Method | Caller | Status on web |
|---|---|---|
| `enqueueLocalFile` | `store.ts:1363` | transitively Electron-only (guarded chain) |
| `enqueueLocalBatch` | `store.ts:1272` | same |
| `peekFileMeta` | `store.ts:1296` | same |
| `getDroppedFilePath` | `FilterBar.tsx:71` | same |
| `chooseSongFile` | `FilterBar.tsx:162` | same |
| `libOpen` | `LibraryManager.tsx:578` | **reachable, throws** |
| `libReveal` | `DuplicatesModal.tsx:114` | **reachable, throws** |
| `toggleMaximize` / `quitApp` | `TitleBar.tsx:28,62,69` | **reachable ≥900px, no-op/throws** |
| `isMaximized` / `onMaximizeChange` | `TitleBar.tsx:20–21` | benign stubs |
| `checkForUpdates` / `downloadUpdate` / `installUpdate` / `onUpdate*` | `Sidebar.tsx:38–43,65,90,202` | check button **reachable, always errors** |

Removing any of these from `shared/types.ts` + `preload/index.ts` +
`web-api.ts` therefore requires deleting their (Electron-only) callers first
— i.e. the same Electron decision as §1b. No server routes exist for any of
them (checked `server/src/router.ts` handler map), so the server needs no
change. **Risk: needs-judgment (Electron). ~120 lines across types + preload
+ web-api if the Electron chains go.**

## 3. Dead CSS (`app/src/renderer/src/styles.css`, 9,189 lines)

Method: scripted extraction of all 692 distinct class names from CSS
selectors, cross-referenced against every `.ts/.tsx/.html` under
`app/src/renderer` **plus** the dynamic `className` template domains
(the only interpolations in the codebase are `dup__extra--${m.key}`,
`song__preview--${state}`, `jobchip--${stage}`, `qjob--${stage}`,
`plrow--${status}` — their full value domains from `shared/types.ts:162`
(`JobStage`) and `PlaylistImportModal.tsx:26` (`RowStatus`) were counted as
used). Script: session scratchpad `css-audit.mjs`.

**Result: 62 class names with zero references, 85 fully-dead rule blocks,
~635 lines.** Confidence high (exact-string + dynamic-domain check); the only
residual risk is a class name arriving from server-rendered data, which this
app doesn't do.

Grouped, with line ranges:

| Group (likely origin) | Classes | Blocks (line ranges) | ~Lines | Risk |
|---|---|---|---|---|
| Old pre-IA sidebar (Phase 3.5 replaced with `side-navitem` nav rail, `Sidebar.tsx:121–151`) | `side-item(--on)`, `side-label`, `side-list`, `side-group`, `side-indicator` | 4777–4885, 5530–5537, 5712–5764, 5984–6012, 6209–6262, 6748–6753, plus `.side-item:active` fragment at 9146 | ~190 | safe |
| Old results table header (Phase 2 cards) | `tablehead(__song/__instruments/__actions)` | 5185–5222, 5678–5681, 5692–5695 | ~50 | safe |
| Theme picker UI (removed from Settings; `data-theme="graphite"` is hardcoded in `index.html:2` so `[data-theme]` *rules* stay) | `theme-picker`, `theme-opt(--on)`, `theme-swatch(--navy/--graphite)` | 6538–6582, 6648–6678 | ~75 | safe |
| Old brand/logo markup (current markup is `brand-mark`/`brand-text`, `TitleBar.tsx:41–50`) | `brand-logo`, `brand__ch(-c/-h/-sub)`, `brand__rest`, `ch-logo` | 158–174, 214–298, 1752–1763 | ~100 | safe |
| Old library list detail | `lib__item--rich`, `lib__meta`, `lib__title`, `lib__subline`, `libdiff*` | 4619–4669 | ~50 | safe |
| Old library popover | `libpop(__head/__item)` | 6828–6867 | ~40 | safe |
| Old titlebar version pill | `titlebar__version`, `titlebar__spacer` | 344–365, 4931–4935, 5495–5517 | ~45 | safe |
| Old filter chips | `fchip(--active/__icon)` | 1142–1168 | ~27 | safe |
| Filterbar leftovers | `filterbar__label`, `filterbar__diff(--off)`, `filterbar__dash`, `diffpick__cap--or` | 1137–1141, 1230–1243, 1255–1257 | ~25 | safe |
| Old dropzone text markup (current: `dropzone__main`/`__ext`) | `dropzone__text` | 1476–1494 | ~19 | safe |
| Misc singletons | `artist-chip` (6306–6324), `owned-wrap` (6806–6811), `pillbtn` (5959–5978), `searchbar--stacked` (551–555), `searchbar__sublabel` (565–571), `check__sub(-label)` (2985–2998), `dd--pos` (2999–3003), `field__warn` (2886–2892), `lib__btn--danger` (3282–3286), `plrow__charter` (7364–7372), `side-update__result--available` (5874–5876, 6524–6532) | scattered | ~90 | safe |

Note on template-built stage classes: `jobchip--done/--error` and
`qjob--done/--canceled/--error` looked dead to a naive literal search but are
**alive** — `SongRow.tsx:296` and `DownloadQueue.tsx:156` interpolate
`--${job.stage}`, and done/error/canceled ∈ `JobStage`
(`shared/types.ts:162`); `SongRow.tsx:295` renders the chip for terminal
stages too ("Done ✓"). They are excluded from the dead list. The same
verification was applied to `dup__extra--*`, `song__preview--*` and
`plrow--*` (all alive).

### Phase-1 orphan block — confirmed

`styles.css:7953` (Phase 2 header) states it outright: the Phase 1 inline
hero-expansion rules were orphaned when the toggle started opening the
FilterSheet, and Phase 3.5 finished the job with `.filterbar { display: none }`
at `<900px` (`styles.css:8883`). Everything filterbar-scoped inside the
Phase 1 `<900px` media block is unreachable:

- `.filterbar` mobile layout (7706–7712), `.filterbar__mobiletoggle`
  (7713–7728 + base hide at 7573), `.filterbar__mobilecaret` (7741–7744),
  `.filterbar--mobile-collapsed …` (7745–7748), `.filterbar .fgroup + .fgroup`
  (7749–7754), `.filterbar .dropzone` (7755–7759).
- **Keep** `.filterbar__mobilecount` (7729–7740) — reused by the FilterSheet
  badge (`FilterSheet.tsx:41`) and the searchbar Filters trigger.

**~45 lines, risk safe** (media-scoped; desktop ≥900px never enters the block;
`<900px` the whole `.filterbar` subtree is `display:none`).

**Dead CSS total: ~680 lines (~7.4% of the file).**

## 4. Duplicated code

- **Queue sheet vs `.sheet`** — known and self-documented
  (`styles.css:7976–7978` marks the queue's older per-component copy as a
  unification candidate). The fork: `queue-pill`/`queue-scrim`/
  `queue-wrap--sheet` CSS at 7826–7910 (~85 lines) vs the shared `.sheet`
  pattern at 7970–8040. Assessed the JSX side (`DownloadQueue.tsx:83–107`):
  the component interleaves the desktop collapsible bar and the mobile sheet
  in **one** DOM tree with a snapshot-on-close animation (lines 41–70) —
  adopting `.sheet` means splitting head/body markup and re-verifying both
  the desktop grid-rows animation and the mobile sheet. **Not a small fork.**
  Saves ~60 CSS lines at real regression risk. **Risk: risky; recommend leave.**
- **FilterBar / FilterSheet / FilterPanelFields** — cleaner than feared:
  `FilterSheet.tsx:6–8` imports `FilterPanelFields` (FilterPanel.tsx:177) and
  `InstrumentButtons` (FilterBar.tsx:19); the only copy-paste left is the
  Min/Max(/Exact) difficulty `Dropdown` group (`FilterBar.tsx:116–137` vs
  `FilterSheet.tsx:71–95`, ~30 dup lines). **Risk: safe to extract, low value
  — fine to leave.**
- **`search()` + `config:set` logic duplicated between `app/src/main/ipc.ts`
  and `server/src/router.ts:96–144`** — deliberate and documented
  (`router.ts:14–16` "replicated … minus their Electron-only parts"); the
  cost of unifying is moving them into `core/` and re-mirroring. ~55 dup
  lines. **Risk: needs-judgment; leave unless the search logic changes again.**
- **105 separate `@media (hover: hover)` blocks** (Phase 5 sweep wrapped each
  hover rule in place) + 7 width-breakpoint blocks across the five MOBILE
  sections. Merging would save ~200 lines of wrapper overhead but is exactly
  the "never reorganize styles.css" move the mobile plan forbids, and diffs
  would be unreviewable. **Risk: risky; leave.**
- **Server router boilerplate** — the handler map (`router.ts:153–249`) is a
  flat mechanical table; no abstraction needed. No finding.

## 5. Unused dependencies

Verified with rg — **none are removable today**:

- `app`: `electron-updater` is imported by `app/src/main/core/autoupdate.ts`
  (Electron target); `parse-sng` by `sngextract.ts`; `zustand` by `store.ts`.
  devDeps `@resvg/resvg-js` + `png-to-ico` are used by
  `app/scripts/make-icon.mjs`; `electron`/`electron-builder`/`electron-vite`
  by the desktop build. If Electron is dropped, `electron-updater`,
  `electron`, `electron-builder`, `electron-vite` (and the `build`/`dist*`
  scripts + the whole `"build"` electron-builder block in `app/package.json`,
  ~100 lines) all go. **Risk: needs-judgment (Electron).**
- `server`: `fastify`, `@fastify/static`, `parse-sng` (via gen/sngextract),
  `electron` (the shim, load-bearing) — all used. `tsx`/`typescript` dev. Clean.
- `worker`: `wrangler` + types only. Clean.

## 6. Dead assets

**None found.** All 12 renderer assets are referenced
(`X_logo.jpg`, `github.svg`, `zipeek_logo.webp`, `reddit_logo.png` →
`AboutModal.tsx`; `Spotify_Primary_Logo.webp` → `Sidebar.tsx`;
`Spotify_logo.webp` → `PlaylistImportModal.tsx`; `bug.webp` → `Pager.tsx`;
5 instrument PNGs → `Icon.tsx`). `public/icons/*` are referenced by
`manifest.webmanifest` (PWA, Phase 5). `app/build/*` icons feed
electron-builder (Electron target); `release-assets/README.txt` feeds
`scripts/make-release.ps1`. The deleted features' logos were already removed.

---

## Proposed cleanup order

1. **safe** — Dead CSS sweep: the 62 dead classes' 85 blocks (~635 lines) +
   the Phase-1 filterbar orphan block (~45 lines). One commit per group from
   the §3 table keeps it reviewable; verify with `npm run build:web` + a
   desktop/mobile visual pass. Re-run the audit script after.
2. **safe** — `sync-core.mjs`: add `filemeta.ts` to `EXCLUDED` (1 line).
3. **needs-judgment (small, web bugfix)** — Guard the four broken-on-web
   surfaces behind the existing `platform !== 'web'` idiom
   (`FilterBar.tsx:157`): TitleBar window buttons, Sidebar "Check for
   updates", LibraryManager "Open in Explorer", DuplicatesModal "Reveal".
   ~15 lines added, fixes real web UX breakage without touching Electron.
4. **needs-judgment (the decision)** — Ask Jaime: is the Electron build on
   this branch still wanted? If **no**: delete `app/src/main/`,
   `app/src/preload/`, `electron.vite.config.ts`, the electron-builder
   config + scripts, 4 deps, then the §1b renderer chains and §2 API
   methods, then collapse `web-api.ts` stubs. ~1,800+ lines total.
   If **yes**: stop after step 3.
5. **risky / do not touch** — queue-sheet → `.sheet` unification;
   `@media (hover: hover)` block merging; ipc/router logic unification;
   any reorganization of styles.css section order.

**Total estimated dead lines:** ~700 deletable now (steps 1–2), rising to
~2,500+ if the Electron target is dropped (step 4).
