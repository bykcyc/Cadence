import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { IPC } from '@shared/ipc'
import type { DictationKind, DictationState, HotkeyBinding } from '@shared/types'
import { startHotkeys, setBindings, stopHotkeys } from './hotkeys'
import { getMainWindow } from './windows'
import { getSettings } from './settings'
import { transcribeAudio, ensureOnnxReady } from './ml-manager'
import { showOverlay, updateOverlay, hideOverlay, createOverlay, sendOverlayLevel } from './overlay'
import { insertText, copyToClipboard } from './inject'
import { addHistory } from './dictation-history'
import { runPolish, runPolishTranslate } from './jobs/polish'
import { ttsActivate, ttsDeactivate } from './tts'
import { broadcast } from './broadcast'
import { mt } from './i18n'
import { log } from './logger'

let session: { kind: DictationKind; maxTimer: NodeJS.Timeout } | null = null
let state: DictationState = { phase: 'idle', kind: null, message: '' }
let registered = false

// Safety net: if a recording never receives its stop (e.g. a missed global key-up on a
// very long hold), auto-finalize it instead of hanging forever.
const MAX_RECORDING_MS = 120_000

function setState(patch: Partial<DictationState>): void {
  state = { ...state, ...patch }
  updateOverlay(state)
  broadcast(IPC.dictationStateEvent, state)
}

export function getDictationState(): DictationState {
  return state
}

function recorderWebContents(): Electron.WebContents | null {
  return getMainWindow()?.webContents ?? null
}

function startSession(kind: DictationKind): void {
  if (session) return
  const wc = recorderWebContents()
  if (!wc) return
  const maxTimer = setTimeout(() => {
    log('warn', 'dictation: max duration reached — auto-stopping')
    stopSession()
  }, MAX_RECORDING_MS)
  session = { kind, maxTimer }
  setState({ phase: 'recording', kind, message: '' })
  showOverlay(state)
  wc.send(IPC.dictationCaptureStart, { micDeviceId: getSettings().micDeviceId })
  // Warm the ONNX ASR worker (cpu/gpu per settings — ensureOnnxReady picks the device) while the
  // user is speaking, so transcription is ready by the time they release the hotkey.
  void ensureOnnxReady().catch(() => {})
}

function stopSession(): void {
  if (!session) return
  clearTimeout(session.maxTimer)
  setState({ phase: 'transcribing', message: '' })
  recorderWebContents()?.send(IPC.dictationCaptureStop)
  // audio arrives via IPC.dictationAudio
}

function endSession(): void {
  if (session) clearTimeout(session.maxTimer)
  session = null
  setState({ phase: 'idle', kind: null, message: '' })
  hideOverlay()
}

async function handleAudio(buffer: ArrayBuffer): Promise<void> {
  if (!session) return
  const kind = session.kind
  const dir = join(app.getPath('userData'), 'dictation-tmp')
  await mkdir(dir, { recursive: true })
  const wav = join(dir, `dictation-${Date.now()}.wav`)
  await writeFile(wav, Buffer.from(buffer))
  try {
    setState({ phase: 'transcribing' })
    const result = await transcribeAudio(wav)
    let text = (result.text || '').trim()
    log('info', `dictation: kind=${kind} recognized ${text.length} chars`)
    if (text && (kind === 'polish' || kind === 'translate')) {
      setState({ phase: 'processing' })
      // DeepSeek post-processing is an enhancement. If it errors (no/invalid key, empty
      // response, timeout) we fall back to the raw transcript so the hotkey always inserts
      // *something* instead of showing an error.
      try {
        const out = (
          kind === 'translate'
            ? await runPolishTranslate(text, getSettings().dictationTranslateLang)
            : await runPolish(text)
        ).trim()
        if (out) text = out
        else log('warn', `dictation: ${kind} returned empty — using raw transcript`)
      } catch (e) {
        log('warn', `dictation: ${kind} failed — using raw transcript:`, e instanceof Error ? e.message : String(e))
      }
    }
    await finish(text, kind)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log('error', 'dictation failed:', message)
    setState({ phase: 'error', message })
    setTimeout(endSession, 2800)
  } finally {
    await rm(wav, { force: true }).catch(() => {})
  }
}

async function finish(text: string, kind: DictationKind): Promise<void> {
  if (!text) {
    setState({ phase: 'done', message: mt('dictation.empty') })
    setTimeout(endSession, 900)
    return
  }
  const settings = getSettings()
  addHistory({ id: String(Date.now()), at: new Date().toISOString(), kind, text })
  setState({ phase: 'inserting' })
  if (settings.dictationOutput === 'insert') {
    await insertText(text, settings.dictationRestoreClipboard)
  } else {
    copyToClipboard(text)
  }
  setState({
    phase: 'done',
    message: settings.dictationOutput === 'clipboard' ? mt('dictation.inClipboard') : ''
  })
  setTimeout(endSession, 900)
}

export function applyDictationBindings(): void {
  const s = getSettings()
  const list: { kind: string; binding: HotkeyBinding }[] = []
  if (s.dictationEnabled) {
    list.push({ kind: 'plain', binding: s.dictateHotkey })
    list.push({ kind: 'polish', binding: s.polishHotkey })
    list.push({ kind: 'translate', binding: s.translateHotkey })
  }
  // TTS is independent of dictation — it can be on even when dictation is off.
  if (s.ttsEnabled) list.push({ kind: 'tts', binding: s.ttsHotkey })
  setBindings(list)
}

export function registerDictation(): void {
  if (registered) {
    applyDictationBindings()
    return
  }
  registered = true
  createOverlay()
  startHotkeys({
    onActivate: (kind, mode) => {
      if (kind === 'tts') {
        ttsActivate(mode)
        return
      }
      if (mode === 'hold') startSession(kind as DictationKind)
      else if (session) stopSession()
      else startSession(kind as DictationKind)
    },
    onDeactivate: (kind, mode) => {
      if (kind === 'tts') {
        ttsDeactivate(mode)
        return
      }
      if (mode === 'hold' && session?.kind === kind) stopSession()
    }
  })
  applyDictationBindings()

  ipcMain.on(IPC.dictationAudio, (_e, buffer: ArrayBuffer) => void handleAudio(buffer))
  ipcMain.on(IPC.dictationLevel, (_e, level: number) => {
    if (session && state.phase === 'recording') sendOverlayLevel(level)
  })
  ipcMain.on(IPC.dictationCaptureError, (_e, message: string) => {
    setState({ phase: 'error', message })
    setTimeout(endSession, 2200)
  })
}

export function stopDictation(): void {
  stopHotkeys()
}
