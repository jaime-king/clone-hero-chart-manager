import { useEffect, useState } from 'react'
import type { Database, RhythmVerseSystem, UpdateAvailable } from '../../../shared/types'
import { errMsg } from '../../../shared/errors'
import spotifyMark from '../assets/Spotify_Primary_Logo.webp'
import { useStore } from '../store'
import { Icon } from './Icon'

// Verzi, kterou uživatel „zavřel", si pamatujeme, ať ho stejné upozornění neotravuje.
const DISMISS_KEY = 'chm.updateDismissed'

// Levý panel (redesign v2 dle mockupu): svislé seznamy DATABASE a SYSTEM.
// Stejné chování jako dřívější Segmented přepínače v SearchBaru — jen jiné
// rozložení.

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

export function Sidebar(): JSX.Element {
  const mobileNavOpen = useStore((s) => s.mobileNavOpen)
  const setMobileNavOpen = useStore((s) => s.setMobileNavOpen)
  const database = useStore((s) => s.database)
  const setDatabase = useStore((s) => s.setDatabase)
  const system = useStore((s) => s.system)
  const setSystem = useStore((s) => s.setSystem)
  const query = useStore((s) => s.query)
  const doSearch = useStore((s) => s.doSearch)
  const surpriseMe = useStore((s) => s.surpriseMe)
  const setShowPlaylistImport = useStore((s) => s.setShowPlaylistImport)
  const openWhatsNew = useStore((s) => s.openWhatsNew)

  // Verze + celý životní cyklus aktualizace (přesunuto sem z horního pruhu):
  // ruční kontrola → dostupné → stahování → připraveno k restartu.
  const [version, setVersion] = useState('')
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'uptodate' | 'error'>('idle')
  const [available, setAvailable] = useState<UpdateAvailable | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    void window.api.appVersion().then(setVersion)
    const offAvail = window.api.onUpdateAvailable((i) => {
      if (localStorage.getItem(DISMISS_KEY) === i.version) return // tuhle verzi už zavřel
      setAvailable(i)
    })
    const offProg = window.api.onUpdateProgress((p) => setPercent(p.percent))
    const offDone = window.api.onUpdateDownloaded(() => {
      setDownloaded(true)
      setDownloading(false)
    })
    return () => {
      offAvail()
      offProg()
      offDone()
    }
  }, [])

  // Výsledek ruční kontroly („na latest verzi" / „nešlo zkontrolovat") sám zmizí
  // po pár sekundách — jinak by visel až do restartu aplikace.
  useEffect(() => {
    if (checkState !== 'uptodate' && checkState !== 'error') return undefined
    const id = setTimeout(() => setCheckState('idle'), 4000)
    return () => clearTimeout(id)
  }, [checkState])

  const checkUpdates = async (): Promise<void> => {
    setCheckState('checking')
    try {
      const res = await window.api.checkForUpdates()
      if (res.status === 'available' && res.version) {
        setAvailable({
          version: res.version,
          canAutoUpdate: res.canAutoUpdate ?? false,
          url: res.url
        })
        setCheckState('idle')
      } else {
        setCheckState(res.status === 'uptodate' ? 'uptodate' : 'error')
      }
    } catch {
      setCheckState('error')
    }
  }

  const dismissUpdate = (): void => {
    if (available) localStorage.setItem(DISMISS_KEY, available.version)
    setAvailable(null)
  }

  const downloadUpdate = async (): Promise<void> => {
    setDownloading(true)
    setPercent(0)
    try {
      const res = await window.api.downloadUpdate()
      if (!res.ok) {
        setDownloading(false)
        setPercent(null)
        window.alert(`Update download failed: ${res.error}`)
      }
    } catch (e) {
      setDownloading(false)
      setPercent(null)
      window.alert(`Update download failed: ${errMsg(e)}`)
    }
  }

  const showSystems = database !== 'enchor'

  return (
    <>
      {/* Mobil (<900px): scrim za drawerem — tap zavře. Na desktopu display:none. */}
      {mobileNavOpen ? (
        <div className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      ) : null}
      <aside
        className={`sidebar ${mobileNavOpen ? 'sidebar--open' : ''}`}
        // Výběr akce v draweru (jakékoli tlačítko) drawer zavře; na desktopu je
        // mobileNavOpen vždy false, takže je to no-op. Výjimka: patička s updaty —
        // její zpětná vazba („Checking…", průběh stahování) žije uvnitř draweru.
        onClick={(e) => {
          const t = e.target as HTMLElement
          if (mobileNavOpen && t.closest('button') && !t.closest('.side-footer'))
            setMobileNavOpen(false)
        }}
      >
      <div className="side-group">
        <div className="side-label">Database</div>
        <div className="side-list">
          {/* Klouzavé zvýraznění — plavně sjede na aktivní položku (index × 60 px:
              výška 52 + mezera 8). */}
          <span
            className="side-indicator"
            aria-hidden="true"
            style={{ transform: `translateY(${DATABASES.findIndex((d) => d.id === database) * 60}px)` }}
          />
          {DATABASES.map((d) => (
            <button
              key={d.id}
              type="button"
              title={d.hint}
              className={`side-item ${database === d.id ? 'side-item--on' : ''}`}
              onClick={() => {
                setDatabase(d.id)
                // Vždy re-search: prázdný dotaz výsledky vyčistí (RV/Both)
                // nebo přepne na browse-all (Encore) — žádné zatuchlé výsledky.
                void doSearch(1)
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {showSystems ? (
        <div className="side-group">
          <div className="side-label">System</div>
          <div className="side-list">
            <span
              className="side-indicator"
              aria-hidden="true"
              style={{ transform: `translateY(${SYSTEMS.findIndex((s) => s.id === system) * 60}px)` }}
            />
            {SYSTEMS.map((sys) => (
              <button
                key={sys.id}
                type="button"
                title={sys.hint}
                className={`side-item ${system === sys.id ? 'side-item--on' : ''}`}
                onClick={() => {
                  setSystem(sys.id)
                  // Re-search i v browse režimu (prázdný dotaz), ne jen u textu.
                  void doSearch(1)
                }}
              >
                {sys.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="side-sep side-sep--wide" aria-hidden="true" />

      {/* Akční tlačítka pod seznamy. „Surprise me" = náhodný chart (respektuje
          dotaz i filtry). „Import playlist" = dohledat charty z odkazu na playlist. */}
      <div className="side-actions">
        <button type="button" className="side-surprise" onClick={() => surpriseMe()}>
          <Icon name="dice" size={18} className="side-surprise__dice" />
          <span className="side-surprise__text">
            <span className="side-surprise__title">Surprise me</span>
            <span className="side-surprise__sub">Discover 5 random charts</span>
          </span>
        </button>

        <button
          type="button"
          className="side-surprise side-import"
          onClick={() => setShowPlaylistImport(true)}
        >
          <span
            className="side-import__logo"
            style={{ WebkitMaskImage: `url(${spotifyMark})`, maskImage: `url(${spotifyMark})` }}
            aria-hidden="true"
          />
          <span className="side-surprise__text">
            <span className="side-surprise__title">Import playlist</span>
            <span className="side-surprise__sub">Turn a playlist into charts</span>
          </span>
        </button>
      </div>

      <div className="side-footer">
        {downloaded && available ? (
          // Staženo → stačí restart. Zelený „ready" nádech + obíhající okraj.
          <div className="side-update-card side-update-card--ready side-update-card--live">
            <div className="side-update-card__title">Update ready</div>
            <div className="side-update-card__desc">
              v{available.version} downloaded. Restart to install it.
            </div>
            <button
              type="button"
              className="side-update-card__btn"
              onClick={() => void window.api.installUpdate()}
            >
              Restart &amp; install
            </button>
          </div>
        ) : downloading ? (
          // Stahování na pozadí → průběh.
          <div className="side-update-card">
            <div className="side-update-card__title">Downloading update</div>
            <div className="side-update-card__desc">
              v{available?.version} · {percent ?? 0}%
            </div>
            <div className="side-update-progress">
              <div className="side-update-progress__fill" style={{ width: `${percent ?? 0}%` }} />
            </div>
          </div>
        ) : available ? (
          // Dostupná nová verze → výrazné upozornění s obíhajícím okrajem.
          <div className="side-update-card side-update-card--live">
            <button
              type="button"
              className="side-update-card__close"
              onClick={dismissUpdate}
              title="Dismiss"
            >
              <Icon name="close" size={12} />
            </button>
            <div className="side-update-card__title">Update available</div>
            <div className="side-update-card__desc">
              Version {available.version} is ready to install.
            </div>
            {available.canAutoUpdate ? (
              <button
                type="button"
                className="side-update-card__btn"
                onClick={() => void downloadUpdate()}
              >
                Download update
              </button>
            ) : (
              <button
                type="button"
                className="side-update-card__btn"
                onClick={() => available.url && window.api.openExternal(available.url)}
              >
                View release
              </button>
            )}
          </div>
        ) : (
          // Klidový stav → verze + ruční kontrola.
          <>
            {/* Verze je klikací → otevře „What's new" (bez `since` = poslední
                vydání). Jediná cesta, jak se k poznámkám dostat i bez updatu. */}
            <button
              type="button"
              className="side-version"
              title="See what's new in this version"
              onClick={() => openWhatsNew()}
            >
              version {version || '…'}
            </button>
            <button
              type="button"
              className="side-update"
              onClick={() => void checkUpdates()}
              disabled={checkState === 'checking'}
            >
              {checkState === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
            {checkState === 'uptodate' ? (
              <span className="side-update__result side-update__result--uptodate">
                You&apos;re on the latest version.
              </span>
            ) : checkState === 'error' ? (
              <span className="side-update__result side-update__result--error">
                Couldn&apos;t check right now.
              </span>
            ) : null}
          </>
        )}
      </div>
      </aside>
    </>
  )
}
