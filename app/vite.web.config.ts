// Vite build for the renderer SPA — the app's only build since the fork went
// web-only. (Historically the renderer half of electron.vite.config.ts,
// extracted in Phase 3 of the webapp port and pointed at the web entry
// index.web.html / main.web.tsx; the Electron target was removed since.)
//
// Output: app/out/renderer — the exact directory server/src/index.ts serves
// by default (CHM_STATIC_DIR, resolved relative to server/, defaults to
// '../app/out/renderer').

import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(__dirname, 'src/renderer/index.web.html') }
    }
  },
  plugins: [react()]
})
