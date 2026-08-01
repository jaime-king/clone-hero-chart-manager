// Env-driven replacement for app/src/main/core/config.ts (same exported shape:
// getConfig / setConfig over the shared AppConfig type), no Electron.
//
// Env vars (see .env.example):
//   CHM_DATA_DIR       — server state (config.json, trash/, documents/, …). Default ./data
//   CHM_LIBRARY_ROOT   — the Songs dir the app manages. Pinned: config:set cannot change it.
//   CHM_QUARANTINE_DIR — duplicate quarantine. Default <CHM_DATA_DIR>/quarantine. Pinned too.
//   CHM_7Z_DIR / CHM_ONYX_PATH — external tool locations (Phase 5/6 wire them up).
//
// Non-env fields (recordsPerPage, folderTemplate, …) persist in <data>/config.json
// exactly like the Electron app persisted them in userData.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { DEFAULT_FOLDER_TEMPLATE } from './gen/shared/foldertemplate'
import type { AppConfig } from './gen/shared/types'

export function dataDir(): string {
  return resolve(process.env.CHM_DATA_DIR || './data')
}

export function libraryRoot(): string {
  return resolve(process.env.CHM_LIBRARY_ROOT || join(dataDir(), 'library'))
}

export function quarantineDir(): string {
  return resolve(process.env.CHM_QUARANTINE_DIR || join(dataDir(), 'quarantine'))
}

function configPath(): string {
  return join(dataDir(), 'config.json')
}

function defaults(): AppConfig {
  return {
    songsDir: libraryRoot(),
    c3BinDir: process.env.CHM_7Z_DIR || '',
    onyxPath: process.env.CHM_ONYX_PATH || '',
    recordsPerPage: 25,
    uiScale: 1.0,
    showTips: true,
    dupMoveDir: quarantineDir(),
    folderTemplate: DEFAULT_FOLDER_TEMPLATE,
    autoTargetFolder: false
  }
}

/** Fields the environment owns — a config:set patch can never override them. */
function pinEnvFields(cfg: AppConfig): AppConfig {
  cfg.songsDir = libraryRoot()
  cfg.dupMoveDir = quarantineDir()
  if (process.env.CHM_7Z_DIR) cfg.c3BinDir = process.env.CHM_7Z_DIR
  if (process.env.CHM_ONYX_PATH) cfg.onyxPath = process.env.CHM_ONYX_PATH
  return cfg
}

let cached: AppConfig | null = null

export function getConfig(): AppConfig {
  if (cached) return cached
  const def = defaults()
  let result: AppConfig
  try {
    const raw = readFileSync(configPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    result = { ...def, ...parsed }
  } catch {
    result = def
  }
  cached = pinEnvFields(result)
  return cached
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const current = getConfig()
  const next: AppConfig = pinEnvFields({
    ...current,
    ...patch
  })
  cached = next
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

/** Boot-time sanity: ensure the data dir exists and warn on a missing library. */
export function initConfig(): void {
  mkdirSync(dataDir(), { recursive: true })
  if (!existsSync(libraryRoot())) {
    console.warn(`[config] CHM_LIBRARY_ROOT does not exist: ${libraryRoot()}`)
  }
}
