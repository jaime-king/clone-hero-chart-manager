// Vstupní bod main procesu.

import { app, BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { registerIpc } from './ipc'
import { setupAppMenu } from './menu'
import { createOverlay, getOverlay, revealOverlay } from './overlay'
import { initAutoUpdate } from './core/autoupdate'
import { isMac, isWin } from './core/platform'
import { handleAudioProtocol, registerAudioScheme } from './core/localaudio'

/**
 * Windows: při tažení za okraj se rám okna zvětší okamžitě, ale obsah dobíhá a
 * do nově odkryté plochy se roztáhne/zopakuje poslední snímek (duchové na pravé
 * a spodní hraně). Dělá to prezentace přes DirectComposition — swap chain se
 * škáluje, dokud renderer nedodá nový snímek. Bez ní Chromium prezentuje starší
 * cestou, která překresluje rovnou do okna.
 *
 * NENÍ to totéž co `disableHardwareAcceleration()` (to jsme zkoušeli a bylo to
 * horší) — GPU rasterizace i kompozice zůstávají, mění se jen způsob prezentace.
 */
if (isWin) app.commandLine.appendSwitch('disable-direct-composition')

// Vlastní schéma pro zvuk písní z knihovny. MUSÍ se zaregistrovat dřív, než je
// app ready — potom už Chromium seznam schémat nepřebírá.
registerAudioScheme()

/**
 * macOS: v DEV režimu (spuštěno přes `electron`) nemá běžící proces .app bundle,
 * takže Dock i přepínač aplikací (Cmd+Tab / Spotlight) ukazují defaultní ikonu
 * Electronu. Nastavíme ji ručně. V zabalené appce už ikonu řeší icns z build
 * configu — ale zavolat to neuškodí.
 */
function setMacDockIcon(): void {
  if (!isMac || !app.dock) return
  const icon = join(app.getAppPath(), 'build', 'icon-1024.png')
  if (existsSync(icon)) app.dock.setIcon(icon)
}

// Jediná instance aplikace.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    revealOverlay()
  })

  app.whenReady().then(() => {
    setMacDockIcon()
    handleAudioProtocol()
    setupAppMenu()
    registerIpc()
    createOverlay()
    initAutoUpdate(getOverlay)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createOverlay()
    })
  })

  // macOS: appka po zavření okna dál běží (dock ikona zůstává), dokud ji
  // uživatel nevypne přes Cmd+Q — standardní mac chování.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
