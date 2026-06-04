// Central registry of IPC channel names + event payload types.
// Shared between the main process (handlers) and preload (invokers).

export const IPC = {
  // settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  chooseRecordsDir: 'app:chooseRecordsDir',
  getVersion: 'app:getVersion',
  copyText: 'app:copyText',
  openLogs: 'app:openLogs',
  openExternal: 'app:openExternal', // open an https URL in the default browser

  // recording control (UI/tray -> main orchestrator)
  recordingGet: 'recording:get',
  recordingStart: 'recording:start',
  recordingStop: 'recording:stop',
  recordingToggle: 'recording:toggle',
  recordingStateEvent: 'recording:state', // main -> renderer (push)

  // ML worker + transcription
  mlGet: 'ml:get',
  mlStatusEvent: 'ml:status', // main -> renderer (push)
  transcribeRun: 'transcribe:run', // (meetingId, { diarize })
  notesRun: 'notes:run', // (meetingId)
  jobProgressEvent: 'job:progress', // main -> renderer (push)
  readArtifact: 'meetings:readArtifact', // (meetingId, relPath) -> JSON
  setSpeakerLabels: 'meetings:setSpeakers', // (meetingId, labels)

  // meetings
  meetingsList: 'meetings:list',
  meetingsGet: 'meetings:get',
  meetingsRename: 'meetings:rename',
  meetingsSetProcessed: 'meetings:setProcessed',
  meetingsDelete: 'meetings:delete',
  openRecordsFolder: 'app:openRecordsFolder',
  openMeetingFolder: 'meetings:openFolder',
  meetingsChangedEvent: 'meetings:changed', // main -> renderer (push)

  // dictation (push-to-talk voice typing)
  dictationStateEvent: 'dictation:state', // main -> overlay/UI (push)
  dictationGetState: 'dictation:getState',
  dictationCaptureStart: 'dictation:capture-start', // main -> recorder renderer
  dictationCaptureStop: 'dictation:capture-stop', // main -> recorder renderer
  dictationAudio: 'dictation:audio', // recorder renderer -> main (16k mono wav)
  dictationLevel: 'dictation:level', // recorder renderer -> main -> overlay (live mic RMS 0..1)
  dictationCaptureError: 'dictation:capture-error', // recorder renderer -> main
  hotkeyCaptureBegin: 'hotkey:captureBegin', // UI -> main, resolves with captured binding
  hotkeyCaptureCancel: 'hotkey:captureCancel',
  dictationHistoryGet: 'dictation:historyGet',
  dictationHistoryClear: 'dictation:historyClear',

  // read-aloud (TTS): main -> renderer plays MP3 bytes; renderer -> main on end
  ttsPlay: 'tts:play',
  ttsStop: 'tts:stop',
  ttsEnded: 'tts:ended',

  // recorder capture bridge (main <-> recorder renderer)
  recorderReady: 'recorder:ready', // renderer -> main: capture bridge registered
  recorderStart: 'recorder:start',
  recorderStop: 'recorder:stop',
  recorderChunk: 'recorder:chunk',
  recorderEvent: 'recorder:event',
  levelEvent: 'recording:level', // main -> renderer (push live levels)

  // system-audio loopback toggle — channel names defined by electron-audio-loopback.
  // Must match the package's config (see node_modules/electron-audio-loopback/dist/config.js).
  loopbackEnable: 'enable-loopback-audio',
  loopbackDisable: 'disable-loopback-audio'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
