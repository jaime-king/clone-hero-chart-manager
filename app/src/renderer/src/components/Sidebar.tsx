import { useEffect, useState } from 'react'
import spotifyMark from '../assets/Spotify_Primary_Logo.webp'
import { useStore } from '../store'
import { Icon } from './Icon'

// IA (Phase 3.5): levý panel je NAVIGACE — Search / My Library / Settings +
// globální akce (Surprise me, Import playlist) a patička s verzí. Database/
// System přepínače se přestěhovaly do filtrů (FilterPanel/FilterSheet) —
// scopují vyhledávání, ne aplikaci. Na desktopu kompaktní nav rail (ikony +
// popisky), na mobilu (<900px) tentýž obsah jako slide-in drawer.

export function Sidebar(): JSX.Element {
  const mobileNavOpen = useStore((s) => s.mobileNavOpen)
  const setMobileNavOpen = useStore((s) => s.setMobileNavOpen)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const surpriseMe = useStore((s) => s.surpriseMe)
  const setShowPlaylistImport = useStore((s) => s.setShowPlaylistImport)
  const openWhatsNew = useStore((s) => s.openWhatsNew)

  // Verze v patičce (aktualizace řeší nový container image, ne aplikace sama).
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.appVersion().then(setVersion)
  }, [])

  return (
    <>
      {/* Mobil (<900px): scrim za drawerem — tap zavře. Na desktopu display:none. */}
      {mobileNavOpen ? (
        <div className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      ) : null}
      <aside
        className={`sidebar ${mobileNavOpen ? 'sidebar--open' : ''}`}
        // Výběr akce v draweru (jakékoli tlačítko) drawer zavře; na desktopu je
        // mobileNavOpen vždy false, takže je to no-op.
        onClick={(e) => {
          const t = e.target as HTMLElement
          if (mobileNavOpen && t.closest('button')) setMobileNavOpen(false)
        }}
      >
      {/* Navigace: Search (domů) / My Library (stránka) / Settings (modal). */}
      <nav className="side-nav" aria-label="Main navigation">
        <button
          type="button"
          className={`side-navitem ${view === 'search' ? 'side-navitem--on' : ''}`}
          title="Search & download charts"
          onClick={() => setView('search')}
        >
          <Icon name="search" size={18} className="side-navitem__icon" />
          <span className="side-navitem__label">Search</span>
        </button>
        <button
          type="button"
          className={`side-navitem ${view === 'library' ? 'side-navitem--on' : ''}`}
          title="Browse and manage your Songs library: folders, metadata, playlists, duplicates"
          onClick={() => setView('library')}
        >
          <Icon name="folder" size={18} className="side-navitem__icon" />
          <span className="side-navitem__label">My Library</span>
        </button>
        <button
          type="button"
          className="side-navitem"
          title="Settings"
          onClick={() => setShowSettings(true)}
        >
          <Icon name="settings" size={18} className="side-navitem__icon" />
          <span className="side-navitem__label">Settings</span>
        </button>
      </nav>

      <div className="side-sep side-sep--wide" aria-hidden="true" />

      {/* Globální akce. „Surprise me" = náhodný chart (respektuje dotaz i
          filtry) — přepne na search pohled, výsledek je vidět tam. „Import
          playlist" = dohledat charty z odkazu na playlist. */}
      <div className="side-actions">
        <button
          type="button"
          className="side-surprise"
          title="Discover 5 random charts"
          onClick={() => {
            setView('search')
            surpriseMe()
          }}
        >
          <Icon name="dice" size={18} className="side-surprise__dice" />
          <span className="side-surprise__text">
            <span className="side-surprise__title">Surprise me</span>
            <span className="side-surprise__sub">Discover 5 random charts</span>
          </span>
        </button>

        <button
          type="button"
          className="side-surprise side-import"
          title="Turn a playlist into charts"
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
        {/* Verze je klikací → otevře „What's new" (bez `since` = poslední
            vydání). Jediná cesta, jak se k poznámkám dostat. */}
        <button
          type="button"
          className="side-version"
          title="See what's new in this version"
          onClick={() => openWhatsNew()}
        >
          version {version || '…'}
        </button>
      </div>
      </aside>
    </>
  )
}
