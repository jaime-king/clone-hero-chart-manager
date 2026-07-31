import { useEffect, useState } from 'react'
import { getPreviewAudioEl, getPreviewProgress, useStore } from '../store'
import { Icon } from './Icon'

/**
 * Přehrávací tlačítko přes obal alba u písně, kterou UŽ máme v knihovně
 * (Library manager, duplikáty). Vzhled i ovládání schválně stejné jako
 * u výsledků hledání — sdílí i CSS třídy `song__preview*`.
 *
 * Rozdíl je ve zdroji zvuku: tady hraje SKUTEČNÝ zvuk chartu z disku, ne
 * spárovaná ukázka z iTunes/Deezeru. U stopově dělených chartů se pustí
 * všechny stopy naráz (řeší store).
 */
export function LocalPreview({
  previewKey,
  rel,
  size = 15
}: {
  /** Odliší tlačítka mezi sebou (hrát smí vždy jen jedno). */
  previewKey: string
  /** Složka písně relativně ke knihovně (stejná konvence jako `lib:*` API). */
  rel: string
  size?: number
}): JSX.Element {
  const activeKey = useStore((s) => s.previewKey)
  const stateVal = useStore((s) => s.previewState)
  const toggleLocalPreview = useStore((s) => s.toggleLocalPreview)
  const active = activeKey === previewKey
  const state = active ? stateVal : 'idle'

  // Postup kroužku. Odebíráme jen když tohle tlačítko opravdu hraje, ať se
  // `timeupdate` (~4×/s) nepřekresluje do všech ostatních karet.
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!(active && state === 'playing')) {
      setProgress(0)
      return
    }
    const el = getPreviewAudioEl()
    if (!el) return
    const update = (): void => setProgress(getPreviewProgress())
    update()
    el.addEventListener('timeupdate', update)
    return () => el.removeEventListener('timeupdate', update)
  }, [active, state])

  // Zmizí-li tlačítko (zavření Library manageru / okna duplicit, přechod do jiné
  // složky), musí zvuk skončit s ním — elementy žijí ve store, takže by jinak
  // hrály dál do prázdna.
  useEffect(() => {
    return () => {
      const s = useStore.getState()
      if (s.previewKey === previewKey) s.stopPreview()
    }
  }, [previewKey])

  const title =
    state === 'playing'
      ? 'Playing the chart audio — click to stop'
      : state === 'loading'
        ? 'Loading audio…'
        : state === 'unavailable'
          ? 'No audio files in this song folder'
          : state === 'error'
            ? 'Playback failed — click to retry'
            : 'Play a 30s preview of the actual chart audio'

  return (
    <button
      type="button"
      className={`song__preview song__preview--${state} ${active ? 'song__preview--active' : ''}`}
      style={state === 'playing' ? ({ '--pv': progress } as React.CSSProperties) : undefined}
      onClick={(e) => {
        // Karta songu bývá sama klikací (výběr / rozbalení) — klik na přehrávání
        // tam propadnout nesmí.
        e.stopPropagation()
        void toggleLocalPreview(previewKey, rel)
      }}
      title={title}
      aria-label={title}
    >
      {state === 'playing' ? <span className="song__preview-ring" aria-hidden="true" /> : null}
      {state === 'loading' ? (
        <span className="song__preview-spin" aria-hidden="true" />
      ) : (
        <Icon
          name={state === 'playing' ? 'pause' : state === 'unavailable' ? 'previewOff' : 'play'}
          size={size}
        />
      )}
    </button>
  )
}
