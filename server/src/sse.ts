// GET /api/events — SSE bus. Phase 2 needs exactly one channel: jobs:update
// (the only surviving `on`-stream per api-inventory.md; the other six feed
// deleted desktop features). jobManager is a plain EventEmitter — the same
// 'update' emission ipc.ts bridged to webContents.send('jobs:update', job)
// is bridged here to every connected SSE client. Phase 4 hardens reconnect.

import type { FastifyInstance } from 'fastify'
import type { ServerResponse } from 'http'
import { jobManager } from './gen/main/core/jobs'

const clients = new Set<ServerResponse>()

function broadcast(event: string, data: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) res.write(frame)
}

export function registerSse(app: FastifyInstance): void {
  jobManager.on('update', (job) => broadcast('jobs:update', job))

  app.get('/api/events', (req, reply) => {
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.write('retry: 3000\n\n')
    clients.add(res)
    req.raw.on('close', () => {
      clients.delete(res)
    })
    // Response stays open — tell Fastify not to send anything itself.
    reply.hijack()
  })
}
