import { readFileSync } from 'fs'
import { join } from 'path'

// Works from both src/ (tsx dev) and dist/ (built) — same depth below server/.
export function serverRoot(): string {
  return join(__dirname, '..')
}

let cached: string | null = null

export function serverVersion(): string {
  if (!cached) {
    cached = (
      JSON.parse(readFileSync(join(serverRoot(), 'package.json'), 'utf-8')) as {
        version: string
      }
    ).version
  }
  return cached
}
