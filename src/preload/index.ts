import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  DictationHistoryItem,
  DictationState,
  JobProgress,
  LevelUpdate,
  Meeting,
  MlState,
  RecorderEvent,
  RecorderStartConfig,
  RecorderTrack,
  RecordingState
} from '@shared/types'

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSet, patch),
    chooseRecordsDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.chooseRecordsDir)
  },
  recording: {
    get: (): Promise<RecordingState> => ipcRenderer.invoke(IPC.recordingGet),
    start: (): Promise<void> => ipcRenderer.invoke(IPC.recordingStart),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.recordingStop),
    toggle: (): Promise<void> => ipcRenderer.invoke(IPC.recordingToggle),
    onState: (cb: (state: RecordingState) => void): (() => void) => {
      const listener = (_e: unknown, state: RecordingState): void => cb(state)
      ipcRenderer.on(IPC.recordingStateEvent, listener)
      return () => ipcRenderer.removeListener(IPC.recordingStateEvent, listener)
    }
  },
  meetings: {
    list: (): Promise<Meeting[]> => ipcRenderer.invoke(IPC.meetingsList),
    get: (id: string): Promise<Meeting | null> => ipcRenderer.invoke(IPC.meetingsGet, id),
    rename: (id: string, title: string): Promise<Meeting | null> =>
      ipcRenderer.invoke(IPC.meetingsRename, id, title),
    setProcessed: (id: string, processed: boolean): Promise<Meeting | null> =>
      ipcRenderer.invoke(IPC.meetingsSetProcessed, id, processed),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.meetingsDelete, id),
    openFolder: (id: string): Promise<void> => ipcRenderer.invoke(IPC.openMeetingFolder, id),
    readArtifact: <T = unknown>(id: string, relPath: string): Promise<T | null> =>
      ipcRenderer.invoke(IPC.readArtifact, id, relPath),
    setSpeakers: (id: string, labels: Record<string, string>): Promise<Meeting | null> =>
      ipcRenderer.invoke(IPC.setSpeakerLabels, id, labels),
    onChanged: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.meetingsChangedEvent, listener)
      return () => ipcRenderer.removeListener(IPC.meetingsChangedEvent, listener)
    }
  },
  ml: {
    get: (): Promise<MlState> => ipcRenderer.invoke(IPC.mlGet),
    onStatus: (cb: (s: MlState) => void): (() => void) => {
      const listener = (_e: unknown, s: MlState): void => cb(s)
      ipcRenderer.on(IPC.mlStatusEvent, listener)
      return () => ipcRenderer.removeListener(IPC.mlStatusEvent, listener)
    }
  },
  transcription: {
    run: (id: string, opts: { diarize?: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC.transcribeRun, id, opts),
    runNotes: (id: string): Promise<void> => ipcRenderer.invoke(IPC.notesRun, id),
    onProgress: (cb: (p: JobProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: JobProgress): void => cb(p)
      ipcRenderer.on(IPC.jobProgressEvent, listener)
      return () => ipcRenderer.removeListener(IPC.jobProgressEvent, listener)
    }
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.getVersion),
    openRecordsFolder: (): Promise<void> => ipcRenderer.invoke(IPC.openRecordsFolder),
    copyText: (text: string): Promise<void> => ipcRenderer.invoke(IPC.copyText, text),
    openLogs: (): Promise<void> => ipcRenderer.invoke(IPC.openLogs),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url)
  },
  // Live audio levels during recording / mic test (main -> renderer).
  onLevel: (cb: (level: LevelUpdate) => void): (() => void) => {
    const listener = (_e: unknown, level: LevelUpdate): void => cb(level)
    ipcRenderer.on(IPC.levelEvent, listener)
    return () => ipcRenderer.removeListener(IPC.levelEvent, listener)
  },
  // Capture bridge — used only by the recorder module inside the renderer.
  recorder: {
    ready: (): void => ipcRenderer.send(IPC.recorderReady),
    onStart: (cb: (cfg: RecorderStartConfig) => void): (() => void) => {
      const listener = (_e: unknown, cfg: RecorderStartConfig): void => cb(cfg)
      ipcRenderer.on(IPC.recorderStart, listener)
      return () => ipcRenderer.removeListener(IPC.recorderStart, listener)
    },
    onStop: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.recorderStop, listener)
      return () => ipcRenderer.removeListener(IPC.recorderStop, listener)
    },
    sendChunk: (track: RecorderTrack, buffer: ArrayBuffer): void =>
      ipcRenderer.send(IPC.recorderChunk, track, buffer),
    sendEvent: (event: RecorderEvent): void => ipcRenderer.send(IPC.recorderEvent, event)
  },
  loopback: {
    enable: (): Promise<void> => ipcRenderer.invoke(IPC.loopbackEnable),
    disable: (): Promise<void> => ipcRenderer.invoke(IPC.loopbackDisable)
  },
  dictation: {
    // recorder-renderer side (capture)
    onCaptureStart: (cb: (cfg: { micDeviceId: string | null }) => void): (() => void) => {
      const listener = (_e: unknown, cfg: { micDeviceId: string | null }): void => cb(cfg)
      ipcRenderer.on(IPC.dictationCaptureStart, listener)
      return () => ipcRenderer.removeListener(IPC.dictationCaptureStart, listener)
    },
    onCaptureStop: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.dictationCaptureStop, listener)
      return () => ipcRenderer.removeListener(IPC.dictationCaptureStop, listener)
    },
    sendAudio: (buffer: ArrayBuffer): void => ipcRenderer.send(IPC.dictationAudio, buffer),
    sendLevel: (level: number): void => ipcRenderer.send(IPC.dictationLevel, level),
    sendError: (message: string): void => ipcRenderer.send(IPC.dictationCaptureError, message),
    // UI side (overlay + settings)
    getState: (): Promise<DictationState> => ipcRenderer.invoke(IPC.dictationGetState),
    onLevel: (cb: (level: number) => void): (() => void) => {
      const listener = (_e: unknown, level: number): void => cb(level)
      ipcRenderer.on(IPC.dictationLevel, listener)
      return () => ipcRenderer.removeListener(IPC.dictationLevel, listener)
    },
    onState: (cb: (s: DictationState) => void): (() => void) => {
      const listener = (_e: unknown, s: DictationState): void => cb(s)
      ipcRenderer.on(IPC.dictationStateEvent, listener)
      return () => ipcRenderer.removeListener(IPC.dictationStateEvent, listener)
    },
    historyGet: (): Promise<DictationHistoryItem[]> => ipcRenderer.invoke(IPC.dictationHistoryGet),
    historyClear: (): Promise<void> => ipcRenderer.invoke(IPC.dictationHistoryClear),
    captureHotkey: (): Promise<{ keys: number[]; label: string } | null> =>
      ipcRenderer.invoke(IPC.hotkeyCaptureBegin),
    cancelHotkeyCapture: (): Promise<void> => ipcRenderer.invoke(IPC.hotkeyCaptureCancel)
  },
  // Read-aloud playback (main window renderer plays the MP3 from the TTS engine).
  tts: {
    onPlay: (cb: (audio: ArrayBuffer) => void): (() => void) => {
      const listener = (_e: unknown, audio: ArrayBuffer): void => cb(audio)
      ipcRenderer.on(IPC.ttsPlay, listener)
      return () => ipcRenderer.removeListener(IPC.ttsPlay, listener)
    },
    onStop: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.ttsStop, listener)
      return () => ipcRenderer.removeListener(IPC.ttsStop, listener)
    },
    sendEnded: (): void => ipcRenderer.send(IPC.ttsEnded)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type TranscriberApi = typeof api
