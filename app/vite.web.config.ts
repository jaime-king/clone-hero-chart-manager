// Plain-browser Vite build for the renderer — Phase 3 of the Electron→webapp
// port. This is the renderer half of electron.vite.config.ts's `renderer`
// block, extracted and pointed at the web entry (index.web.html /
// main.web.tsx) instead of the Electron one (index.html / main.tsx), so a
// stock `vite build` produces a plain SPA the Fastify server can serve
// statically.
//
// electron.vite.config.ts itself is untouched — `npm run build` (electron-vite
// build) still builds the Electron app exactly as before.
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
