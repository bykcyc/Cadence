import { app, BrowserWindow } from 'electron'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { initMain as initLoopback } from 'electron-audio-loopback'
import { initSettings, getSettings } from './settings'
import { ensureRecordsDir } from './meetings'
import { createMainWindow, showMainWindow, setQuitting, getMainWindow, applyThemeToWindow } from './windows'
import { createTray } from './tray'
import { syncAutoStartFromSettings } from './autostart'
import { registerIpc } from './ipc'
import { recordingStore } from './state'
import { startRecording, stopRecording } from './recording'
import { listMeetings, getMeeting } from './meetings'
import { runTranscription } from './jobs/transcribe'
import { registerMediaSchemePrivileges, registerMediaProtocol } from './media-protocol'
import { applyContentSecurityPolicy } from './security'
import { stopWorker } from './ml-manager'
import { startWatcher, stopWatcher } from './watcher'
import { startLocalApi, stopLocalApi } from './local-api'
import { initHistory } from './dictation-history'
import { registerDictation, stopDictation } from './dictation'
import { registerTts } from './tts'
import { destroyOverlay } from './overlay'
import { initLogger } from './logger'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Headless capture check: record ~6s then quit. Enabled only via --selftest-record. */
async function runSelfTestRecord(): Promise<void> {
  await delay(2500) // let the renderer + audio graph initialise
  await startRecording()
  await delay(6000)
  await stopRecording()
  await new Promise<void>((resolve) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (recordingStore.get().status === 'idle' || Date.now() - started > 9000) {
        clearInterval(timer)
        resolve()
      }
    }, 200)
  })
  setQuitting(true)
  app.quit()
}

/** Transcribe the newest meeting then quit. Verification only (--selftest-transcribe). */
async function runSelfTestTranscribe(): Promise<void> {
  await delay(800)
  const meetings = await listMeetings()
  if (meetings.length === 0) {
    console.log('[selftest] no meetings')
    setQuitting(true)
    app.quit()
    return
  }
  const id = meetings[0].id
  console.log('[selftest] transcribing', id)
  await runTranscription(id, false)
  const m = await getMeeting(id)
  console.log('[selftest] transcript status:', m?.artifacts.transcript.status)
  setQuitting(true)
  app.quit()
}

/** Capture the meetings + settings screens to PNGs, then quit. Dev/verification only. */
async function runScreenshots(): Promise<void> {
  const win = getMainWindow()
  if (!win) return
  if (win.webContents.isLoading()) {
    await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()))
  }
  await delay(1500)
  const out = join(app.getAppPath(), 'screenshots')
  await mkdir(out, { recursive: true })
  const meetings = await win.webContents.capturePage()
  await writeFile(join(out, 'meetings.png'), meetings.toPNG())

  await win.webContents.executeJavaScript("location.hash = '#settings'")
  await delay(900)
  await writeFile(join(out, 'settings.png'), (await win.webContents.capturePage()).toPNG())

  const all = await listMeetings()
  if (all[0]) {
    await win.webContents.executeJavaScript(`location.hash = '#meeting/${all[0].id}'`)
    await delay(1200)
    await writeFile(join(out, 'detail.png'), (await win.webContents.capturePage()).toPNG())
  }
  setQuitting(true)
  app.quit()
}

// Must run before app is ready: appends the loopback feature switches and
// registers the enable/disable-loopback-audio IPC handlers.
initLoopback()
// Must run before app is ready: registers the tmedia:// scheme as privileged.
registerMediaSchemePrivileges()

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.cadence.app')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    initLogger()
    initSettings()
    initHistory()
    await ensureRecordsDir()
    applyContentSecurityPolicy()
    registerMediaProtocol()
    // Skip autostart registration in automation runs so a temp build path
    // never gets written into Windows startup.
    const automation =
      process.argv.includes('--selftest-record') ||
      process.argv.includes('--screenshots') ||
      process.argv.includes('--selftest-transcribe')
    if (!automation) syncAutoStartFromSettings(getSettings().autoStart, getSettings().startMinimized)
    registerIpc()
    if (!automation) {
      startWatcher()
      startLocalApi()
      registerTts() // TTS playback-ended IPC; hotkey bindings applied via dictation manager
      registerDictation() // starts the global key hook; bindings active only if enabled
    }

    const launchedHidden = process.argv.includes('--hidden')
    createMainWindow(!launchedHidden)
    applyThemeToWindow(getSettings().theme)
    createTray()

    if (process.argv.includes('--selftest-record')) {
      void runSelfTestRecord()
    }
    if (process.argv.includes('--screenshots')) {
      void runScreenshots()
    }
    if (process.argv.includes('--selftest-transcribe')) {
      void runSelfTestTranscribe()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(true)
      else showMainWindow()
    })
  })

  // App lives in the tray; closing the window hides it. Keep running when no
  // windows are visible. (We never reach the macOS-only quit path on Windows.)
  app.on('window-all-closed', () => {
    // intentionally empty: stay alive in tray
  })

  app.on('before-quit', () => {
    stopWorker()
    stopWatcher()
    stopLocalApi()
    stopDictation()
    destroyOverlay()
  })
}
