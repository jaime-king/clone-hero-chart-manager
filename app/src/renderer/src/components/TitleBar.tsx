import { useStore } from '../store'
import { TipsTicker } from './TipsTicker'

/**
 * Horní řádek obsahu: textový brand „Chart Manager" vlevo, vpravo hamburger
 * (mobil). Navigace (Search / My Library / Settings) žije v nav
 * railu/draweru (Sidebar); verze dole v něm.
 */
export function TitleBar(): JSX.Element {
  const setShowAbout = useStore((s) => s.setShowAbout)
  const setMobileNavOpen = useStore((s) => s.setMobileNavOpen)

  return (
    <div className="titlebar">
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
