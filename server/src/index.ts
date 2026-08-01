// CHM web server — Phase 2 skeleton. Hosts the unmodified core modules
// (mirrored into src/gen by scripts/sync-core.mjs) behind Fastify:
//   POST /api/<channel>  — one route per `http` method in the API inventory
//   GET  /api/events     — SSE bus (jobs:update)
//   GET  /healthz        — { ok, version }
//   static              — renderer build (Phase 3 produces it)

import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { dataDir, initConfig, libraryRoot, quarantineDir } from './config'
import { registerAudioRoute } from './audio'
import { registerRoutes } from './router'
import { registerSse } from './sse'
import { serverRoot, serverVersion } from './version'

async function main(): Promise<void> {
  initConfig()

  const app = Fastify({ logger: true })

  registerRoutes(app)
  registerSse(app)
  registerAudioRoute(app)

  app.get('/healthz', () => ({ ok: true, version: serverVersion() }))

  // Renderer static build (Phase 3 output). Configurable; served when present.
  const staticDir = resolve(
    serverRoot(),
    process.env.CHM_STATIC_DIR || '../app/out/renderer'
  )
  if (existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir })
    // SPA fallback: any non-API GET falls through to index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: { message: 'Not found' } })
    })
  } else {
    app.log.warn(`static dir not found, API only: ${staticDir}`)
  }

  const port = Number(process.env.CHM_PORT || 3000)
  const host = process.env.CHM_HOST || '0.0.0.0'
  await app.listen({ port, host })
  app.log.info(
    { dataDir: dataDir(), libraryRoot: libraryRoot(), quarantineDir: quarantineDir() },
    'CHM server up'
  )
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
