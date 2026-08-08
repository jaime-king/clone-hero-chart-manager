import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Icon } from './Icon'
import { TipsTicker } from './TipsTicker'

/**
 * Horní řádek obsahu: textový brand „Chart Manager" vlevo, vpravo okenní
 * chrome (Electron) a hamburger (mobil). Navigace (Search / My Library /
 * Settings) žije v nav railu/draweru (Sidebar); verze + „check for updates"
 * dole v něm. Celý pruh je drag oblast okna.
 */
const isWeb = (window.api.platform as unknown as string) === 'web'

export function TitleBar(): JSX.Element {
  const setShowAbout = useStore((s) => s.setShowAbout)
  const setMobileNavOpen = useStore((s) => s.setMobileNavOpen)
  const [maximized, setMaximized] = useState(false)

  // Drž ikonu tlačítka v syncu se skutečným stavem okna (i když se maximalizuje
  // jinak — Aero Snap, Win+↑, dvojklik): main posílá `overlay:maximized`.
  useEffect(() => {
    void window.api.isMaximized().then(setMaximized)
    return window.api.onMaximizeChange(setMaximized)
  }, [])

  // Dvojklik na TAŽNOU část titlebaru = maximalizovat/obnovit (jako nativní okno).
  // Interaktivní prvky (tlačítka, tipy) přeskoč, ať se nepřekrývá s jejich akcí.
  const onDoubleClick = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest('button, a, input, [role="button"]')) return
    window.api.toggleMaximize()
  }

  return (
    <div className="titlebar" onDoubleClick={onDoubleClick}>
      {/* Logo = vstup do About. Titlebar je drag oblast, takže tlačítko musí mít
          `no-drag` (v CSS), jinak by ho okno „snědlo" a klik by netrefil. */}
      <button
        className="titlebar__left titlebar__brandbtn"
        title="About Chart Manager"
        onClick={() => setShowAbout(true)}
      >
        {/* Rytmická značka = 4 EQ pruhy v barvách nástrojů (matchuje brand/ikonu). */}
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="brand-text">
          <span className="brand-w1">Chart</span> <span className="brand-w2">Manager</span>
          <span className="brand-dot">.</span>
        </span>
      </button>

      <TipsTicker />

      {/* IA (Phase 3.5): My Library + Settings se přestěhovaly do navigace
          (nav rail na desktopu, drawer na mobilu) — rail/drawer je jediný
          navigační domov; titlebar = brand + okenní chrome + hamburger. */}
      <div className="titlebar__actions">
        {/* Okenní chrome jen v Electronu — v prohlížeči (platform 'web')
            nemá maximize/quit žádný význam, okno vlastní prohlížeč. */}
        {!isWeb && (
          <>
            <button
              className="titlebar__btn titlebar__btn--window"
              title={maximized ? 'Restore window' : 'Maximize window'}
              onClick={() => window.api.toggleMaximize()}
            >
              <Icon name={maximized ? 'restore' : 'maximize'} size={15} />
            </button>
            <button
              className="titlebar__btn titlebar__btn--close titlebar__btn--window"
              title="Quit program"
              onClick={() => window.api.quitApp()}
            >
              <Icon name="close" size={15} />
            </button>
          </>
        )}
        {/* Mobil (<900px, viz styles.css „MOBILE"): hamburger otevře drawer se
            Sidebar obsahem. Na desktopu je skrytý (sidebar je trvale vlevo). */}
        <button
          className="titlebar__btn titlebar__menu"
          title="Menu"
          aria-label="Open menu"
          onClick={() => setMobileNavOpen(true)}
        >
          <span className="titlebar__menu-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>
    </div>
  )
}
