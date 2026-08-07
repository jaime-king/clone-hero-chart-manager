// Generates server/src/gen/ — a byte-identical mirror of the domain modules from
// app/src/main/core/ plus app/src/shared/, with exactly ONE file substituted:
// core/config.ts is replaced by the env-driven server config shim.
//
// Why a mirror instead of importing app/src in place: the coupled modules do
// `import ... from 'electron'`, and Node resolves that from app/node_modules
// (the REAL electron) when the file lives under app/. Under server/src/gen the
// same specifier resolves to server/node_modules/electron — our shim package
// ("electron": "file:src/shims/electron" in server/package.json). Relative
// imports like './config' cannot be redirected by tsconfig paths (path mapping
// applies only to non-relative specifiers), so the substitution happens here.
//
// src/gen is gitignored and regenerated on install/dev/build/typecheck.
// app/src/main/core remains the single source of truth — never edit src/gen.

import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(serverRoot)
const appSrc = join(repoRoot, 'app', 'src')
const gen = join(serverRoot, 'src', 'gen')

// Modules NOT mirrored: filemeta.ts (backed only the `file:peekMeta` channel
// = manual install, removed in the web-only cleanup — no server code imports
// it; NOT filetype.ts, which jobs.ts uses in the download pipeline) and
// config.ts (replaced by the shim below). autoupdate.ts and gamedetect.ts,
// the two `delete`-classified modules docs/port/api-inventory.md called out,
// have since been removed from the app entirely and need no exclusion.
const EXCLUDED = new Set(['filemeta.ts', 'config.ts'])

rmSync(gen, { recursive: true, force: true })
mkdirSync(join(gen, 'main', 'core'), { recursive: true })

// shared/ — verbatim
cpSync(join(appSrc, 'shared'), join(gen, 'shared'), { recursive: true })

// main/core/ — verbatim minus exclusions
for (const name of readdirSync(join(appSrc, 'main', 'core'))) {
  if (!name.endsWith('.ts') || EXCLUDED.has(name)) continue
  cpSync(join(appSrc, 'main', 'core', name), join(gen, 'main', 'core', name))
}

// config.ts — the one substitution: env-driven config with the same exported shape
cpSync(join(serverRoot, 'src', 'shims', 'config.ts'), join(gen, 'main', 'core', 'config.ts'))

console.log(`[sync-core] regenerated ${gen}`)
