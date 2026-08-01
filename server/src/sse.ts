// GET /api/events — SSE bus. Exactly one channel matters: jobs:update
// (the only surviving `on`-stream per api-inventory.md; the other six feed
// deleted desktop features). jobManager is a plain EventEmitter — the same
// 'update' emission ipc.ts bridged to webContents.send('jobs:update', job)
// (main/ipc.ts:312-314, payload = the full DownloadJob object) is bridged
// here to every connected SSE client as `event: jobs:update` + JSON data.
//
// Phase 4 hardening:
// - Every event carries an incrementing `id:` so browsers send Last-Event-ID
//   on reconnect. We deliberately do NOT replay from that id — job events are
//   idempotent full-object snapshots, so instead every new connection
//   (including reconnects) immediately receives the current jobs list as one
//   jobs:update frame per job. The client's applyJobUpdate upserts by job.id,
//   so the snapshot resyncs it without replay.
// - `:ka` comment heartbeat every 25s so idle-timeout proxies (Traefik in
//   Phase 6) don't close a quiet stream.

import type { FastifyInstance } from 'fastify'
import type { ServerResponse } from 'http'
import { jobManager } from './gen/main/core/jobs'

const HEARTBEAT_MS = 25_000

const clients = new Set<ServerResponse>()
let nextEventId = 1
let heartbeat: NodeJS.Timeout | null = null

function frame(event: string, data: unknown): string {
  return `id: ${nextEventId++}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function broadcast(event: string, data: unknown): void {
  if (clients.size === 0) return
  const f = frame(event, data)
  for (const res of clients) res.write(f)
}

function startHeartbeat(): void {
  if (heartbeat) return
  heartbeat = setInterval(() => {
    for (const res of clients) res.write(':ka\n\n')
  }, HEARTBEAT_MS)
  // Don't keep the process alive just for the heartbeat.
  heartbeat.unref()
}

export function registerSse(app: FastifyInstance): void {
  jobManager.on('update', (job) => broadcast('jobs:update', job))
  startHeartbeat()

  app.get('/api/events', (req, reply) => {
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.write('retry: 3000\n\n')
    // Snapshot: bring this client (fresh or reconnecting) up to date with the
    // current jobs state before it starts receiving live updates. Same event
    // shape as live updates, so the client handles it with the same listener.
    for (const job of jobManager.getAll()) {
      res.write(frame('jobs:update', job))
    }
    clients.add(res)
    req.raw.on('close', () => {
      clients.delete(res)
    })
    // Response stays open — tell Fastify not to send anything itself.
    reply.hijack()
  })
}
