// Web build entry point. Installs the fetch/SSE-backed `window.api` shim
// (web-api.ts) before App.tsx (and anything it imports, e.g. platform.ts,
// which reads `window.api.platform` at module top level) ever evaluates.
//
// This can't be a plain static `import { App } from './App'` above the
// assignment: ES module semantics evaluate ALL of a file's static imports —
// recursively, in dependency order — before ANY of that file's own top-level
// code runs, no matter where the import statement sits textually. So App
// (and platform.ts underneath it) must be a dynamic `import()`, deferred
// until after `window.api` is set, or the module-eval-time read of
// `window.api.platform` would throw on `undefined`.
//
// This file (and index.web.html, which points to it) is the app's only entry
// point — the Electron target (main.tsx/index.html + preload) was removed
// when the fork went web-only.

import { webApi } from './web-api'
import './styles.css'

window.api = webApi

void (async () => {
  const [{ default: React }, { default: ReactDOM }, { App }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./App')
  ])

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})()
