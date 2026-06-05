import { app, ipcMain } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { writeFile, readFile, rm, mkdir } from 'node:fs/promises'
import { IPC } from '@shared/ipc'
import type { HotkeyMode } from '@shared/types'
import { getSettings } from './settings'
import { ensureTtsPython } from './ml-manager'
import { resolveVoice } from '@shared/tts-voices'
import { copySelection } from './inject'
import { getMainWindow } from './windows'
import { log } from './logger'

// Read-aloud of the selected text via Edge online voices (the `edge-tts` CLI from the venv).
// Mirrors RuReader: hotkey copies the selection, speaks it, re-press stops.
let speaking = false
let proc: ChildProcess | null = null
let registered = false
// Bumped on every stop/new-start so a slow in-flight startTts (first run can take seconds while
// the edge-tts venv is created) knows it's been superseded and bails instead of spawning a second
// edge_tts child that would orphan the first (overwriting the single `proc`, leaving it unkillable).
let gen = 0

function speedToRate(speed: number): string {
  const percent = Math.round((speed - 1) * 100)
  return `${percent >= 0 ? '+' : ''}${percent}%`
}

function send(channel: string, ...args: unknown[]): void {
  getMainWindow()?.webContents.send(channel, ...args)
}

export function stopTts(): void {
  speaking = false
  gen++ // invalidate any in-flight startTts
  if (proc) {
    try {
      proc.kill()
    } catch {
      /* ignore */
    }
    proc = null
  }
  send(IPC.ttsStop)
}

async function startTts(): Promise<void> {
  if (speaking) return
  speaking = true
  const myGen = ++gen // this run's token; any stop/new-start bumps `gen` and supersedes us
  let inTxt = ''
  let outMp3 = ''
  try {
    const text = await copySelection()
    if (gen !== myGen) return // stopped / superseded during copy
    if (!text) {
      log('info', 'tts: no selected text')
      speaking = false
      return
    }
    const py = await ensureTtsPython() // light edge-tts env (created on first use)
    if (gen !== myGen) return // stopped / superseded while preparing the engine
    const dir = join(app.getPath('userData'), 'tts-tmp')
    await mkdir(dir, { recursive: true })
    const stamp = String(Date.now())
    inTxt = join(dir, `in-${stamp}.txt`)
    outMp3 = join(dir, `out-${stamp}.mp3`)
    const s = getSettings()
    const voice = resolveVoice(s.ttsLang, text) // 'auto' → detect from text; else the chosen language
    await writeFile(inTxt, text, 'utf8')

    await new Promise<void>((resolve) => {
      proc = spawn(
        py,
        [
          '-m',
          'edge_tts',
          '--file',
          inTxt,
          '--voice',
          voice,
          `--rate=${speedToRate(s.ttsSpeed)}`,
          '--write-media',
          outMp3
        ],
        { windowsHide: true }
      )
      proc.on('close', () => {
        proc = null
        resolve()
      })
      proc.on('error', (e) => {
        log('warn', 'tts: edge_tts spawn error:', String(e))
        proc = null
        resolve()
      })
    })

    if (gen !== myGen) return // stopped / superseded during synth
    const mp3 = await readFile(outMp3).catch(() => null)
    if (!mp3 || mp3.length === 0) {
      log('warn', 'tts: empty audio from edge_tts')
      speaking = false
      return
    }
    // Hand the MP3 bytes to the renderer to play (Chromium decodes MP3 natively).
    send(IPC.ttsPlay, mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength))
    // speaking stays true until the renderer reports playback ended (IPC.ttsEnded)
  } catch (e) {
    log('error', 'tts failed:', e instanceof Error ? e.message : String(e))
    if (gen === myGen) speaking = false // don't clobber a newer run
  } finally {
    if (inTxt) await rm(inTxt, { force: true }).catch(() => {})
    if (outMp3) await rm(outMp3, { force: true }).catch(() => {})
  }
}

/** Hotkey activate: toggle = press to read / press to stop; hold = read while held. */
export function ttsActivate(mode: HotkeyMode): void {
  if (mode === 'hold') void startTts()
  else if (speaking) stopTts()
  else void startTts()
}

export function ttsDeactivate(mode: HotkeyMode): void {
  if (mode === 'hold') stopTts()
}

export function registerTts(): void {
  if (registered) return
  registered = true
  ipcMain.on(IPC.ttsEnded, () => {
    speaking = false
  })
}
