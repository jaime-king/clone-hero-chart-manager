import { useStore } from '../store'
import { INSTRUMENTS, MAX_DIFFICULTY } from '../utils'
import { DifficultyDots } from './DifficultyDots'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'

const LEVELS = Array.from({ length: MAX_DIFFICULTY + 1 }, (_, i) => i) // 0..6

/** Kruhová tlačítka nástrojů — sdílená mezi hero panelem (desktop) a mobilním
 *  filter-sheetem (FilterSheet). Stav žije ve store, takže obě místa jsou vždy
 *  synchronní. */
export function InstrumentButtons(): JSX.Element {
  const filters = useStore((s) => s.instrumentFilters)
  const toggle = useStore((s) => s.toggleInstrumentFilter)
  return (
    <div className="instbtns">
      {INSTRUMENTS.map((inst) => {
        const active = filters.includes(inst.id)
        return (
          <button
            key={inst.id}
            className={`instbtn ${active ? 'instbtn--active' : ''}`}
            onClick={() => toggle(inst.id)}
            style={
              {
                '--inst-color': inst.color
              } as React.CSSProperties
            }
          >
            <span className="instbtn__circle">
              <Icon name={inst.icon} size={28} color={inst.color} />
            </span>
            <span className="instbtn__label">{inst.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function FilterBar(): JSX.Element {
  const filters = useStore((s) => s.instrumentFilters)
  const diffMin = useStore((s) => s.diffMin)
  const diffMax = useStore((s) => s.diffMax)
  const setDiffRange = useStore((s) => s.setDiffRange)

  // Difficulty je použitelná vždy: s vybranými nástroji filtruje je, bez výběru
  // platí „jakýkoli nástroj v rozsahu".
  const anyInstrument = filters.length === 0
  // IA (Phase 3.5): na mobilu (<900px) je celý hero panel CSS-schovaný —
  // tytéž ovládací prvky žijí ve FilterSheet, který otevírá ikonové tlačítko
  // Filters v search baru. Dřívější „Filters & instruments" přepínač tady byl
  // duplikát toho tlačítka a je odstraněný.

  return (
    <div className="filterbar">
      <div className="fgroup fgroup--instruments">
        <div className="fgroup__label">Instruments</div>
        <InstrumentButtons />
      </div>

      <div className="fgroup fgroup--difficulty">
        <div className="fgroup__label">
          Difficulty
          <span
            className="info"
            title={
              anyInstrument
                ? 'Difficulty tier 0 (easiest) to 6 (hardest). With no instrument selected, shows songs where ANY instrument falls within this range. Select instruments to target them specifically.'
                : 'Filters the selected instruments by their difficulty tier (0 = easiest, 6 = hardest). Only songs whose selected instruments fall within this MIN–MAX range are shown.'
            }
          >
            <Icon name="info" size={13} />
          </span>
        </div>
        <div className="fgroup__row">
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
        </div>
      </div>

      <div className="fgroup fgroup--exact">
        <div className="fgroup__label">Exact&nbsp;&nbsp;Difficulty</div>
        <div className="fgroup__row fgroup__row--dots">
          <DifficultyDots disabled={false} />
        </div>
      </div>

    </div>
  )
}
