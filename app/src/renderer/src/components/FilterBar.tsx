import { useState } from 'react'
import { useStore } from '../store'
import { INSTRUMENTS, MAX_DIFFICULTY } from '../utils'
import { DifficultyDots } from './DifficultyDots'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'

// Přípony, které pipeline umí zpracovat (archivy + .sng + Rock Band CON).
// Soubory BEZ přípony pouštíme dál a necháme backend rozhodnout podle magic
// bytů — některé hostingy stripují přípony (RB3 CON downloady z Mediafire
// často přijdou jen jako "ArtistTitle" bez .rb3con).
const ACCEPTED_EXT = /\.(zip|rar|7z|sng|rb3con|con)$/i

const LEVELS = Array.from({ length: MAX_DIFFICULTY + 1 }, (_, i) => i) // 0..6

export function FilterBar(): JSX.Element {
  const filters = useStore((s) => s.instrumentFilters)
  const toggle = useStore((s) => s.toggleInstrumentFilter)
  const diffMin = useStore((s) => s.diffMin)
  const diffMax = useStore((s) => s.diffMax)
  const setDiffRange = useStore((s) => s.setDiffRange)

  // Difficulty je použitelná vždy: s vybranými nástroji filtruje je, bez výběru
  // platí „jakýkoli nástroj v rozsahu".
  const anyInstrument = filters.length === 0
  const openLocalDrop = useStore((s) => s.openLocalDrop)
  const openLocalBatch = useStore((s) => s.openLocalBatch)
  const [dragOver, setDragOver] = useState(false)
  // Mobil (<900px): celý panel filtrů je defaultně sbalený do jednořádkového
  // přepínače, ať seznam výsledků dostane reálnou výšku (audit: results 0px na
  // 375 i 768). Na desktopu se přepínač nerenderuje vizuálně (CSS display:none)
  // a panel je vždy rozbalený.
  const [mobileOpen, setMobileOpen] = useState(false)
  const diffNarrowed = diffMin > 0 || diffMax < MAX_DIFFICULTY
  const activeCount = filters.length + (diffNarrowed ? 1 : 0)

  const handleDrop = (e: React.DragEvent<HTMLElement>): void => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length === 0) return
    const paths = files
      .map((f) => window.api.getDroppedFilePath(f))
      .filter((p): p is string => !!p)
    if (paths.length === 0) {
      window.alert('Could not read the file paths. Try again, or use the click-to-browse option.')
      return
    }

    // Jediný soubor s příponou → modal s potvrzením metadat (nejlepší UX).
    // Víc položek nebo složka → hromadná dávka (metadata z názvů, jeden výběr cíle).
    const single = files[0]
    const singleHasExt = /\.[a-z0-9]{1,8}$/i.test(single.name)
    if (paths.length === 1 && singleHasExt) {
      if (!ACCEPTED_EXT.test(single.name)) {
        window.alert(
          `Unsupported file: "${single.name}". Drop a .zip / .rar / .7z / .sng / Rock Band CON file, multiple files, or a folder.`
        )
        return
      }
      void openLocalDrop(paths[0], single.name)
      return
    }
    void openLocalBatch(paths)
  }

  return (
    <div className={`filterbar ${mobileOpen ? '' : 'filterbar--mobile-collapsed'}`}>
      <button
        type="button"
        className="filterbar__mobiletoggle"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
      >
        <Icon name="settings" size={15} />
        <span>Instruments &amp; difficulty</span>
        {activeCount > 0 ? <span className="filterbar__mobilecount">{activeCount}</span> : null}
        <Icon
          name="caret"
          size={14}
          className="filterbar__mobilecaret"
          style={{ transform: mobileOpen ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      <div className="fgroup fgroup--instruments">
        <div className="fgroup__label">Instruments</div>
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

      {/* Manual install (drag/drop + native file picker) is out of scope for
          the web port (docs/port/plan.md guardrail 4: getDroppedFilePath and
          dialog:chooseSongFile are `delete`, not rewritten as an upload flow —
          see docs/port/api-inventory.md rows #41/#42/#6/#7). web-api.ts's
          window.api.platform reports 'web' only in the web build (never a
          real NodeJS.Platform value an Electron preload would return), so
          this is a clean, build-target-scoped condition: the Electron app
          keeps the panel unconditionally, the web build never renders it. */}
      {/* Cast: web-api.ts's `platform` is typed as NodeJS.Platform to match the
          preload contract exactly, but returns the literal 'web' at runtime
          (see its comment) — a value TypeScript doesn't consider part of
          that type, hence the cast rather than a direct comparison. */}
      {(window.api.platform as unknown as string) !== 'web' && (
        <button
          type="button"
          className={`dropzone ${dragOver ? 'dropzone--hover' : ''}`}
          onClick={async () => {
            const picked = await window.api.chooseSongFile()
            if (picked) void openLocalDrop(picked.path, picked.name)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            setDragOver(true)
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragOver(false)
          }}
          onDrop={handleDrop}
        >
          <span className="dropzone__main">
            <Icon name="download" size={20} />
            <strong>
              Drop files or a folder,
              <br />
              or click to browse
            </strong>
          </span>
          <span className="dropzone__ext">.zip · .rar · .7z · .sng · .CON · .DTX</span>
        </button>
      )}
    </div>
  )
}
