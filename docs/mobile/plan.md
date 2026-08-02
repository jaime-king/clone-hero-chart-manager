# Plan: Make Chart Manager mobile-friendly

**Repo:** `jaime-king/clone-hero-chart-manager`, branch `mobile` off `main`, one PR at the end.
**Goal:** the app at `chart.mess.nz` is genuinely usable from a phone — search, download, watch progress, browse the library, play previews — without degrading the desktop layout.

**Starting point (audited 2026-08-02):** viewport meta already present; `styles.css` (7,430 lines) has **no width breakpoints at all** (the only `@media` rules are `prefers-reduced-motion`), 220 `:hover` rules, fixed-width panels (e.g. 560px), a permanent left sidebar + custom title bar shell, context-menu (`RowMenu`) and hover-to-reveal interactions. ~30 components.

---

## Ground rules (paste into every subagent prompt)

1. **Desktop layout must not change.** Mobile styles are additive under `@media (max-width: …)` breakpoints; the existing rules become the ≥-breakpoint behaviour. Verify desktop appearance after every phase (browser at 1280×800).
2. Two breakpoints only: `--bp-tablet: 900px` (sidebar collapses) and `--bp-phone: 600px` (single-column, sheets). Don't invent more.
3. Touch targets ≥ 44×44 px on phone. No feature may be reachable **only** via hover or right-click at phone width — every hover affordance needs a visible-or-tap equivalent.
4. The Electron build shares this renderer: `cd app && npm run typecheck && npm run build && npm run build:web` must all stay green after every phase.
5. No new UI libraries. Plain CSS + existing React patterns. No CSS framework, no rewrite of styles.css — extend it.
6. Verification is in a real browser viewport (375×812 phone preset, 768×1024 tablet, 1280×800 desktop), against the local dev server + fixture library. Screenshots in the phase report.
7. Commit style as established; trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Push to `mobile`.

---

## Phase 0 — Baseline audit *(agent with browser tools, read-only)*

Run the app locally (server + `build:web`), open at 375×812, and walk every screen: search results, filters, sidebar, download queue, library manager (deep folder), song detail, duplicates modal, settings, playlist manager. Produce `docs/mobile/audit.md`: per screen — what breaks (overflow, unreachable controls, hover-only features, tiny targets), with a screenshot each. This document is the checklist Phases 1–5 work through and Phase 6 verifies against.

## Phase 1 — App shell *(the structural phase; do first, everything depends on it)*

- Sidebar → collapses to a **slide-in drawer** below `--bp-tablet`, opened by a hamburger in the title bar; full-height overlay with scrim, closes on selection/scrim tap.
- Title bar: hide the desktop window-chrome (maximize) below tablet; keep wordmark + My Library + Settings + hamburger. TipsTicker hidden on phone.
- Main content area single-column below phone breakpoint; global font-size/scale audit so nothing depends on the desktop UI-scale setting.
- Download queue bar → bottom sheet on phone (collapsed pill with count + progress, tap to expand).

## Phase 2 — Search & results

- `SongRow`: below phone width, switch the dense multi-column row to a two-line stacked card (art, title/artist, difficulty dots, download button). Batch-select via long-press or an edit-mode toggle — pick whichever needs less new code, document the choice.
- `SearchBar` + type-ahead: full-width, suggestions as a full-width sheet.
- `FilterBar`/`FilterPanel`/`SortSelect`/instrument circles: collapse into a single **Filters bottom sheet** on phone with the same controls stacked; active-filter count badge on the trigger.
- `Pager`: bigger touch targets, or infinite-scroll ONLY if trivially supported by existing paging API (don't build new paging machinery).

## Phase 3 — Library manager

- Folder browser single-column list on phone; counts stay visible.
- `RowMenu` context menu → per-row kebab (⋮) button opening the same menu as a bottom sheet at phone width (context menu stays for desktop).
- Multi-select: tap-to-toggle selection mode (long-press to enter), selection action bar pinned bottom.
- Song detail + `SongMetaDialog`: full-screen sheet on phone; audio preview controls with ≥44px tap targets and a visible play button (no hover reveal).

## Phase 4 — Modals & dialogs

Sweep every fixed-width modal (`DuplicatesModal`, `Settings`, `PlaylistManagerModal`, `PlaylistImportModal`, `TargetFolderModal`, `AboutModal`, `WhatsNew`, `MarketplaceModal`, dialogs): below phone width they become full-screen sheets (100dvw/100dvh, safe-area padded, sticky header with close). One shared CSS pattern (`.sheet-on-phone` or similar), applied per modal — not 10 bespoke implementations. DuplicatesModal's side-by-side comparison stacks vertically.

## Phase 5 — Touch & polish

- Hover-rule sweep: for each of the 220 `:hover` rules decide keep (harmless), pair with `:focus-visible`/`:active`, or replace (hover-reveal controls become always-visible at phone width). The audit doc from Phase 0 drives the "replace" list.
- `@media (hover: none)` guards where hover styles misfire on touch (sticky-hover bug).
- Album-art preview play: tap art = play/pause on touch devices.
- iOS quirks: `100dvh` not `100vh`, safe-area insets (`env(safe-area-inset-*)`), no 300ms-delay leftovers, momentum scroll in sheets.
- **PWA-lite:** manifest + icons so "Add to Home Screen" gives a standalone app window. No service worker / offline — the server is on the same LAN; caching adds staleness risk for zero benefit.

## Phase 6 — Verify end-to-end *(browser agent + Jaime on a real phone)*

- Agent: full walkthrough at 375×812 and 768×1024 against the fixture — every audit-doc item checked off, screenshots, plus desktop 1280×800 regression pass (layout unchanged).
- Deploy to the server (existing pipeline), then **HUMAN: Jaime tests on his actual phone** over the LAN — real touch, real Safari/Chrome quirks, real network. Punch list from that becomes the final fix commit(s).
- Merge PR.

---

## Decisions for Jaime (defaults chosen, veto now)

| # | Decision | Default |
|---|---|---|
| 1 | Phone nav pattern | Hamburger drawer (matches existing sidebar 1:1; bottom-tab bar would need information-architecture changes) |
| 2 | Result rows on phone | Stacked cards, not a squeezed table |
| 3 | PWA | Manifest-only (home-screen install), no offline/service worker |
| 4 | Pagination | Keep pager with bigger targets unless infinite scroll is trivial |
| 5 | Breakpoints | 900px / 600px |

## Sequencing and effort

0 → 1 → (2, 3, 4 in any order — parallel-safe: 2 lives in search components, 3 in library components, 4 in modal CSS; they share only the Phase 1 shell and the sheet pattern, so Phase 4 defines `.sheet-on-phone` FIRST if run in parallel with 3) → 5 → 6.

Phase 1 and the audit are the load-bearing work. Realistic shape: audit + shell in one sitting, the component phases one sitting each, then the real-phone punch list. The 7,430-line CSS file is the main risk — agents must extend it surgically, never reorganize it.
## Amendment (2026-08-02) — IA restructure from Jaime's first phone test

Jaime tested Phases 1+2 on his phone and redirected the plan. These decisions supersede the affected parts above. **The "desktop pixel-equivalent" ground rule is retired** — the new structure applies at ALL widths (his explicit choice); desktop still has to look coherent, but it changes.

1. **My Library becomes a full page, not a modal** — a real view the app navigates to, at every width. (He judged the modal "reasonably usable" on phone, but a page "makes more sense".)
2. **Sidebar becomes a navigation bar** — navigation-focused: Search/home, My Library, Settings, plus the remaining sidebar actions that are truly global (playlist import, Surprise me — judge and report). On phone this stays the drawer; on desktop it slims to a nav rail/bar.
3. **Database (RhythmVerse/Encore/Both) and system (CH/PS/RB/All) switches move out of the sidebar into the Filters surface** — they scope the *search*, so they belong with the filters: into the Phase 2 FilterSheet on phone AND the desktop FilterPanel.
4. **Header cleanup at phone width**: My Library + Settings buttons move into the drawer (title bar = wordmark + hamburger); the "FILTERS & INSTRUMENTS" disclosure is removed (duplicate of the Filters button — both already open the same sheet); Filters + Search compress to icon-only buttons inline with the search input (one row).
5. Library manager internals: phone state after Phase 3 is good enough — no further mobile library work beyond what Phase 3 shipped.

Phase 4 (modal sheet sweep) shrinks accordingly: LibraryManager leaves the modal list; remaining fixed-width modals still get the `.sheet` treatment. Phases 5–6 unchanged.
