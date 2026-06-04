import { ipcMain } from 'electron'
import { join } from 'node:path'
import { mkdir, rm, copyFile } from 'node:fs/promises'
import { IPC } from '@shared/ipc'
import type { RecorderEvent, RecorderStartConfig, RecorderTrack } from '@shared/types'
import { recordingStore } from './state'
import { getMainWindow } from './windows'
import { getSettings } from './settings'
import { meetingFolder, defaultMeeting, writeMeeting, getMeeting } from './meetings'
import { WavWriter } from './audio/wav-writer'
import { transcodeToFlac, mixTracks } from './audio/ffmpeg'
import { broadcast } from './broadcast'
import { runTranscription } from './jobs/transcribe'
import { runNotes } from './jobs/notes'

interface ActiveSession {
  meetingId: string
  folder: string
  startedAtMs: number
  sampleRate: number
  micWriter: WavWriter
  systemWriter: WavWriter
  ticker: NodeJS.Timeout | null
  finalizeTimeout: NodeJS.Timeout | null
  finalizing: boolean
}

let session: ActiveSession | null = null

let rendererReady = false
const readyWaiters: Array<() => void> = []

function markRendererReady(): void {
  rendererReady = true
  while (readyWaiters.length) readyWaiters.shift()?.()
}

/** Resolve once the capture bridge has registered (or after a fallback timeout). */
function waitForRendererReady(timeoutMs = 8000): Promise<void> {
  if (rendererReady) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    readyWaiters.push(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Folder id: YYYY-MM-DD_HH-MM-SS in local time. */
function formatTimestampId(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  )
}

function recorderWebContents(): Electron.WebContents | null {
  return getMainWindow()?.webContents ?? null
}

export async function startRecording(): Promise<void> {
  if (recordingStore.isActive() || session) return

  const wc = recorderWebContents()
  if (!wc) {
    recordingStore.set({ status: 'idle' })
    return
  }

  recordingStore.set({ status: 'starting', meetingId: null, startedAt: null, durationSec: 0 })

  const settings = getSettings()
  const sampleRate = settings.captureSampleRate
  const now = new Date()
  const meetingId = formatTimestampId(now)
  const folder = meetingFolder(meetingId)
  await mkdir(folder, { recursive: true })

  const micWriter = new WavWriter(join(folder, 'mic.wav'), sampleRate)
  const systemWriter = new WavWriter(join(folder, 'system.wav'), sampleRate)
  micWriter.start()
  systemWriter.start()

  const meeting = defaultMeeting(meetingId, now.toISOString())
  meeting.audio = { mic: 'mic.wav', system: 'system.wav', mixed: null, format: 'wav', sampleRate }
  await writeMeeting(meeting)

  session = {
    meetingId,
    folder,
    startedAtMs: Date.now(),
    sampleRate,
    micWriter,
    systemWriter,
    ticker: null,
    finalizeTimeout: null,
    finalizing: false
  }

  const cfg: RecorderStartConfig = {
    meetingId,
    sampleRate,
    micDeviceId: settings.micDeviceId,
    outputDeviceId: settings.outputDeviceId
  }
  // Wait for the capture bridge so the start command isn't dropped.
  await waitForRendererReady()
  wc.send(IPC.recorderStart, cfg)

  // Safety: if the renderer never confirms 'started', assume it did after 4s.
  setTimeout(() => {
    if (session && recordingStore.get().status === 'starting') onStarted()
  }, 4000)
}

function onStarted(): void {
  if (!session) return
  recordingStore.set({
    status: 'recording',
    meetingId: session.meetingId,
    startedAt: new Date(session.startedAtMs).toISOString(),
    durationSec: 0
  })
  if (!session.ticker) {
    session.ticker = setInterval(() => {
      if (!session) return
      recordingStore.set({ durationSec: Math.floor((Date.now() - session.startedAtMs) / 1000) })
    }, 1000)
  }
}

export async function stopRecording(): Promise<void> {
  if (!session) {
    recordingStore.set({ status: 'idle' })
    return
  }
  if (recordingStore.get().status === 'stopping') return
  recordingStore.set({ status: 'stopping' })
  recorderWebContents()?.send(IPC.recorderStop)
  // Safety: finalize even if the renderer never confirms 'stopped'.
  session.finalizeTimeout = setTimeout(() => void finalizeSession(), 5000)
}

export async function toggleRecording(): Promise<void> {
  if (session) await stopRecording()
  else await startRecording()
}

async function finalizeSession(): Promise<void> {
  const s = session
  if (!s || s.finalizing) return
  s.finalizing = true
  if (s.ticker) clearInterval(s.ticker)
  if (s.finalizeTimeout) clearTimeout(s.finalizeTimeout)

  await s.micWriter.finalize()
  await s.systemWriter.finalize()

  const durationSec = Math.max(
    s.micWriter.durationSec,
    s.systemWriter.durationSec,
    Math.floor((Date.now() - s.startedAtMs) / 1000)
  )

  const settings = getSettings()
  const meeting =
    (await getMeeting(s.meetingId)) ?? defaultMeeting(s.meetingId, new Date(s.startedAtMs).toISOString())
  meeting.durationSec = Math.round(durationSec)

  const micWav = join(s.folder, 'mic.wav')
  const sysWav = join(s.folder, 'system.wav')

  // 1) Transcode to FLAC (independent, best-effort). On failure keep the WAVs.
  let micFinal = 'mic.wav'
  let systemFinal = 'system.wav'
  let format: 'wav' | 'flac' = 'wav'
  if (settings.audioFormat === 'flac') {
    try {
      await transcodeToFlac(micWav, join(s.folder, 'mic.flac'))
      await transcodeToFlac(sysWav, join(s.folder, 'system.flac'))
      micFinal = 'mic.flac'
      systemFinal = 'system.flac'
      format = 'flac'
      await rm(micWav, { force: true })
      await rm(sysWav, { force: true })
    } catch (err) {
      console.error('[finalize] FLAC transcode failed, keeping WAV:', err)
    }
  }

  // 2) Mixed track (independent, best-effort). Falls back to copying the mic
  //    track so there is always a playable combined file.
  let mixed: string | null = null
  if (settings.keepMixed) {
    const mixedName = `mixed.${format}`
    const micSrc = join(s.folder, micFinal)
    const sysSrc = join(s.folder, systemFinal)
    try {
      await mixTracks(micSrc, sysSrc, join(s.folder, mixedName), format === 'flac' ? 'flac' : 'pcm_s16le')
      mixed = mixedName
    } catch (err) {
      console.error('[finalize] mix failed, copying mic as mixed:', err)
      try {
        await copyFile(micSrc, join(s.folder, mixedName))
        mixed = mixedName
      } catch {
        /* leave mixed null */
      }
    }
  }

  meeting.audio = { mic: micFinal, system: systemFinal, mixed, format, sampleRate: s.sampleRate }
  await writeMeeting(meeting)

  session = null
  recordingStore.set({ status: 'idle', meetingId: null, startedAt: null, durationSec: 0 })
  broadcast(IPC.meetingsChangedEvent)

  // Opt-in automatic processing after the recording is saved.
  if (settings.autoTranscribe || settings.autoDiarize || settings.autoNotes) {
    void (async () => {
      try {
        if (settings.autoTranscribe) await runTranscription(s.meetingId, false)
        if (settings.autoDiarize) await runTranscription(s.meetingId, true)
        if (settings.autoNotes) await runNotes(s.meetingId)
      } catch (err) {
        console.error('[auto] post-recording processing failed:', err)
      }
    })()
  }
}

/** Receives PCM chunks + lifecycle events from the capture renderer. */
export function registerRecorderIpc(): void {
  ipcMain.on(IPC.recorderReady, () => markRendererReady())

  ipcMain.on(IPC.recorderChunk, (_e, track: RecorderTrack, buffer: ArrayBuffer) => {
    if (!session) return
    const buf = Buffer.from(buffer)
    if (track === 'mic') session.micWriter.write(buf)
    else session.systemWriter.write(buf)
  })

  ipcMain.on(IPC.recorderEvent, (_e, event: RecorderEvent) => {
    if (event.type === 'started') {
      onStarted()
    } else if (event.type === 'stopped') {
      void finalizeSession()
    } else if (event.type === 'error') {
      console.error('[recorder] capture error:', event.message)
      void finalizeSession()
    } else if (event.type === 'level') {
      broadcast(IPC.levelEvent, { mic: event.mic, system: event.system })
    }
  })
}
