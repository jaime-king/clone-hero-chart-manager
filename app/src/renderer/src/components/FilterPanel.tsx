import { useEffect, useRef, useState } from 'react'
import type { Database, FilterOption, RhythmVerseSystem } from '../../../shared/types'
import { useStore } from '../store'
import { Icon } from './Icon'
import { Segmented } from './Segmented'

// IA (Phase 3.5): Database/System se přestěhovaly ze Sidebaru sem — scopují
// vyhledávání, tak patří k filtrům. Stejné chování jako v Sidebaru: přepnutí
// vždy re-search od 1. stránky (prázdný dotaz = browse katalogu, žádné
// zatuchlé výsledky). V badge počtu filtrů NEJSOU — jsou to přepínače režimu,
// ne zužující filtry (selectActiveFilterCount je nikdy nepočítal).

const DATABASES: { id: Database; label: string; hint: string }[] = [
  { id: 'rhythmverse', label: 'RhythmVerse', hint: 'Largest catalogue — CH, Phase Shift and Rock Band CON' },
  { id: 'enchor', label: 'Chorus Encore', hint: 'Curated Clone Hero charts hosted directly as .sng files' },
  { id: 'both', label: 'Both', hint: 'Merged & de-duplicated results from both sources' }
]

const SYSTEMS: { id: RhythmVerseSystem; label: string; hint: string }[] = [
  { id: 'ch', label: 'Clone Hero', hint: 'Native charts (no conversion)' },
  { id: 'ps', label: 'Phase Shift', hint: 'Read by Clone Hero directly' },
  { id: 'rb3', label: 'Rock Band', hint: 'CON → converted to CH' },
  { id: 'all', label: 'All', hint: 'All formats' }
]

/** Přepínače zdroje (Database + System) — sdílené mezi desktopovým FilterPanel
 *  a mobilním FilterSheet (přes FilterPanelFields). Stav žije ve store. */
function SourceSwitches(): JSX.Element {
  const database = useStore((s) => s.database)
  const setDatabase = useStore((s) => s.setDatabase)
  const system = useStore((s) => s.system)
  const setSystem = useStore((s) => s.setSystem)
  const doSearch = useStore((s) => s.doSearch)

  return (
    <div className="srcswitch">
      <div className="srcswitch__group">
        <span className="filterfield__label">Database</span>
        <Segmented
          variant="db"
          options={DATABASES}
          value={database}
          onChange={(id) => {
            setDatabase(id)
            void doSearch(1)
          }}
        />
      </div>
      {database !== 'enchor' ? (
        <div className="srcswitch__group">
          <span className="filterfield__label">System</span>
          <Segmented
            options={SYSTEMS}
            value={system}
            onChange={(id) => {
              setSystem(id)
              void doSearch(1)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Jednovýběrový select (id + label) laděný jako obecný `.dd`, s prázdnou volbou.
 * Menu se vykresluje bez ořezu (panel nemá overflow:hidden).
 */
function FilterSelect({
  label,
  placeholder,
  value,
  options,
  onChange
}: {
  label: string
  placeholder: string
  value: string
  options: FilterOption[]
  onChange: (v: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const current = options.find((o) => o.id === value)

  return (
    <label className="filterfield">
      <span className="filterfield__label">{label}</span>
      <div className={`dd dd--filter ${open ? 'dd--open' : ''}`} ref={ref}>
        <button type="button" className="dd__btn" onClick={() => setOpen((o) => !o)}>
          <span className={current ? '' : 'dd__placeholder'}>
            {current ? current.label : placeholder}
          </span>
          <Icon name="caret" size={11} className="dd__caret" />
        </button>
        {open ? (
          <ul className="dd__menu dd__menu--scroll" role="listbox">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                className={`dd__item ${value === '' ? 'dd__item--sel' : ''}`}
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                {placeholder}
              </button>
            </li>
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  className={`dd__item ${o.id === value ? 'dd__item--sel' : ''}`}
                  onClick={() => {
                    onChange(o.id)
                    setOpen(false)
                  }}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </label>
  )
}

/** Textové zúžení (charter / album) — filtruje NAČTENÉ výsledky (contains). */
function FilterText({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string
  value: string
  placeholder: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <label className="filterfield">
      <span className="filterfield__label">{label}</span>
      <input
        className="filterfield__input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

/**
 * Vnitřek filtrovacího panelu (browse dropdowny + refine pole + hide-owned +
 * clear) BEZ obálky/animace. Sdílený mezi desktopovým FilterPanel (roleta pod
 * search barem) a mobilním FilterSheet (bottom sheet) — stav žije ve store,
 * takže obě místa jsou vždy synchronní.
 */
export function FilterPanelFields(): JSX.Element {
  const filters = useStore((s) => s.filters)
  const options = useStore((s) => s.filterOptions)
  const database = useStore((s) => s.database)
  const setFilter = useStore((s) => s.setFilter)
  const clearFilters = useStore((s) => s.clearFilters)
  const setDatabase = useStore((s) => s.setDatabase)
  const doSearch = useStore((s) => s.doSearch)

  const charter = useStore((s) => s.charterFilter)
  const album = useStore((s) => s.albumFilter)
  const hideOwned = useStore((s) => s.hideOwned)
  const setCharter = useStore((s) => s.setCharterFilter)
  const setAlbum = useStore((s) => s.setAlbumFilter)
  const setHideOwned = useStore((s) => s.setHideOwned)

  const encoreOnly = database === 'enchor'
  const anyBrowse = !!(
    filters.genre?.length ||
    filters.year?.length ||
    filters.decade?.length ||
    filters.songLength?.length
  )
  const anyRefine = !!(charter || album || hideOwned)
  const anyActive = anyBrowse || anyRefine

  const one = (key: 'genre' | 'year' | 'decade' | 'songLength'): string => filters[key]?.[0] ?? ''
  const set =
    (key: 'genre' | 'year' | 'decade' | 'songLength') =>
    (v: string): void =>
      setFilter(key, v ? [v] : [])

  // Vyčistí VŠECHNY filtry naráz (kanonický clear ve store — nástroj/obtížnost
  // i žánr/rok/délka/charter/album/hideOwned).
  const clearAll = (): void => clearFilters()

  return (
    <>
      <SourceSwitches />

      {encoreOnly ? (
        <div className="filterpanel__encore">
          <Icon name="info" size={16} />
          <span>
            Genre, year, decade and length browsing uses <strong>RhythmVerse</strong>. Chorus Encore
            filters by instrument (buttons above).
          </span>
          <button
            type="button"
            className="filterpanel__switch"
            onClick={() => {
              setDatabase('rhythmverse')
              void doSearch(1)
            }}
          >
            Use RhythmVerse
          </button>
        </div>
      ) : (
        <div className="filterpanel__grid">
          <FilterSelect
            label="Genre"
            placeholder="Any genre"
            value={one('genre')}
            options={options?.genre ?? []}
            onChange={set('genre')}
          />
          <FilterSelect
            label="Release year"
            placeholder="Any year"
            value={one('year')}
            options={options?.year ?? []}
            onChange={set('year')}
          />
          <FilterSelect
            label="Decade"
            placeholder="Any decade"
            value={one('decade')}
            options={options?.decade ?? []}
            onChange={set('decade')}
          />
          <FilterSelect
            label="Song length"
            placeholder="Any length"
            value={one('songLength')}
            options={options?.songLength ?? []}
            onChange={set('songLength')}
          />
        </div>
      )}

      <div className="filterpanel__grid filterpanel__grid--refine">
        <FilterText label="Charter" value={charter} placeholder="e.g. Chezy" onChange={setCharter} />
        <FilterText label="Album" value={album} placeholder="e.g. Meteora" onChange={setAlbum} />
      </div>

      <div className="filterpanel__foot">
        <label className="chk filterpanel__owned">
          <input
            type="checkbox"
            checked={hideOwned}
            onChange={(e) => setHideOwned(e.target.checked)}
          />
          <span className="chk__box">
            <Icon name="check" size={12} />
          </span>
          <span>Hide songs I already have</span>
        </label>
        {anyActive ? (
          <button type="button" className="filterpanel__clear" onClick={clearAll}>
            <Icon name="close" size={12} /> Clear filters
          </button>
        ) : null}
      </div>
    </>
  )
}

/**
 * Jeden sjednocený filtrovací panel (desktop — roleta pod search barem). Nahoře
 * „browse" (žánr / rok / délka — serverově, jen RhythmVerse), pod tím „refine"
 * (charter / album / skrýt vlastněné — klientsky nad načtenými výsledky, funguje
 * i na Encore). Nahrazuje dřívější samostatné „Refine" tlačítko v liště výsledků.
 * Na mobilu (<900px) je celý panel schovaný — tytéž ovládací prvky žijí ve
 * FilterSheet (bottom sheet).
 */
export function FilterPanel(): JSX.Element {
  const show = useStore((s) => s.showFilters)

  // Overflow povolíme až PO dovysunutí rolety (jinak by se rozbalovací menu
  // ořezávalo o panel); při zavírání ho hned skryjeme, ať roleta pěkně zajede.
  const [expanded, setExpanded] = useState(show)
  useEffect(() => {
    if (!show) {
      setExpanded(false)
      return undefined
    }
    const t = setTimeout(() => setExpanded(true), 300)
    return () => clearTimeout(t)
  }, [show])

  return (
    <div className={`filterpanel ${show ? 'filterpanel--open' : ''}`} aria-hidden={!show}>
      <div className={`filterpanel__inner ${show && expanded ? 'filterpanel__inner--open' : ''}`}>
        <FilterPanelFields />
      </div>
    </div>
  )
}
