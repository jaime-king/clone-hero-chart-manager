// GET /api/audio — HTTP Range-capable replacement for the Electron
// `chm-audio://` protocol (app/src/main/core/localaudio.ts). Same audio-only,
// containment-checked contract, but as a plain HTTP route so a browser
// <audio> element can Range-request it directly.
//
// The `path` query parameter carries an absolute filesystem path (the same
// value localaudio.ts's `audioUrl()` already encodes into a chm-audio:// URL
// today). router.ts rewrites `preview:songAudio`'s response so its track
// URLs point here instead — see `toHttpAudioUrl` below.
//
// Containment: this endpoint has no auth in front of it (LAN trust boundary,
// per docs/port/plan.md's security model), so it re-derives the same
// protection localaudio.ts's `isAllowed`/`songFolderAbs` apply, but resolves
// symlinks (fs.realpathSync) before the containment check — a symlink placed
// inside the library that points outside would otherwise pass a purely
// lexical `startsWith` check while still letting the OS follow it to
// arbitrary files. See docs/port/plan.md Phase 5 step 3 (safeAbs audit).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createReadStream, realpathSync, statSync } from 'fs'
import { dirname, extname, resolve, sep } from 'path'
import { libraryRoot } from './config'

const AUDIO_EXT = new Set(['.ogg', '.opus', '.mp3', '.wav'])

const MIME: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
}

/**
 * Resolves the real (symlink-free) path of the deepest existing ancestor of
 * `p`. For a path that exists, this is just its realpath. For a path that
 * doesn't exist (never expected here — audio files are read, not created —
 * but defensive anyway), it walks up until it finds an ancestor that does.
 */
function realExistingAncestor(p: string): string {
  let cur = p
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return realpathSync(cur)
    } catch {
      const parent = dirname(cur)
      if (parent === cur) return cur
      cur = parent
    }
  }
}

/**
 * Strict containment: the resolved (symlink-followed) path must be the
 * library root or inside it. Rejects `..`, absolute-path escapes, and
 * symlink escapes alike. Returns the absolute path to use on success, throws
 * on rejection (caller maps to 400/404 — never a 200 with outside content).
 */
export function safeAudioPath(rawPath: string): string {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new Error('path is required')
  }
  // Reject NUL bytes outright — Node's fs calls throw on these anyway, but
  // failing fast here keeps the error message uniform and avoids relying on
  // that incidental behavior.
  if (rawPath.includes('\0')) {
    throw new Error('invalid path')
  }
  if (!AUDIO_EXT.has(extname(rawPath).toLowerCase())) {
    throw new Error('unsupported file type')
  }
  const root = libraryRoot();
  const realRoot = realpathSync(root)
  const abs = resolve('/', rawPath.replace(/^[a-zA-Z]:/, '')) // strip a Windows drive prefix if present, then force absolute
  const real = realExistingAncestor(abs)
  if (real !== realRoot && !real.startsWith(realRoot + sep)) {
    throw new Error('path is outside the Songs library')
  }
  return abs
}

/** Rewrites a `chm-audio://file/<enc>` URL (or a raw abs path) to `/api/audio?path=<enc>`. */
export function toHttpAudioUrl(chmAudioUrl: string): string {
  const m = /^chm-audio:\/\/file\/(.+)$/.exec(chmAudioUrl)
  const encoded = m ? m[1] : encodeURIComponent(chmAudioUrl)
  return `/api/audio?path=${encoded}`
}

function parseRange(
  range: string | undefined,
  size: number
): { start: number; end: number } | null | 'invalid' {
  if (!range) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!m || (!m[1] && !m[2])) return 'invalid'
  let start: number
  let end: number
  if (m[1] === '') {
    // suffix range: last N bytes
    const suffixLen = parseInt(m[2], 10)
    start = Math.max(0, size - suffixLen)
    end = size - 1
  } else {
    start = parseInt(m[1], 10)
    end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
  }
  if (!(start >= 0 && start <= end && end < size)) return 'invalid'
  return { start, end }
}

export function registerAudioRoute(app: FastifyInstance): void {
  app.get('/api/audio', async (req: FastifyRequest, reply: FastifyReply) => {
    // Fastify's query-string parser already percent-decodes values, so
    // `query.path` here is the plain absolute path — no extra decode step
    // (double-decoding would mangle paths that legitimately contain `%`).
    const query = req.query as { path?: string }
    let abs: string
    try {
      abs = safeAudioPath(query.path ?? '')
    } catch {
      return reply.code(400).send({ error: { message: 'invalid or disallowed path' } })
    }

    let size: number
    try {
      size = statSync(abs).size
    } catch {
      return reply.code(404).send({ error: { message: 'not found' } })
    }

    const type = MIME[extname(abs).toLowerCase()] ?? 'audio/ogg'
    const range = parseRange(req.headers.range, size)

    if (range === 'invalid') {
      reply.header('Content-Range', `bytes */${size}`)
      return reply.code(416).send()
    }

    if (range) {
      const { start, end } = range
      reply.code(206)
      reply.header('Content-Type', type)
      reply.header('Content-Length', String(end - start + 1))
      reply.header('Content-Range', `bytes ${start}-${end}/${size}`)
      reply.header('Accept-Ranges', 'bytes')
      return reply.send(createReadStream(abs, { start, end }))
    }

    reply.header('Content-Type', type)
    reply.header('Content-Length', String(size))
    reply.header('Accept-Ranges', 'bytes')
    return reply.send(createReadStream(abs))
  })
}
