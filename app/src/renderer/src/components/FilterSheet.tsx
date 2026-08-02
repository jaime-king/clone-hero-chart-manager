import { selectActiveFilterCount, useStore } from '../store'
import { MAX_DIFFICULTY } from '../utils'
import { DifficultyDots } from './DifficultyDots'
import { Dropdown } from './Dropdown'
import { FilterPanelFields } from './FilterPanel'
import { InstrumentButtons } from './FilterBar'
import { Icon } from './Icon'
import { SortSelect } from './SortSelect'

const LEVELS = Array.from({ length: MAX_DIFFICULTY + 1 }, (_, i) => i) // 0..6

/**
 * Mobilní (<900px) bottom sheet se VŠEMI filtry na jednom místě: řazení,
 * nástroje, obtížnost (rozsah + exact) a panel žánr/rok/délka/charter/album/
 * hide-owned (FilterPanelFields). Nahrazuje na mobilu jak rozbalený hero panel
 * (FilterBar), tak desktopovou roletu FilterPanel — otevírají ho oba jejich
 * spouštěče (hero přepínač a tlačítko Filters v search baru).
 *
 * Všechny filtry se aplikují okamžitě (stejné store akce jako na desktopu);
 * „Show results" jen sheet zavře. Na desktopu je sheet CSS-schovaný a nikdy
 * se neotevře (spouštěče jsou mobile-only).
 */
export function FilterSheet(): JSX.Element | null {
  const open = useStore((s) => s.mobileFiltersOpen)
  const setOpen = useStore((s) => s.setMobileFiltersOpen)
  const diffMin = useStore((s) => s.diffMin)
  const diffMax = useStore((s) => s.diffMax)
  const setDiffRange = useStore((s) => s.setDiffRange)
  const clearFilters = useStore((s) => s.clearFilters)
  const activeCount = useStore(selectActiveFilterCount)

  if (!open) return null

  return (
    <>
      <div className="sheet-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="sheet filtersheet" role="dialog" aria-modal="true" aria-label="Search filters">
        <div className="sheet__head">
          <span className="sheet__title">
            Filters
            {activeCount > 0 ? <span className="filterbar__mobilecount">{activeCount}</span> : null}
          </span>
          {activeCount > 0 ? (
            <button type="button" className="filtersheet__clear" onClick={() => clearFilters()}>
              <Icon name="close" size={11} /> Clear all
            </button>
          ) : null}
          <button
            type="button"
            className="sheet__close"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="sheet__body">
          <div className="fgroup filtersheet__group">
            <div className="fgroup__label">Sort</div>
            <SortSelect />
          </div>

          <div className="fgroup filtersheet__group">
            <div className="fgroup__label">Instruments</div>
            <InstrumentButtons />
          </div>

          <div className="fgroup filtersheet__group">
            <div className="fgroup__label">Difficulty</div>
            <div className="fgroup__row filtersheet__diffrow">
              <span className="diffpick">
                <span className="diffpick__cap">Min</span>
                <Dropdown
                  value={diffMin}
                  options={LEVELS}
                  ariaLabel="Minimum difficulty"
                  onChange={(v) => setDiffRange(v, diffMax)}
                />
              </span>
              <span className="diffpick">
                <span className="diffpick__cap">Max</span>
                <Dropdown
                  value={diffMax}
                  options={LEVELS}
                  ariaLabel="Maximum difficulty"
                  onChange={(v) => setDiffRange(diffMin, v)}
                />
              </span>
              <span className="diffpick filtersheet__exact">
                <span className="diffpick__cap">Exact</span>
                <DifficultyDots disabled={false} />
              </span>
            </div>
          </div>

          <div className="filtersheet__panel">
            <FilterPanelFields />
          </div>
        </div>

        <div className="sheet__foot">
          <button type="button" className="filtersheet__done" onClick={() => setOpen(false)}>
            Show results
          </button>
        </div>
      </div>
    </>
  )
}
