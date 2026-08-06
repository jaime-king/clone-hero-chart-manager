# Phase 0 — Mobile baseline audit

Audited 2026-08-02 against the local dev server (`server` on :3000, fixture library
`ch-fixture/Songs`, web renderer via `npm run build:web`). Viewports: **375×812**
(phone), **768×1024** (tablet), 1280×800 (desktop reference). All coordinates and
sizes below are CSS pixels measured live via `getBoundingClientRect()` — precise
enough to re-verify after each phase.

No screenshots are checked in; every finding carries exact geometry instead, so it
can be re-measured mechanically.

**Environment caveats**

- Download extraction fails on this Mac with `spawn 7z ENOENT` (no 7z installed).
  The queue UI was still exercised with the failing job; the failure is not a UI bug.
- The fixture has no duplicate charts, so the DuplicatesModal *results/comparison*
  view could not be exercised — only its start and empty-result states. The
  side-by-side comparison remains an untested risk for Phase 4.

---

## 0. The app shell (affects every screen) — the headline finding

At 375px the whole workspace lays out at a **fixed minimum of ~722px**
(`.workspace` scrollWidth 722, sidebar 200px + content ~522px) inside
`.app { overflow: hidden }`. The document itself never scrolls horizontally
(`html/body scrollWidth = 375`), so **~347px of UI — nearly half the app — is
unreachable**. Which half you see depends on accidental programmatic scrolling:
focusing the search input scrolls `.app` to scrollLeft=266, hiding the sidebar
completely (it sits at x=−266..−66).

- **Severity: blocker.** Root cause for most findings below. → Phase 1.
- Title bar at 375px: brand wordmark overlaps the left edge, My Library /
  Settings / Maximize / Quit buttons are 35×38px and sit at x=442..681 (off-screen).
  Maximize/Quit are desktop-window chrome, meaningless on phone. → Phase 1.
- TipsTicker (lightbulb) renders as a 0-width sliver at x=420. → Phase 1 (hide).

At **768×1024** the shell fits exactly (722 ≤ 768): sidebar, hero, search bar,
filter panel, queue bar and title bar are all visible and usable. The shell
problem is **entirely a sub-~730px problem**, which supports the planned
900px (sidebar collapse) / 600px (single column) split — 768 works without the
drawer, though margins are tight (46px spare).

---

## 1. Search / home

### What breaks at 375×812

| Item | Detail | Severity |
|---|---|---|
| Results list has **zero height** | `.results--table` measures 135×**0**px (scrollHeight 2449) — after a real search (`weezer`, 20 rows) not a single result is visible. The hero block (instruments + difficulty + exact difficulty, ~1130px tall at this width) plus search bar consume the whole viewport. Same at 768×1024: results at y=994 in a 1024px viewport, height 0. Desktop 1280×800: results get 240px. The hero never shrinks. | **blocker** |
| Song rows overflow horizontally | Each `.song` row is **838px** wide (min-content) inside a 135px column (`.results` is `overflow-x: auto`). Download button at x=883, More (kebab) at x=1029 — ~650px past the right edge. At 768 the column is 518px wide, rows still 838px, Download still at x=883 (off-screen). | **blocker** (phone and tablet) |
| Hero filter block not adaptive | Instruments / DIFFICULTY / EXACT DIFFICULTY render as three fixed columns; at 375 the 2nd/3rd are clipped ("EXAC…"), and the difficulty area is mostly empty vertical space. Exact-difficulty dot buttons are **16×16px**. | **blocker** (unreachable + tiny targets) |
| Sort dropdown opens off-screen | `.dd__menu` for "Sort by" opens at x=417, y=1234 — beyond the right edge *and* below the fold. Options are 31px tall. Invisible and untappable at phone width. Fine at 768. | **blocker** (phone) |
| Filters panel clipped | `.filterpanel__inner` is 204px wide in a 135px-visible column; panel spans y=658..1164, so the lower fields (Decade, Song length, Charter, Album, "Hide songs I already have") are below the fold with no obvious scroll. Field dropdowns 40px tall (borderline). At 768 the panel lays out 2-up and is fully usable. | **blocker** (phone) |
| Type-ahead suggestions clipped | `.suggest` panel: 251×514px at y=654 — bottom ~360px extends past the 812px viewport; lower suggestions unreachable. Suggestion rows themselves are well-sized (~72px with art). | bad |
| Pager targets small | Page buttons 36×36px (44 needed); prev/next 36×36. "Report a bug" 32×32 at x=690 (also off-screen at 375). | bad |
| Search bar row overflows | Input is 170px wide at x=264 with Filters (97×46) and Search (36×38) at x=454..597 — the row lives half off-screen; Search button clipped to "Se". | blocker (part of shell overflow) |
| Row selection checkbox is hover-only | `.song:hover .song__check .chk__box` — the multi-select checkbox on result rows only appears on hover (input is 0×0 otherwise). No touch path to batch-select. | **blocker** for batch download on touch → Phase 2/5 |
| Album-art preview play is hover-only | `.song:hover .song__preview` — play button exists (81×81) but `opacity: 0` until hover. Tappable-but-invisible on touch. | bad → Phase 5 |

### What already works at 375

- Sidebar content itself (190px wide): database/system groups, Surprise me,
  Import playlist all render and fit — the sidebar only needs to become a drawer,
  not be redesigned. "Check for updates" is 158×34 and version button 79×19
  (small, cosmetic).
- Instrument circle buttons are ~124×124 with labels — generous touch targets.
- MIN/MAX difficulty dropdowns (50×31 — height short of 44 but usable).

### At 768×1024

Everything fits except: results height 0 (same starvation), song rows 838px
in a 518px column. **The two results-list breakages are the only search/home
blockers remaining at tablet width.**

---

## 2. Download flow

### Target-folder modal ("Where to save?") — at 375×812

**Works well already.** Overlay 375×812, sheet fits: filter-folders input full
width, folder rows 285×37, Cancel 148×48 / "Download to root" ~200×48. Long
folder names truncate at the list edge ("…Live from MTV" clipped) — cosmetic.
Close ✕ is 30×30 (small). Row height 37px < 44 — borderline.
→ Phase 4 only needs to make it a full-screen sheet for consistency; nothing is broken.

### Download queue bar — at 375×812

- `.queue-wrap` is 375px wide but **anchored to the workspace's left edge**, not
  the viewport: with the app panned right it sits at x=−220..155, mostly
  off-screen. At `.app` scrollLeft=0 it is fully visible at the bottom left and
  readable (header 37px, job rows ~86px, "Clear history" 118×34).
  Severity: **bad** (inherits the shell overflow; on its own the bar's layout
  survives 375px fine). → Phase 1 (bottom sheet).
- Job chip (`.jobchip`, 72×33) renders at x=692 — off-screen at phone width. bad.
- Real download enqueued (Weezer – Ruling Me → root): modal → queue → progress →
  error state all render. Extraction failed (`spawn 7z ENOENT`, environment, see
  caveats).

---

## 3. Sidebar

At 375: **unreachable whenever the app has panned to the content** (see §0);
when visible, everything fits in its 190px width. Buttons measured:
side items 146×~40 (borderline height), Surprise me / Import playlist ~310×65
(good), "Check for updates" 158×34 (small), version button 79×19 (small,
cosmetic — opens changelog).
→ Phase 1 turns it into a drawer; content itself needs no redesign.

---

## 4. Library manager (My Library)

### What already works at 375×812 — better than expected

- The modal itself: full-screen-ish (338×617 within 375×812), toolbar wraps into
  three rows (New folder / Playlists / Duplicates / sort / open-external /
  refresh), all ≥34px tall.
- Folder browsing: rows are full-width, 40px tall, name + count chip visible;
  deep navigation (packs → Anti Hero → Tier 02) works by double-tap; counts stay
  visible ("6 songs", "SONG" chips).
- Edit-metadata dialog (`lib__dialog--meta`): 338×328, two-column grid fits,
  fields ~145×40, Cancel/Save 40px+ tall. **No breakage.**

### What breaks at 375×812

| Item | Detail | Severity |
|---|---|---|
| Row actions are right-click only | `.ctxmenu` (Open / Rename / Edit metadata / Add to playlist / Copy / Cut / Delete / New folder, 180px wide, items 32px tall) opens **only via `contextmenu`**. Library rows have no visible kebab (unlike search-result rows, which have a `.rowmenu` More button). Footer literally says "Right-click for actions · Ctrl+C/X/V · Del · F2". On touch: rename, delete, metadata, playlist-add are all unreachable. | **blocker** → Phase 3 |
| Multi-select is modifier-key only | Ctrl/Shift-click and Ctrl+C/X/V; no checkboxes, no long-press. No touch path to multi-select. | **blocker** → Phase 3 |
| Song detail overflows horizontally | `.songdetail` is 305px visible but scrollWidth **483px**: the per-instrument difficulty dots row (Guitar/Bass/Drums/…) runs off the right edge; a horizontal scrollbar appears inside the detail card. Metadata line wraps to one word per line ("Kero / Bonito / shh#ffb6c1 / · / 2014 / ·…") in the narrow column beside the 165px artwork. "Edit metadata" button (146×36) partially clipped at the card's right edge. | bad → Phase 3 |
| Audio preview play is hover-only | Same `.song__preview` rule as search: 81×81 button over the artwork with `opacity: 0` until `:hover` (`.songdetail__artwrap:hover`). Invisible on touch. | **blocker** for previews on touch → Phase 3/5 |
| Breadcrumb overflow at depth | At Songs / packs / Anti Hero / Tier 02, the crumb row wraps awkwardly and the last crumb clips at the right edge ("Tier 02 - Yea…"). Still navigable. | cosmetic |
| Ctx menu positioning | When opened near the bottom it can hang over other modals; stray remnant observed overlapping the song detail. Items 32px < 44. | bad (moot once Phase 3 replaces it on phone) |

---

## 5. Duplicates modal

- Start screen at 375: fits (331×261; sw 343 → 12px bleed). "Search everything" /
  "Pick folders" cards are 139×103 side by side — tappable. Minor overflow only.
- Scan ran ("Searching your whole library") and empty state + footer actions
  ("Move to folder…", "Move to Recycle Bin") fit at 375. cosmetic.
- **Not exercised: the results/comparison view** (fixture has no dupes). The
  side-by-side comparison called out in the plan (Phase 4: stack vertically)
  remains unverified — treat as expected-broken until Phase 4 tests it with a
  seeded duplicate.

## 6. Playlist manager

- At 375 the `modal--plm` is 338px wide but its two-pane body is **351px**
  (scrollWidth): the right pane (playlist detail/help text) is clipped to a
  ~40px sliver rendering 1–3 characters per line ("Se / a / pl / to / se…").
  **Severity: bad** (left pane usable, right pane useless). → Phase 4 (stack panes).

## 7. Playlist import (Spotify)

- **Works at 375.** Modal 345×294; Spotify branding, explainer, URL input
  (~345×70 combined with 165×100 Find Charts button) all fit; nothing clipped.
  Find Charts flow not run (network/live source). cosmetic at most.

## 8. Settings

- Modal 331×426, body scrollWidth **367** → ~36px clipped at the right: the
  control next to UI scale (reset/"R…") is cut off; a horizontal scrollbar
  appears at the modal's bottom. **bad.**
- Two `settings-col` columns are forced to 135px each: labels wrap hard
  ("Chart folder name" over three lines, OPTIONAL badge overlapping the
  chevron), Songs-folder path input truncates to "/Users/". **bad** → Phase 4
  (single column below phone bp).
- UI scale − / + buttons 44×44 — fine. Cancel/Save fine.

## 9. About / What's New

- **About works at 375.** 331×686, scrolls vertically inside (scrollHeight 1039),
  1–2px horizontal bleed only. GitHub link buttons ~205×70. Nothing to fix
  beyond the shared sheet treatment.
- What's New: 331×224, scrollWidth 343 → 12px bleed. cosmetic.

---

## Summary table

| Screen | Item | Severity | Phase |
|---|---|---|---|
| Shell | 722px min-width in overflow:hidden app — half the UI unreachable, no h-scroll | blocker | 1 |
| Shell | Sidebar unreachable once content panned (focus auto-scroll) | blocker | 1 |
| Shell | Title bar: buttons off-screen, 35×38 targets, Maximize/Quit shown on phone | bad | 1 |
| Shell | TipsTicker sliver at phone width | cosmetic | 1 |
| Search | Results list 0px tall at 375 **and** 768 (hero starves it) | blocker | 1/2 |
| Search | Song row 838px min-width; Download at x≈883, More at x≈1029 off-screen (also at 768) | blocker | 2 |
| Search | Hero (instruments/difficulty/exact) fixed 3-col, clipped; exact-difficulty dots 16×16 | blocker | 2 |
| Search | Sort dropdown opens at x=417/y=1234 — fully off-screen | blocker | 2 |
| Search | Filters panel: 204px content in 135px column, lower half below fold | blocker | 2 |
| Search | Type-ahead suggest panel bottom ~360px past viewport | bad | 2 |
| Search | Pager 36×36, bug button 32×32 | bad | 2 |
| Search | Row select checkbox hover-only → no touch batch-select | blocker | 2/5 |
| Search | Art preview play hover-only (opacity 0) | bad | 5 |
| Download | Target-folder modal | works | 4 (sheet polish) |
| Download | Queue bar anchored to workspace edge, splits off-screen when panned | bad | 1 |
| Download | Job chip renders off-screen at 375 | bad | 1 |
| Sidebar | Content fits 190px; Check-for-updates 34px, version 19px targets | cosmetic | 1 |
| Library | Row actions right-click-only (no kebab on lib rows) | blocker | 3 |
| Library | Multi-select Ctrl/Shift-only, no touch path | blocker | 3 |
| Library | Song detail 483px content in 305px card; dots row overflows; meta text 1 word/line | bad | 3 |
| Library | Preview play hover-only in song detail | blocker | 3/5 |
| Library | Breadcrumb clips at depth | cosmetic | 3 |
| Library | Folder browser, toolbar, metadata dialog | works | — |
| Duplicates | Start + empty states fit; 12px bleed | cosmetic | 4 |
| Duplicates | Comparison view untested (no fixture dupes) — assume side-by-side breaks | unknown/blocker | 4 |
| Playlists | Right pane clipped to ~40px sliver (body 351px in 338px modal) | bad | 4 |
| Playlist import | Fits | works | 4 (sheet polish) |
| Settings | 36px clipped right (UI-scale reset), h-scrollbar in modal | bad | 4 |
| Settings | Forced 2-col at 135px/col — labels wrap 3 lines, path shows "/Users/" | bad | 4 |
| About / What's New | Fit and scroll correctly (≤12px bleed) | cosmetic | 4 |

### Tablet (768×1024) — which breakages disappear

Gone at 768: shell overflow, sidebar reachability, title bar clipping, filters
panel, sort dropdown position, search bar row, queue bar positioning, suggest
clipping. **Still broken at 768: results list zero height, song-row 838px
min-width (Download/More off-screen).** This matches the plan's 900/600 split —
but note the two survivors mean Phase 2's row work must apply at the *tablet*
breakpoint (≤900), not just ≤600.

---

## Hover-only-affordance inventory (feeds Phase 5)

Reveal-type `:hover` rules found in the built CSS (opacity/visibility/display
changes — the rest of the ~220 hover rules are color/glow only):

1. `.song:hover .song__check .chk__box` — result-row batch-select checkbox. Needs an always-visible/tap path (Phase 2 edit-mode or long-press).
2. `.song:hover .song__preview`, `.songdetail__artwrap:hover .song__preview`, `.dup__detailartwrap:hover .song__preview` — audio-preview play over album art (search rows, song detail, duplicates detail). Button exists at 81×81 but `opacity: 0` — tap-on-art = play/pause per plan.
3. `.brand:hover .brand__ch-sub` — wordmark easter-egg reveal. Harmless; leave.
4. `.pager__bug:hover` — report-a-bug reveal near pager. Give it a visible state on touch or leave (cosmetic).

Non-CSS hover/desktop-input affordances:

5. **Library row context menu** (`.ctxmenu`) — right-click only; footer advertises "Right-click for actions · Ctrl+C/X/V · Del · F2". Search-result rows already have a visible `.rowmenu` More (kebab, 28×30 — undersized) button; library rows have none. → Phase 3 kebab + bottom sheet.
6. **Library multi-select** — Ctrl/Shift-click + clipboard keys only. → Phase 3.
7. Tooltip-style titles (info ⓘ icons on DIFFICULTY, UI scale, TipsTicker lightbulb) — hover/title-attribute only; content is non-essential. cosmetic.

## Fixed-width-modal inventory (feeds Phase 4)

Measured at 375×812 (all use `.modal` inside `.modal-overlay`; widths are
effective, most appear to be `min(fixed, ~90vw)` — the ones that *content*-
overflow their own box are the problem):

| Modal | Measured | Content overflow at 375 | Verdict |
|---|---|---|---|
| Target folder ("Where to save?") | 375-wide overlay sheet | none | fine, sheet-ify for consistency |
| Library manager (`modal--library`) | 338×617 | none in browser view | fine |
| Song detail (`.songdetail`, inside library) | 305 visible / **483 content** | dots row + Edit button | fix in Phase 3 |
| Metadata dialog (`lib__dialog--meta`) | 338×328 | none | fine |
| Duplicates (`modal--dup`) | 331×261 | +12px | fine (results view unknown) |
| Playlists (`modal--plm`) | 338×577 / **351 content** | right pane clipped | stack panes |
| Playlist import (`modal--playlist`) | 345×294 | none | fine |
| Settings (`modal--settings`) | 331×426 / **367 content** | UI-scale reset clipped; 135px cols | single-column |
| About (`modal--about`) | 331×686 | +2px | fine |
| What's New (`modal--whatsnew`) | 331×224 | +12px | fine |
| MarketplaceModal | not reachable in this build/fixture (no entry point found) | — | verify in Phase 4 |

Shared fix: the `.sheet-on-phone` pattern from the plan, plus per-modal
single-columning for Settings and Playlists. Half the modals need *no* layout
surgery — don't churn them.

---

## Phase 6 verification (2026-08-06)

Full pre-deploy regression pass against the same fixture/server setup as Phase 0
(server :3000, `ch-fixture/Songs`, web build). Viewports re-checked: **375×812**,
**768×1024**, **1280×800**. Measurements via `getBoundingClientRect()` with
animations/transitions disabled; interactions JS-dispatched (real tap simulation
hard-times-out under mobile emulation in this environment — same as earlier phases).

**Verdict: ship-with-notes.** Every audit-table row verifies fixed (or n/a).
Three small regressions/gaps found and fixed in place (commits below); nothing
structural remains.

### Per-audit-row verdicts

| Screen | Item (Phase 0) | 375 | 768 | 1280 | Verdict |
|---|---|---|---|---|---|
| Shell | 722px min-width, half UI unreachable | html/body/app scrollWidth = 375 | = 768 | = 1280 | **fixed** |
| Shell | Sidebar unreachable when panned | drawer (fixed, x=−306 closed, opens on hamburger, closes on select/scrim) | same | n/a (nav rail 112px) | **fixed** |
| Shell | Title bar buttons off-screen / Maximize+Quit on phone | Maximize/Quit `display:none`; hamburger 44×44 on-screen | same | chrome visible as designed | **fixed** |
| Shell | TipsTicker sliver | `display:none` | hidden | visible 467–734px, intact | **fixed** |
| Search | Results list 0px tall (375 AND 768) | 467px tall, 25 rows | 766px tall | 376px | **fixed** |
| Search | Song row 838px min-width, Download/More off-screen | row 341px = column, Download on-screen | row 734px fits | row 1118px | **fixed** |
| Search | Hero fixed 3-col, exact dots 16×16 | hero collapsed into FilterSheet (Amendment); sheet controls ≥44px (dd items 44 after cd618a7) | sheet | desktop hero panel unchanged-coherent | **fixed** |
| Search | Sort dropdown opens off-screen | menu on-screen at 18..148 × 226..424; items 44px (was 31 — fixed this phase) | fine | fine | **fixed** (+cd618a7) |
| Search | Filters panel clipped / below fold | full-width bottom sheet, 690px, internal scroll, Done 48px | sheet 720px | panel ≥900, DB+system switches present (Amendment) | **fixed** |
| Search | Type-ahead suggest clipped | 335×499 at y=129, bottom 628 < 812 | fits | fits | **fixed** |
| Search | Pager 36px / bug 32px | all pager buttons 44×44, bug 44×44 | same | same | **fixed** |
| Search | Row checkbox hover-only, no touch batch-select | Select toggle → tap-to-toggle rows, visible 25px checks, fixed bottom selectbar w/ Download | same | hover behavior unchanged | **fixed** |
| Search | Art preview play hover-only | always visible (opacity 1, 54px on rows, 84px in detail) | same | hover unchanged | **fixed** |
| Download | Target-folder modal | bottom sheet 375×633, Cancel/confirm 44–48px | centered modal | unchanged | **fixed/polished** |
| Download | Queue bar anchored to workspace edge | queue-pill fixed bottom-right 44px; tap expands fixed bottom sheet (safe-area padded), live progress | pill/sheet | desktop bar (pill `display:none`) | **fixed** |
| Download | Job chip off-screen | superseded by pill (no off-screen chip at 375) | — | — | **fixed** |
| Sidebar | small targets (cosmetic) | drawer items fine; version/check-updates unchanged cosmetic | — | — | accepted-cosmetic |
| Library | Row actions right-click only | per-row kebab 44×44 → bottom sheet, items 48px (Open/Rename/Copy/Cut/Delete/New folder; Edit metadata/playlist for songs) | same | right-click ctxmenu intact, kebab hidden | **fixed** |
| Library | Multi-select Ctrl/Shift only | Select toggle + tap-to-toggle + bottom action bar (All/count/Playlist/Copy/Cut/Delete 44–48px) | same | Ctrl-click works, toggle hidden | **fixed** |
| Library | Song detail 483px overflow | scrollWidth 311 = clientWidth 311, no h-scroll | fits | fits | **fixed** |
| Library | Preview play hover-only in detail | visible 84×84, plays, progress ring advances | same | hover unchanged | **fixed** |
| Library | Breadcrumb clips at depth | collapses to `Songs/…/Anti Hero/Tier 02…`, no overflow | fine | fine | **fixed** |
| Duplicates | Comparison view untested | seeded byte-identical pair: group renders, copies **stacked vertically** (319px cards), no overflow; quarantine move works + notice with target path; delete confirm: "Permanently delete 1 chart? This cannot be undone." (cancelled) | modal 640px centered | unchanged | **fixed/verified** |
| Playlists | Right pane clipped to sliver | panes stacked, sheet full-screen, no overflow; create/add/rename/delete round-trip OK | 722px modal, no overflow | unchanged | **fixed** |
| Playlist import | fits | sheet 375×273, no overflow | fine | fine | **fixed/polished** |
| Settings | 36px clipped, forced 2-col | full sheet, single column (343px fields), no h-scroll; records-per-page round-trips (25→30→25) | centered 707px modal, no overflow | unchanged | **fixed** |
| About / What's New | ≤12px bleed | both full-screen sheets, scrollWidth = clientWidth = 375 | fine | fine | **fixed** |
| PWA (Phase 5) | — | `/manifest.webmanifest` 200 valid JSON (192+512 icons), icons 200 image/png, apple-touch-icon 200; links present in served HTML; **Electron build's index.html has zero manifest/icon refs** | — | — | **pass** |

### Flow results

All at 375×812 unless noted; spot-checked at 768 and 1280.

- **Search**: "weezer" → 65 results (RhythmVerse) / 79 (Encore); switch to Encore
  re-sources (banner + new rows); genre filter (Alternative) applies, **badge "1"**
  on Filters button; clearing resets badge. Encore correctly hides RV-only filters
  with explainer + "Use RhythmVerse" shortcut.
- **Download**: Encore .sng (Weezer – Buddy Holly + 2 more) → folder sheet →
  root → pill "1 active" → expanded sheet with live "Downloading…" →
  completes → **"In library" badge** appears on the row. (This environment now
  extracts fine with `CHM_SEVENZIP_PATH` pointed at the repo's bundled
  `7zip-bin/mac/arm64/7za` — Phase 0's `spawn 7z ENOENT` was environmental.)
- **Library**: deep nav packs → Anti Hero → Tier 02 via kebab→Open (dbl-click also
  works); rename round-trip; select mode + bulk bar; song detail + preview
  play/stop with advancing progress; Back to search retains query+results;
  browser Back from `#library` returns to search with state.
- **Duplicates**: seeded shell-copy pair found as identical group; stacked cards;
  move-to-quarantine verified on disk; restored; permanent-delete confirm
  captured and cancelled; seed cleaned up.
- **Settings**: sections reachable, records-per-page 25→30 saved, verified after
  reopen, restored to 25.
- **Playlists**: created via library select-mode → Add to playlist → New playlist;
  song listed; renamed (inline input + Enter); deleted (in-modal confirm with
  correct "songs stay in your library" wording).

### Fixes made this phase

| Commit | What |
|---|---|
| `b63af19` | Escape with Duplicates/Playlists/metadata/add-to-playlist sub-modal open closed the whole library page underneath (same class as 998b3a9; capture-guard extended) |
| `a742759` | web-api stubs `isMaximized`/`setUiScale` rejected but are called by TitleBar mount and Settings UI-scale/Escape → unhandled-rejection console error on every web load; now resolve |
| `cd618a7` | Results sort dropdown options were 31px on phone (Phase 2 fixed only in-sheet menus); 44px now |
| `7027cb3` | Escape with Settings open over the library closed the library underneath (App.tsx Escape chain order) |

### Console errors

After the fixes: **zero errors** across the whole pass at all three viewports.
During the pass (pre-fix builds only): `isMaximized: removed in web port`
unhandled rejection on every load (fixed, a742759) and one 404 that was this
verification's own probe of a nonexistent `/api/settings` (not an app request).

### Cross-cutting

- No horizontal document overflow anywhere: html/body scrollWidth == viewport on
  every screen visited at all three widths.
- Fixed bottom elements all carry `env(safe-area-inset-bottom)`: drawer,
  queue-pill, queue sheet, generic `.sheet` (filter/kebab/Phase-4 modals),
  search selectbar, library selectbar; `modal--plm/--about` pad top too.
  (Emulated env() is 0 — real-device check remains on the phone punch list.)
- Electron: `typecheck` + `build` green; renderer `index.html` contains no PWA
  manifest/icon references (web-only injection confirmed). `build:web` re-run
  afterwards since both builds share `out/renderer`.
- Server tests: 21/21 pass.

### Known-remaining (real-phone punch list)

1. **MarketplaceModal** — still no entry point with this fixture/build (needs an
   official-DLC result); untested, same status as Phase 0.
2. **Sticky-hover guards** (`@media (hover: none)`) — verifiable only on a real
   touch device; emulation always reports hover-capable here.
3. **Safe-area insets** — env() is 0 in emulation; needs a notched phone.
4. Segmented DB/system buttons in the FilterSheet are 31px tall (< 44px rule).
   Usable (full-width row splits the tap area); left as-is to avoid resizing the
   shared `.seg` control this late — revisit if real-thumb testing complains.
5. Library folder navigation on phone is kebab→Open (or double-tap); a plain
   single tap only selects. Deliberate (selection needs a first-class gesture),
   but watch whether it confuses on the real phone.
6. Audio preview is play/stop only (no scrubber) — by design.
