import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'node:path'
import type { AppSettings } from '@shared/types'
import { DEFAULT_NOTES_PROMPT } from '@shared/notes'
import { DEFAULT_POLISH_PROMPT } from '@shared/dictation'
import { UiohookKey } from 'uiohook-napi'

function defaultRecordsDir(): string {
  // Clean per-user default for fresh installs: C:\Users\<user>\Documents\Cadence\Records.
  // (Existing users keep whatever recordsDir is already stored in their settings.)
  return join(app.getPath('documents'), 'Cadence', 'Records')
}

let store: Store<AppSettings>

export function initSettings(): void {
  store = new Store<AppSettings>({
    name: 'settings',
    defaults: {
      recordsDir: defaultRecordsDir(),
      autoStart: true,
      startMinimized: true,
      micDeviceId: null,
      outputDeviceId: null,
      audioFormat: 'flac',
      keepMixed: true,
      captureSampleRate: 48000,
      theme: 'system',
      language: 'system',
      hfToken: null,
      mlPythonPath: null,
      // ASR device: 'cpu' is the lightweight default (ONNX, no GPU/PyTorch). 'gpu' uses
      // onnxruntime-gpu (~7× faster on long meetings, larger one-time install). Diarization = NeMo.
      asrDevice: 'cpu',
      notesProvider: 'deepseek',
      notesModels: {},
      notesApiKey: null,
      notesApiKeys: {},
      notesPrompt: DEFAULT_NOTES_PROMPT,
      autoTranscribe: false,
      autoDiarize: false,
      autoNotes: false,
      dictationEnabled: true,
      dictateHotkey: {
        keys: [UiohookKey.Ctrl, UiohookKey.Space],
        mode: 'hold',
        label: 'Ctrl + Space'
      },
      polishHotkey: {
        keys: [UiohookKey.Ctrl, UiohookKey.Shift, UiohookKey.Space],
        mode: 'hold',
        label: 'Ctrl + Shift + Space'
      },
      translateHotkey: {
        keys: [UiohookKey.Ctrl, UiohookKey.Alt, UiohookKey.Space],
        mode: 'hold',
        label: 'Ctrl + Alt + Space'
      },
      dictationOutput: 'insert',
      dictationRestoreClipboard: true,
      dictationPolishPrompt: DEFAULT_POLISH_PROMPT,
      dictationTranslateLang: 'English',
      dictationHistoryLimit: 5,
      overlayPosition: 'bottom',
      overlayOpacity: 1,
      ttsEnabled: true,
      ttsHotkey: {
        keys: [UiohookKey.Ctrl, UiohookKey.Alt, UiohookKey.R],
        mode: 'toggle',
        label: 'Ctrl + Alt + R'
      },
      ttsLang: 'auto',
      ttsVoice: 'ru-RU-SvetlanaNeural',
      ttsSpeed: 1.0,
      localApiEnabled: true,
      localApiPort: 47800,
      onboardingDone: false
    }
  })
  // Migrate the legacy single API key into the per-provider map, then clear it so this runs
  // only ONCE. Otherwise, after the user deletes their last per-provider key (which empties the
  // map back to {}), the next launch would re-migrate and resurrect the deleted key.
  const legacyKey = store.get('notesApiKey')
  if (legacyKey) {
    if (Object.keys(store.get('notesApiKeys') ?? {}).length === 0) {
      store.set('notesApiKeys', { [store.get('notesProvider')]: legacyKey })
    }
    store.set('notesApiKey', null)
  }

  // Migrate the old asrEngine setting (nemo/onnx) to asrDevice (gpu/cpu), once. 'onnx' was the
  // lightweight CPU engine → 'cpu'; 'nemo' was the GPU engine → 'gpu' (now ONNX-on-GPU). Users who
  // never chose one fall through to the 'cpu' default.
  const legacyStore = store as unknown as { get(k: string): unknown; delete(k: string): void }
  const legacyEngine = legacyStore.get('asrEngine')
  if (legacyEngine === 'nemo' || legacyEngine === 'onnx') {
    store.set('asrDevice', legacyEngine === 'nemo' ? 'gpu' : 'cpu')
    legacyStore.delete('asrEngine')
  }

  // Migrate the legacy single notesModel into the per-provider map, then drop it. OpenRouter model
  // ids look like "vendor/model", so route those to openrouter; everything else to the active
  // provider. (This unmangles the old bug where switching provider left the wrong model behind.)
  const legacyModel = legacyStore.get('notesModel')
  if (typeof legacyModel === 'string' && legacyModel) {
    if (Object.keys(store.get('notesModels') ?? {}).length === 0) {
      const target = legacyModel.includes('/') ? 'openrouter' : store.get('notesProvider')
      store.set('notesModels', { [target]: legacyModel })
    }
    legacyStore.delete('notesModel')
  }
}

export function getSettings(): AppSettings {
  return store.store
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return store.get(key)
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  store.set(patch)
  return store.store
}

export function getRecordsDir(): string {
  return store.get('recordsDir')
}
