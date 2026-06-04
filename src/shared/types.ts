// Shared domain types used by main, preload and renderer.

import type { LanguageSetting } from './i18n'

export type ArtifactStatus = 'none' | 'queued' | 'running' | 'done' | 'error'

export interface ArtifactState {
  status: ArtifactStatus
  path: string | null
  engine?: string | null
  model?: string | null
  completedAt?: string | null
  error?: string | null
}

export interface MeetingAudio {
  mic: string | null
  system: string | null
  mixed: string | null
  format: AudioFormat
  sampleRate: number
}

/** Persisted per-meeting metadata — written as meeting.json in each recording folder.
 *  This file is the integration contract for external tools (see iteration 4). */
export interface Meeting {
  schemaVersion: number
  id: string // folder name == timestamp, stable id
  title: string
  createdAt: string // ISO 8601 with timezone
  durationSec: number
  language: string | null
  audio: MeetingAudio
  artifacts: {
    transcript: ArtifactState
    diarizedTranscript: ArtifactState
    notes: ArtifactState
  }
  speakers: Record<string, string>
  processed: boolean
  processedAt: string | null
  processedBy: string | null
  tags: string[]
}

export const MEETING_SCHEMA_VERSION = 1

export type AudioFormat = 'wav' | 'flac'

export interface AppSettings {
  recordsDir: string
  autoStart: boolean
  startMinimized: boolean
  micDeviceId: string | null
  outputDeviceId: string | null
  audioFormat: AudioFormat
  keepMixed: boolean
  captureSampleRate: number
  theme: 'system' | 'light' | 'dark'
  // UI language. 'system' follows the OS locale (falls back to English).
  language: LanguageSetting
  // Diarization (iteration 2): Hugging Face token for pyannote (optional).
  hfToken: string | null
  // Optional override: path to the ML venv's python.exe. Empty = auto-detect.
  mlPythonPath: string | null
  // Meeting notes (iteration 3).
  notesProvider: NotesProvider
  notesModel: string
  notesApiKey: string | null
  notesPrompt: string
  // Automation: run steps automatically after a recording finishes.
  autoTranscribe: boolean
  autoDiarize: boolean
  autoNotes: boolean
  // Dictation (push-to-talk voice typing).
  dictationEnabled: boolean
  dictateHotkey: HotkeyBinding
  polishHotkey: HotkeyBinding
  translateHotkey: HotkeyBinding
  dictationOutput: DictationOutput
  dictationRestoreClipboard: boolean
  dictationPolishPrompt: string
  // Target language (English name, e.g. "English") for the "dictation + DeepSeek + translate" mode.
  dictationTranslateLang: string
  dictationHistoryLimit: number
  overlayPosition: 'bottom' | 'top'
  overlayOpacity: number
  // Read-aloud (TTS): speak the selected text via Edge online voices.
  ttsEnabled: boolean
  ttsHotkey: HotkeyBinding
  ttsVoice: string
  ttsSpeed: number
  // External integration (iteration 4): local HTTP API for task-bots.
  localApiEnabled: boolean
  localApiPort: number
}

export type NotesProvider = 'deepseek' | 'openrouter' | 'mistral'

// ---- Dictation (push-to-talk voice typing) ----

export type HotkeyMode = 'hold' | 'toggle'

export interface HotkeyBinding {
  keys: number[] // uiohook keycodes, matched as an exact set
  mode: HotkeyMode
  label: string // human-readable, e.g. "Ctrl + Space"
}

export type DictationOutput = 'insert' | 'clipboard'

export type DictationKind = 'plain' | 'polish' | 'translate'

export type DictationPhase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'processing'
  | 'inserting'
  | 'done'
  | 'error'

export interface DictationState {
  phase: DictationPhase
  kind: DictationKind | null
  message: string
}

export interface DictationHistoryItem {
  id: string
  at: string
  kind: DictationKind
  text: string
}

export type RecordingStatus = 'idle' | 'starting' | 'recording' | 'stopping'

export interface RecordingState {
  status: RecordingStatus
  meetingId: string | null
  startedAt: string | null
  durationSec: number
}

export interface AudioDevice {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
}

export type RecorderTrack = 'mic' | 'system'

export interface RecorderStartConfig {
  meetingId: string
  sampleRate: number
  micDeviceId: string | null
  outputDeviceId: string | null
}

export type RecorderEvent =
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'error'; message: string }
  | { type: 'level'; mic: number; system: number }

/** Live audio levels (0..1 RMS) pushed to the UI during recording / mic test. */
export interface LevelUpdate {
  mic: number
  system: number
}

export interface TranscriptSegment {
  speaker: string // 'me' | 'them' | 'spk_1' ...
  start: number
  end: number
  text: string
}

export interface TranscriptFile {
  language: string | null
  durationSec: number
  diarized: boolean
  engine: string
  createdAt: string
  segments: TranscriptSegment[]
  text: string
}

export type MlStatus = 'idle' | 'setup' | 'starting' | 'ready' | 'error'

export interface MlState {
  status: MlStatus
  message: string
  device: string | null
  progress: number | null // 0..1 during setup, else null
}

export type JobKind = 'transcript' | 'diarizedTranscript' | 'notes'

export interface JobProgress {
  meetingId: string
  kind: JobKind
  status: ArtifactStatus
  message: string
}
