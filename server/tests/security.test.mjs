// Adversarial path-containment tests, run over HTTP against a REAL running
// server instance — per Phase 5 step 3 of docs/port/plan.md: "Read safeAbs(rel)
// adversarially ... it is now a path-traversal guard on an HTTP boundary.
// There is no auth in front of it, so anything on the LAN can hit it; it must
// be correct on its own."
//
// Covers the two containment guards on this boundary:
//   - server/src/audio.ts's `safeAudioPath` (GET /api/audio)
//   - app/src/main/core/librarymgr.ts's `safeAbs` (POST /api/lib:*)
// plus the symlink-escape case both were hardened against (see the
// `realpathSync`-based checks added to librarymgr.ts and localaudio.ts).
//
// Keep tooling light: node:test + global fetch, no test framework dependency.
// Run with: npm test (spawns its own server instance on a scratch port/dir).

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  existsSync,
  readdirSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = fileURLToPath(new URL('..', import.meta.url))
const PORT = 3902
const BASE = `http://127.0.0.1:${PORT}`

let libRoot
let outsideDir
let dataDir
let serverProc

/** Fixture layout:
 *   <tmp>/outside/secret.txt        — marker file OUTSIDE the library
 *   <tmp>/outside/secret.ogg        — audio marker file OUTSIDE the library
 *   <tmp>/library/Songs/Real Song/song.ini, song.opus   — legit in-library song
 *   <tmp>/library/Songs/EscapeLink -> <tmp>/outside      — symlink escape,
 *     placed INSIDE the library, pointing OUTSIDE it. This is the case a
 *     purely lexical `startsWith(base)` check cannot catch.
 */
function buildFixture() {
  const tmp = mkdtempSync(join(tmpdir(), 'chm-security-'))
  outsideDir = join(tmp, 'outside')
  libRoot = join(tmp, 'library', 'Songs')
  dataDir = join(tmp, 'data')
  mkdirSync(outsideDir, { recursive: true })
  mkdirSync(libRoot, { recursive: true })
  writeFileSync(join(outsideDir, 'secret.txt'), 'OUTSIDE-SECRET-MARKER')
  writeFileSync(join(outsideDir, 'secret.ogg'), 'OUTSIDE-AUDIO-SECRET-MARKER'.repeat(50))
  writeFileSync(join(outsideDir, 'song.ini'), '[song]\nname = Outside Leak\nartist = Should Not Appear\n')

  const realSong = join(libRoot, 'Real Song')
  mkdirSync(realSong, { recursive: true })
  writeFileSync(join(realSong, 'song.ini'), '[song]\nname = Real Song\nartist = Test\n')
  writeFileSync(join(realSong, 'song.opus'), 'REAL-AUDIO-BYTES'.repeat(50))

  // Symlink INSIDE the library pointing OUTSIDE it.
  symlinkSync(outsideDir, join(libRoot, 'EscapeLink'), 'dir')
}

before(async () => {
  buildFixture()
  const tsxBin = join(serverRoot, 'node_modules', '.bin', 'tsx')
  serverProc = spawn(
    tsxBin,
    [join(serverRoot, 'src', 'index.ts')],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        CHM_LIBRARY_ROOT: libRoot,
        CHM_DATA_DIR: dataDir,
        CHM_PORT: String(PORT),
        CHM_HOST: '127.0.0.1'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own process group so teardown can kill tsx AND its node child.
      detached: true
    }
  )
  let out = ''
  serverProc.stdout.on('data', (c) => (out += c.toString()))
  serverProc.stderr.on('data', (c) => (out += c.toString()))
  // Poll /healthz instead of a fixed sleep.
  const deadline = Date.now() + 15_000
  for (;;) {
    try {
      const res = await fetch(`${BASE}/healthz`)
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      throw new Error(`server did not become healthy in time. Output so far:\n${out}`)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
})

after(async () => {
  if (serverProc) {
    try {
      process.kill(-serverProc.pid, 'SIGKILL') // whole group: tsx wrapper + node child
    } catch {
      serverProc.kill('SIGKILL')
    }
  }
  try {
    rmSync(join(libRoot, '..', '..'), { recursive: true, force: true })
  } catch {
    /* best-effort cleanup */
  }
})

async function libPost(channel, args) {
  const res = await fetch(`${BASE}/api/${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args })
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON, keep text */
  }
  return { status: res.status, json, text }
}

// ── GET /api/audio adversarial battery ─────────────────────────────────────

const audioAttacks = [
  ['../ traversal', '../../../../../../etc/passwd.ogg'],
  ['absolute path outside', '/etc/passwd.ogg'],
  ['url-encoded traversal (raw %2e%2e literal after single decode)', '%2e%2e%2f%2e%2e%2fetc%2fpasswd.ogg'],
  ['double-encoded traversal', '%252e%252e%252fetc%252fpasswd.ogg'],
  ['backslash traversal', '..\\..\\..\\etc\\passwd.ogg'],
  ['null byte', '/etc/passwd.ogg\0.ogg'],
  ['UNC-ish prefix', '\\\\evilserver\\share\\x.ogg'],
  ['no extension', '/etc/passwd'],
  ['empty path', '']
]

for (const [label, raw] of audioAttacks) {
  test(`audio: ${label} is rejected`, async () => {
    const res = await fetch(`${BASE}/api/audio?path=${encodeURIComponent(raw)}`)
    assert.ok(
      res.status === 400 || res.status === 404,
      `expected 400/404, got ${res.status} for ${label}`
    )
    const body = await res.text()
    assert.ok(!body.includes('OUTSIDE-AUDIO-SECRET-MARKER'), `${label} leaked outside content!`)
  })
}

test('audio: symlink escape inside the library is rejected', async () => {
  const target = join(libRoot, 'EscapeLink', 'secret.ogg')
  const res = await fetch(`${BASE}/api/audio?path=${encodeURIComponent(target)}`)
  assert.ok(res.status === 400 || res.status === 404, `expected 400/404, got ${res.status}`)
  const body = await res.text()
  assert.ok(!body.includes('OUTSIDE-AUDIO-SECRET-MARKER'), 'symlink escape leaked outside content!')
})

test('audio: legit in-library file is served (control)', async () => {
  const target = join(libRoot, 'Real Song', 'song.opus')
  const res = await fetch(`${BASE}/api/audio?path=${encodeURIComponent(target)}`)
  assert.equal(res.status, 200)
  const body = await res.text()
  assert.ok(body.includes('REAL-AUDIO-BYTES'), 'expected real in-library content')
})

test('audio: Range request returns 206 with the exact byte slice', async () => {
  const target = join(libRoot, 'Real Song', 'song.opus')
  const res = await fetch(`${BASE}/api/audio?path=${encodeURIComponent(target)}`, {
    headers: { Range: 'bytes=0-15' }
  })
  assert.equal(res.status, 206)
  assert.equal(res.headers.get('content-length'), '16')
  const buf = Buffer.from(await res.arrayBuffer())
  assert.equal(buf.length, 16)
})

// ── POST /api/lib:* — safeAbs adversarial battery (JSON body args, so no
//    URL-encoding involved; the strings below are the raw attack payloads) ──

const relAttacks = [
  ['../ traversal', '../../../../../../etc'],
  ['absolute path outside', '/etc'],
  ['backslash traversal', '..\\..\\..\\etc'],
  ['null byte', '/etc' + String.fromCharCode(0) + '/passwd'],
  ['UNC-ish prefix', '\\\\evilserver\\share']
]

for (const [label, rel] of relAttacks) {
  test(`lib:list: ${label} is rejected (no outside listing)`, async () => {
    const { status, json, text } = await libPost('lib:list', [rel])
    if (status === 200) {
      // Never allowed to succeed with outside content.
      const names = (json?.result?.entries ?? []).map((e) => e.name)
      assert.ok(!names.includes('secret.txt'), `leaked outside directory listing for ${label}`)
      assert.ok(!names.includes('EscapeLink'), `unexpectedly listed EscapeLink for ${label}`)
    } else {
      assert.ok(status >= 400, `expected an error status, got ${status} (${text}) for ${label}`)
    }
  })
}

test('lib:readMeta: symlink escape does not return outside song.ini content', async () => {
  const { status, json } = await libPost('lib:readMeta', ['EscapeLink'])
  if (status === 200) {
    const meta = json?.result ?? {}
    assert.notEqual(meta.name, 'Outside Leak', 'symlink escape leaked outside song.ini content!')
    assert.notEqual(meta.artist, 'Should Not Appear', 'symlink escape leaked outside song.ini content!')
  }
  // Any non-200 (typically 500 from safeAbs's thrown Error) is an acceptable
  // rejection too — the requirement is "never outside content", not a
  // specific status code, for this JSON API surface.
})

test('lib:createFolder: traversal name never creates anything outside the library', async () => {
  const before = existsSync(join(outsideDir, 'evil-created'))
  assert.equal(before, false)
  await libPost('lib:createFolder', ['.', '../../outside/evil-created'])
  await libPost('lib:createFolder', ['..', 'evil-created'])
  const after = existsSync(join(outsideDir, 'evil-created'))
  assert.equal(after, false, 'traversal name escaped the library on create!')
})

test('lib:trash: traversal relItem never deletes anything outside the library', async () => {
  assert.ok(existsSync(join(outsideDir, 'secret.txt')), 'fixture setup sanity check')
  await libPost('lib:trash', ['../../outside/secret.txt'])
  await libPost('lib:trash', ['/etc/hosts'])
  assert.ok(existsSync(join(outsideDir, 'secret.txt')), 'traversal relItem deleted outside content!')
})

test('lib:rename: symlink escape target is rejected, outside dir untouched', async () => {
  const before = readdirSync(outsideDir).sort()
  const { status } = await libPost('lib:rename', ['EscapeLink', 'Renamed'])
  const after = readdirSync(outsideDir).sort()
  assert.deepEqual(after, before, 'outside directory contents changed via symlink rename!')
  if (status === 200) {
    // If it "succeeded", it must only have renamed the symlink itself inside
    // the library, never touched what it points to — already asserted above.
  }
})
