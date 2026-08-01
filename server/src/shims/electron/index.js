// Server-side 'electron' shim. Installed as server/node_modules/electron via a
// file: dependency so the UNMODIFIED core modules (librarymgr.ts, playlists.ts,
// update.ts, localaudio.ts) resolve their `import ... from 'electron'` here.
// Reads env directly (same defaults as src/config.ts) because it loads as a
// plain node_modules package, outside the TypeScript program.
'use strict'

const { rmSync } = require('node:fs')
const { isAbsolute, join, relative, resolve, sep } = require('node:path')

function dataDir() {
  return resolve(process.env.CHM_DATA_DIR || './data')
}
function libraryRoot() {
  return resolve(process.env.CHM_LIBRARY_ROOT || join(dataDir(), 'library'))
}

const app = {
  // app.getPath replacement:
  //   'userData'  → CHM_DATA_DIR            (config.json, hash-index.json)
  //   'documents' → <CHM_DATA_DIR>/documents (playlists.ts puts Setlists here)
  //   'exe'       → process.execPath         (root-candidate probing; harmless)
  getPath(name) {
    if (name === 'userData') return dataDir()
    if (name === 'documents') return join(dataDir(), 'documents')
    if (name === 'exe') return process.execPath
    throw new Error(`electron shim: app.getPath('${name}') is not supported server-side`)
  },
  getVersion() {
    // server/package.json — this file lives at server/src/shims/electron/
    // (node_modules/electron is a symlink; __dirname is the realpath).
    return require(join(__dirname, '..', '..', '..', 'package.json')).version
  }
}

const shell = {
  // shell.trashItem replacement: permanent delete (owner's decision, 2026-08-01
  // — no server-side trash). Only paths inside the library root may be deleted;
  // there is no auth in front of this server, so the containment check is the
  // entire safety boundary.
  async trashItem(absPath) {
    const abs = resolve(absPath)
    const lib = libraryRoot()
    const rel = abs !== lib && abs.startsWith(lib + sep) ? relative(lib, abs) : ''
    if (!rel || isAbsolute(rel) || rel.split(sep)[0] === '..') {
      throw new Error('delete shim: refusing to delete a path outside the library')
    }
    rmSync(abs, { recursive: true, force: true })
  },
  // These back the `delete`-classified channels lib:open / lib:reveal — no
  // HTTP route exists for them, so a plain throw is fine.
  openPath() {
    throw new Error('electron shim: shell.openPath has no server-side equivalent')
  },
  showItemInFolder() {
    throw new Error('electron shim: shell.showItemInFolder has no server-side equivalent')
  },
  openExternal() {
    throw new Error('electron shim: shell.openExternal has no server-side equivalent')
  }
}

// localaudio.ts imports { protocol } but the server never calls
// registerAudioScheme()/handleAudioProtocol() — no-ops keep the import working.
// Phase 5 replaces the chm-audio:// scheme with an HTTP Range endpoint.
const protocol = {
  registerSchemesAsPrivileged() {},
  handle() {}
}

module.exports = { app, shell, protocol }
