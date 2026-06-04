import { app, shell } from 'electron'
import { appendFileSync, mkdirSync, statSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 3 * 1024 * 1024 // 3 MB, then rotate (keep 1 previous)
let logDir = ''
let logFile = ''
let ready = false

type Level = 'info' | 'warn' | 'error'

export function initLogger(): void {
  logDir = join(app.getPath('userData'), 'logs')
  mkdirSync(logDir, { recursive: true })
  logFile = join(logDir, 'main.log')
  try {
    if (existsSync(logFile) && statSync(logFile).size > MAX_BYTES) {
      renameSync(logFile, join(logDir, 'main.prev.log'))
    }
  } catch {
    /* ignore */
  }
  ready = true
  log('info', `=== app start v${app.getVersion()} ===`)
  process.on('uncaughtException', (e) => log('error', 'uncaughtException', e?.stack ?? String(e)))
  process.on('unhandledRejection', (e) => log('error', 'unhandledRejection', String(e)))
}

export function log(level: Level, ...args: unknown[]): void {
  const msg = args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' ')
  const line = `${new Date().toISOString()} [${level}] ${msg}\n`
  if (level === 'error') console.error(line.trimEnd())
  else console.log(line.trimEnd())
  if (ready) {
    try {
      appendFileSync(logFile, line)
    } catch {
      /* ignore */
    }
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function getLogDir(): string {
  return logDir
}

export async function openLogs(): Promise<void> {
  await shell.openPath(logFile && existsSync(logFile) ? logFile : logDir)
}
