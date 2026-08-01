import { useEffect, useState } from 'react'
import {
  DEFAULT_FOLDER_TEMPLATE,
  FOLDER_TAGS,
  previewFolderPath,
  type FolderTagSource
} from '../../../shared/foldertemplate'
import type { AppConfig } from '../../../shared/types'
import { useStore } from '../store'
import { IS_MAC } from '../platform'
import { HotkeyInput } from './HotkeyInput'
import { Icon } from './Icon'

// Ukázková píseň pro náhled šablony. Má VYPLNĚNÉ všechny tagy, ať je hned vidět,
// co která značka udělá.
const SAMPLE_SONG: FolderTagSource = {
  artist: 'Metallica',
  title: 'Master of Puppets',
  album: 'Master of Puppets',
  genre: 'Metal',
  year: 1986,
  charter: 'Nickmein'
}

// Druhý náhled = píseň s CHYBĚJÍCÍMI metadaty (spousta chartů žánr/rok nemá).
// Ukáže, že prázdné podsložky se zahodí, místo aby vznikly složky „Unknown".
const SPARSE_SONG: FolderTagSource = {
  artist: 'Some Band',
  title: 'Untitled Demo',
  album: '',
  genre: '',
  year: null,
  charter: null
}

// Tagy, které reálný chart nemusí mít vyplněné. `{artist}`/`{title}` tu schválně
// NEJSOU — ty má prakticky vždycky.
const DROPPABLE_TAG_RE = /\{(genre|year|album|charter)\}/i

/**
 * Náhled = SKUTEČNÁ cesta na disku, od nastavené Songs složky.
 *
 * Proto zpětná lomítka, i když se šablona píše s `/`: v šabloně je `/` vstupní
 * syntaxe (a parser bere obojí), kdežto tady jde o cestu ve Windows, jakou uvidíš
 * v Průzkumníku. Ukázat plnou cestu je to, co ten rozdíl vysvětlí samo — půlka
 * cesty („Songs\…") vypadala jen jako nekonzistentní lomítko proti poli výše.
 */
function previewFullPath(song: FolderTagSource, template: string, songsDir: string): string {
  const base = (songsDir || '').replace(/[\\/]+$/, '') || 'Songs'
  return `${base}\\${previewFolderPath(song, template)}`
}


export function Settings(): JSX.Element | null {
  const show = useStore((s) => s.showSettings)
  const config = useStore((s) => s.config)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const saveConfig = useStore((s) => s.saveConfig)
  const [draft, setDraft] = useState<AppConfig | null>(config)
  // Šablona složky je zabalená (pokročilé) — stav si drží napříč otevřeními okna,
  // ať to kdo ji používá nemusí rozklikávat pořád dokola.
  const [tplOpen, setTplOpen] = useState(false)
  // Reset rozdělaných změn na uložený config při KAŽDÉM otevření okna (i po
  // změně configu). Komponenta se nemountuje znovu (jen vrací null), takže bez
  // tohohle by neuložené úpravy po Cancel/kliku mimo přežily do dalšího otevření.
  useEffect(() => {
    if (show) setDraft(config)
  }, [show, config])

  // UI scale: clamp 0.7–1.6, živý náhled přes IPC (uloží se až na Save).
  const setScale = (next: number): void => {
    const clamped = Math.min(1.6, Math.max(0.7, Math.round(next * 10) / 10))
    setDraft((d) => (d ? { ...d, uiScale: clamped } : d))
    void window.api.setUiScale(clamped)
  }

  // Zavření bez uložení → zahoď živý náhled a vrať uloženou škálu.
  const cancelSettings = (): void => {
    void window.api.setUiScale(config?.uiScale ?? 1)
    setShowSettings(false)
  }

  if (!show || !draft) return null

  const pickDir = async (key: 'songsDir') => {
    const dir = await window.api.chooseDirectory()
    if (dir) setDraft({ ...draft, [key]: dir })
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        // Zavři jen když stisk začal přímo na pozadí (ne tažením z inputu ven).
        if (e.target === e.currentTarget) cancelSettings()
      }}
    >
      <div className="modal modal--settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>Settings</h2>
          <button className="modal__close" onClick={cancelSettings}>
            ✕
          </button>
        </div>

        <div className="modal__body settings-body">
          <div className="settings-cols">
            <div className="settings-col">
              <section className="settings-group">
                <h3 className="settings-group__title">Library &amp; paths</h3>
          <label className="field">
            <span>Songs folder (Clone Hero library)</span>
            <div className="field__row">
              <input
                value={draft.songsDir}
                onChange={(e) => setDraft({ ...draft, songsDir: e.target.value })}
              />
              <button onClick={() => pickDir('songsDir')}>…</button>
            </div>
          </label>

          {/* Zabalené: běžný uživatel tohle nepotřebuje (výchozí šablona = chování
              odjakživa) a v nastavení by ho to jen mátlo. Kdo to zná z Bridge nebo
              si chce knihovnu třídit sám, si to rozklikne. Zavřený stav ukazuje
              aktuální šablonu, ať je vidět i bez otevírání. */}
          <fieldset className="field field--disc">
            {IS_MAC ? (
              // macOS: sekci necháváme napevno otevřenou (bez rozklikávání).
              <div className="disc__head disc__head--static">
                <span className="disc__titles">
                  <span className="disc__title">
                    Chart folder name
                    <span className="disc__badge">Optional</span>
                  </span>
                  <span className="disc__sub">
                    Naming and sorting of downloaded charts: <code>{draft.folderTemplate}</code>
                  </span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                className="disc__head"
                aria-expanded={tplOpen}
                onClick={() => setTplOpen((o) => !o)}
              >
                <span className="disc__titles">
                  <span className="disc__title">
                    Chart folder name
                    <span className="disc__badge">Optional</span>
                  </span>
                  <span className="disc__sub">
                    Naming and sorting of downloaded charts: <code>{draft.folderTemplate}</code>
                  </span>
                </span>
                <Icon name="caret" size={12} className="disc__caret" />
              </button>
            )}

            <div className={`disc ${IS_MAC || tplOpen ? 'disc--open' : ''}`}>
              <div className="disc__inner">
                <div className="field__row">
                  <input
                    className="tpl__input"
                    value={draft.folderTemplate}
                    spellCheck={false}
                    placeholder={DEFAULT_FOLDER_TEMPLATE}
                    onChange={(e) => setDraft({ ...draft, folderTemplate: e.target.value })}
                  />
                  <button
                    onClick={() => setDraft({ ...draft, folderTemplate: DEFAULT_FOLDER_TEMPLATE })}
                    title="Reset to the default template"
                    disabled={draft.folderTemplate === DEFAULT_FOLDER_TEMPLATE}
                  >
                    Reset
                  </button>
                </div>

                <div className="tpl__tags">
                  {FOLDER_TAGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="tpl__tag"
                      title={`Insert {${t}}`}
                      onClick={() =>
                        setDraft({ ...draft, folderTemplate: `${draft.folderTemplate}{${t}}` })
                      }
                    >
                      {`{${t}}`}
                    </button>
                  ))}
                </div>

                {/* Náhled běží přes TUTÉŽ funkci jako skutečná instalace (shared/
                    foldertemplate.ts), takže nemůže ukazovat něco jiného, než co se stane. */}
                <div className="tpl__preview">
                  <div className="tpl__prow">
                    <span className="tpl__plabel">Preview</span>
                    <code className="tpl__ppath">
                      {previewFullPath(SAMPLE_SONG, draft.folderTemplate, draft.songsDir)}
                    </code>
                  </div>
                  {/* Jen když má co ukázat. U výchozí `{artist} - {title}` by to byl
                      druhý namátkový příklad bez poučení (a přesně tak to mátlo). */}
                  {DROPPABLE_TAG_RE.test(draft.folderTemplate) ? (
                    <div className="tpl__prow">
                      <span className="tpl__plabel" title="Not every chart has a genre, year, album or charter filled in. A subfolder whose tags are all empty is skipped.">
                        Tags empty
                      </span>
                      <code className="tpl__ppath tpl__ppath--dim">
                        {previewFullPath(SPARSE_SONG, draft.folderTemplate, draft.songsDir)}
                      </code>
                    </div>
                  ) : null}
                </div>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={draft.autoTargetFolder}
                    onChange={(e) => setDraft({ ...draft, autoTargetFolder: e.target.checked })}
                  />
                  <span>Skip the folder picker and use this template</span>
                </label>

                <p className="field__hint">
                  Use <code>/</code> for subfolders, so <code>{'{genre}/{artist}/{artist} - {title}'}</code>{' '}
                  sorts your library automatically. A subfolder whose tags are all empty is skipped
                  rather than named "Unknown", and <code>{'{name}'}</code> works as an alias for{' '}
                  <code>{'{title}'}</code>. Leave the checkbox off to keep picking a folder each time,
                  with the template still naming the chart folder. Song packs keep their original
                  folder names.
                </p>
              </div>
            </div>
          </fieldset>
              </section>
            </div>

            <div className="settings-col">
              <section className="settings-group">
                <h3 className="settings-group__title">Interface</h3>
          <div className="field field--inline">
            <label className="field">
              <span>Results per page</span>
              <input
                type="number"
                min={5}
                max={100}
                value={draft.recordsPerPage}
                onChange={(e) =>
                  setDraft({ ...draft, recordsPerPage: Number(e.target.value) || 25 })
                }
              />
            </label>
          </div>

          <fieldset className="field">
            <span>
              UI scale
              <span
                className="info"
                title="Make the whole interface bigger or smaller. This stacks on top of your Windows display scaling, so it's handy on very high-resolution (4K) screens where things can look small."
              >
                <Icon name="info" size={13} />
              </span>
            </span>
            <div className="scaler">
              <button
                type="button"
                className="scaler__btn"
                onClick={() => setScale((draft.uiScale ?? 1) - 0.1)}
                disabled={(draft.uiScale ?? 1) <= 0.7}
                aria-label="Smaller"
              >
                −
              </button>
              <span className="scaler__val">{Math.round((draft.uiScale ?? 1) * 100)}%</span>
              <button
                type="button"
                className="scaler__btn"
                onClick={() => setScale((draft.uiScale ?? 1) + 0.1)}
                disabled={(draft.uiScale ?? 1) >= 1.6}
                aria-label="Bigger"
              >
                +
              </button>
              <button
                type="button"
                className="linkbtn scaler__reset"
                onClick={() => setScale(1)}
                disabled={(draft.uiScale ?? 1) === 1}
              >
                Reset
              </button>
            </div>
            <p className="field__hint">
              Stacks on top of Windows display scaling. Preview updates live; click Save to keep it.
            </p>
          </fieldset>
              </section>

              <section className="settings-group">
                <h3 className="settings-group__title">Overlay</h3>
          <fieldset className="field">
            <span>Quick toggle hotkey (optional)</span>
            <div className="field__row">
              <label className="hk">
                <span className="hk__label">
                  Show / hide window
                  <span
                    className="info"
                    title={`Global hotkey – works even when the game window has focus. Most users don't need it (just ${IS_MAC ? 'Cmd+Tab' : 'Alt+Tab'} to bring the app forward).`}
                  >
                    <Icon name="info" size={13} />
                  </span>
                </span>
                <HotkeyInput
                  value={draft.hotkeys.toggleOverlay}
                  onChange={(v) =>
                    setDraft({ ...draft, hotkeys: { ...draft.hotkeys, toggleOverlay: v } })
                  }
                />
              </label>
            </div>
            <p className="field__hint">
              Optional global shortcut to bring the app forward from anywhere. Most users just use{' '}
              {IS_MAC ? 'Cmd+Tab' : 'Alt+Tab'} — leave it blank to disable. Click the field and press
              a key or combo (e.g. <code>F10</code> or{' '}
              <code>{IS_MAC ? '⌘⇧H' : 'Control+Shift+H'}</code>); Backspace clears it.
            </p>
          </fieldset>
              </section>
            </div>
          </div>
        </div>

        <div className="modal__foot">
          <button className="btn-secondary" onClick={cancelSettings}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={async () => {
              // Pojistka: „Results per page" srovnej do 5–100 (min/max u inputu jsou
              // jen nápověda, ruční zápis je obejde).
              const clean: AppConfig = {
                ...draft,
                recordsPerPage: Math.min(100, Math.max(5, Number(draft.recordsPerPage) || 25))
              }
              await saveConfig(clean)
              setShowSettings(false)
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
