import { ipcMain, BrowserWindow, dialog, app, clipboard, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { getSettings, setSettings } from './settings'
import { syncAutoStartFromSettings } from './autostart'
import { applyThemeToWindow } from './windows'
import { recordingStore } from './state'
import { startRecording, stopRecording, toggleRecording, registerRecorderIpc } from './recording'
import {
  listMeetings,
  getMeeting,
  renameMeeting,
  setProcessed,
  setSpeakerLabels,
  readArtifact,
  openRecordsFolder,
  openMeetingFolder,
  ensureRecordsDir,
  deleteMeeting
} from './meetings'
import { getMlState } from './ml-manager'
import { runTranscription } from './jobs/transcribe'
import { runNotes } from './jobs/notes'
import { startWatcher } from './watcher'
import { restartLocalApi } from './local-api'
import { getDictationState, applyDictationBindings } from './dictation'
import { applyOverlaySettings } from './overlay'
import { getHistory, clearHistory } from './dictation-history'
import { beginCapture, endCapture } from './hotkeys'
import { openLogs } from './logger'
import { broadcast } from './broadcast'
import { mt } from './i18n'
import type { AppSettings } from '@shared/types'

export function registerIpc(): void {
  registerRecorderIpc()

  // ML worker + transcription
  ipcMain.handle(IPC.mlGet, () => getMlState())
  ipcMain.handle(IPC.transcribeRun, (_e, id: string, opts: { diarize?: boolean }) =>
    runTranscription(id, !!opts?.diarize)
  )
  ipcMain.handle(IPC.notesRun, (_e, id: string) => runNotes(id))

  // ---- dictation ----
  ipcMain.handle(IPC.dictationGetState, () => getDictationState())
  ipcMain.handle(IPC.dictationHistoryGet, () => getHistory())
  ipcMain.handle(IPC.dictationHistoryClear, () => clearHistory())
  let captureResolve: ((b: { keys: number[]; label: string } | null) => void) | null = null
  ipcMain.handle(
    IPC.hotkeyCaptureBegin,
    () =>
      new Promise<{ keys: number[]; label: string } | null>((resolve) => {
        captureResolve = resolve
        beginCapture((b) => {
          endCapture()
          const r = captureResolve
          captureResolve = null
          r?.(b)
        })
      })
  )
  ipcMain.handle(IPC.hotkeyCaptureCancel, () => {
    endCapture()
    if (captureResolve) {
      const r = captureResolve
      captureResolve = null
      r(null)
    }
  })
  ipcMain.handle(IPC.readArtifact, (_e, id: string, relPath: string) => readArtifact(id, relPath))
  ipcMain.handle(IPC.setSpeakerLabels, (_e, id: string, labels: Record<string, string>) =>
    setSpeakerLabels(id, labels)
  )

  // ---- settings ----
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, async (_e, patch: Partial<AppSettings>) => {
    const next = setSettings(patch)
    if ('autoStart' in patch || 'startMinimized' in patch) {
      syncAutoStartFromSettings(next.autoStart, next.startMinimized)
    }
    if ('theme' in patch) applyThemeToWindow(next.theme)
    if ('overlayPosition' in patch || 'overlayOpacity' in patch) applyOverlaySettings()
    if ('recordsDir' in patch) {
      await ensureRecordsDir()
      startWatcher()
      broadcast(IPC.meetingsChangedEvent)
    }
    if ('localApiEnabled' in patch || 'localApiPort' in patch) restartLocalApi()
    if (
      'dictateHotkey' in patch ||
      'polishHotkey' in patch ||
      'translateHotkey' in patch ||
      'dictationEnabled' in patch ||
      'ttsHotkey' in patch ||
      'ttsEnabled' in patch
    ) {
      applyDictationBindings()
    }
    return next
  })
  ipcMain.handle(IPC.getVersion, () => app.getVersion())
  ipcMain.handle(IPC.copyText, (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle(IPC.openLogs, () => openLogs())
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) void shell.openExternal(url)
  })
  // Fetch the list of available models from OpenRouter (validates the key too).
  ipcMain.handle(
    IPC.llmGetModels,
    async (_e, apiKey: string): Promise<{ models?: string[]; error?: string }> => {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(20_000)
        })
        if (!res.ok) return { error: `HTTP ${res.status}` }
        const data = (await res.json()) as { data?: { id?: string }[] }
        const models = (data.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => typeof id === 'string')
          .sort()
        return { models }
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
    }
  )
  ipcMain.handle(IPC.chooseRecordsDir, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const dir = res.filePaths[0]
    setSettings({ recordsDir: dir })
    return dir
  })

  // ---- recording control ----
  ipcMain.handle(IPC.recordingGet, () => recordingStore.get())
  ipcMain.handle(IPC.recordingStart, () => startRecording())
  ipcMain.handle(IPC.recordingStop, () => stopRecording())
  ipcMain.handle(IPC.recordingToggle, () => toggleRecording())

  // ---- meetings ----
  ipcMain.handle(IPC.meetingsList, () => listMeetings())
  ipcMain.handle(IPC.meetingsGet, (_e, id: string) => getMeeting(id))
  ipcMain.handle(IPC.meetingsRename, (_e, id: string, title: string) => renameMeeting(id, title))
  ipcMain.handle(IPC.meetingsSetProcessed, async (_e, id: string, processed: boolean) => {
    const m = await setProcessed(id, processed, 'app')
    broadcast(IPC.meetingsChangedEvent)
    return m
  })
  ipcMain.handle(IPC.openRecordsFolder, () => openRecordsFolder())
  ipcMain.handle(IPC.openMeetingFolder, (_e, id: string) => openMeetingFolder(id))
  ipcMain.handle(IPC.meetingsDelete, async (_e, id: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: [mt('dialog.cancel'), mt('dialog.delete')],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
      message: mt('dialog.deleteTitle'),
      detail: mt('dialog.deleteDetail', { id })
    })
    if (res.response !== 1) return false
    const ok = await deleteMeeting(id)
    if (ok) broadcast(IPC.meetingsChangedEvent)
    return ok
  })

  // ---- push events to renderers ----
  recordingStore.on('change', (state) => broadcast(IPC.recordingStateEvent, state))
}
