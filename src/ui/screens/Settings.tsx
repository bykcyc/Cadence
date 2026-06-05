import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FolderOpen, Activity, Square, Copy, Trash2 } from 'lucide-react'
import { useApp } from '../state/app'
import { Button, Card, Spinner, Toggle } from '../components/ui'
import { cn } from '../lib/cn'
import { startLevelMonitor, type LevelMonitor } from '../recorder/monitor'
import { DEFAULT_NOTES_PROMPT } from '@shared/notes'
import { DEFAULT_POLISH_PROMPT } from '@shared/dictation'
import { LOCALES, TRANSLATE_LANGUAGES } from '@shared/i18n'
import { DONATE_URL } from '@shared/links'
import type {
  AppSettings,
  DictationHistoryItem,
  DictationOutput,
  HotkeyBinding,
  HotkeyMode,
  NotesProvider
} from '@shared/types'

function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}): ReactNode {
  return (
    <div>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {title}
      </h2>
      <Card className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
        {description && (
          <p className="px-5 py-3 text-xs leading-relaxed text-neutral-500">{description}</p>
        )}
        {children}
      </Card>
    </div>
  )
}

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): ReactNode {
  return (
    <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-700/60">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1 text-sm font-medium transition-colors',
            value === o.value
              ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-white'
              : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function selectClass(): string {
  return 'app-no-drag w-56 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-800 focus:border-accent-400 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100'
}

function inputClass(): string {
  return 'app-no-drag w-64 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-800 focus:border-accent-400 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100'
}

function LevelBar({ value, label }: { value: number; label: string }): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-xs text-neutral-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className="h-full rounded-full bg-accent-500 transition-[width] duration-75"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  )
}

function HotkeyField({
  binding,
  onChange
}: {
  binding: HotkeyBinding
  onChange: (b: HotkeyBinding) => void
}): ReactNode {
  const { t } = useApp()
  const [capturing, setCapturing] = useState(false)
  const capture = async (): Promise<void> => {
    setCapturing(true)
    try {
      const res = await window.api.dictation.captureHotkey()
      if (res) onChange({ ...binding, keys: res.keys, label: res.label })
    } finally {
      setCapturing(false)
    }
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => void capture()}
        className={cn(
          'app-no-drag min-w-[150px] rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-colors',
          capturing
            ? 'bg-accent-50 text-accent-700 ring-accent-300 dark:bg-accent-500/15 dark:text-accent-100'
            : 'bg-white text-neutral-800 ring-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-neutral-700'
        )}
      >
        {capturing ? t('hotkey.press') : binding.label}
      </button>
      <Segmented<HotkeyMode>
        value={binding.mode}
        onChange={(m) => onChange({ ...binding, mode: m })}
        options={[
          { value: 'hold', label: t('hotkey.hold') },
          { value: 'toggle', label: t('hotkey.toggle') }
        ]}
      />
    </div>
  )
}

function HistoryList(): ReactNode {
  const { t, locale } = useApp()
  const [items, setItems] = useState<DictationHistoryItem[]>([])
  const refresh = (): void => void window.api.dictation.historyGet().then(setItems)
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 4000)
    return () => clearInterval(id)
  }, [])
  if (items.length === 0) {
    return <div className="px-5 py-4 text-sm text-neutral-500">{t('history.empty')}</div>
  }
  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
      {items.map((it) => (
        <div key={it.id} className="flex items-start gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-neutral-800 dark:text-neutral-100">{it.text}</div>
            <div className="mt-0.5 text-xs text-neutral-400">
              {it.kind === 'translate'
                ? t('kind.translate')
                : it.kind === 'polish'
                  ? t('kind.deepseek')
                  : t('kind.dictation')}{' '}
              ·{' '}
              {new Date(it.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button
            title={t('history.copy')}
            onClick={() => void window.api.app.copyText(it.text)}
            className="app-no-drag mt-0.5 shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-200/70 hover:text-neutral-700 dark:hover:bg-neutral-700/70"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

function DictationSection(): ReactNode {
  const { settings, updateSettings, t } = useApp()
  if (!settings) return null
  const set = (patch: Partial<AppSettings>): void => void updateSettings(patch)
  return (
    <>
      <Section title={t('section.dictation')}>
        <Row label={t('field.dictationEnable')}>
          <Toggle checked={settings.dictationEnabled} onChange={(v) => set({ dictationEnabled: v })} />
        </Row>
        <Row label={t('field.hotkeyDictate')}>
          <HotkeyField binding={settings.dictateHotkey} onChange={(b) => set({ dictateHotkey: b })} />
        </Row>
        <Row label={t('field.hotkeyPolish')}>
          <HotkeyField binding={settings.polishHotkey} onChange={(b) => set({ polishHotkey: b })} />
        </Row>
        <Row label={t('field.hotkeyTranslate')}>
          <HotkeyField
            binding={settings.translateHotkey}
            onChange={(b) => set({ translateHotkey: b })}
          />
        </Row>
        <Row label={t('field.translateLang')}>
          <select
            className={selectClass()}
            value={settings.dictationTranslateLang}
            onChange={(e) => set({ dictationTranslateLang: e.target.value })}
          >
            {TRANSLATE_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('field.dictationOutput')}>
          <Segmented<DictationOutput>
            value={settings.dictationOutput}
            onChange={(v) => set({ dictationOutput: v })}
            options={[
              { value: 'insert', label: t('opt.insert') },
              { value: 'clipboard', label: t('opt.clipboard') }
            ]}
          />
        </Row>
        <Row label={t('field.restoreClipboard')}>
          <Toggle
            checked={settings.dictationRestoreClipboard}
            onChange={(v) => set({ dictationRestoreClipboard: v })}
          />
        </Row>
        <div className="px-5 py-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
              {t('field.promptDeepseek')}
            </span>
            <button
              onClick={() => set({ dictationPolishPrompt: DEFAULT_POLISH_PROMPT })}
              className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-300"
            >
              {t('common.reset')}
            </button>
          </div>
          <textarea
            value={settings.dictationPolishPrompt}
            onChange={(e) => set({ dictationPolishPrompt: e.target.value })}
            rows={7}
            className="app-no-drag w-full resize-y rounded-lg border border-neutral-200 bg-white p-3 font-mono text-xs leading-relaxed text-neutral-800 focus:border-accent-400 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <p className="mt-1.5 text-xs text-neutral-400">{t('dictPrompt.vars')}</p>
        </div>
      </Section>

      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {t('section.historyDictation')}
          </h2>
          <button
            onClick={() => void window.api.dictation.historyClear()}
            className="app-no-drag inline-flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t('common.clear')}
          </button>
        </div>
        <Card>
          <HistoryList />
        </Card>
      </div>
    </>
  )
}

export function SettingsScreen(): ReactNode {
  const { settings, updateSettings, t } = useApp()
  const [version, setVersion] = useState('')
  useEffect(() => void window.api.app.getVersion().then(setVersion), [])
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])
  const [orModels, setOrModels] = useState<string[]>([])
  const [modelsMsg, setModelsMsg] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  const [monitoring, setMonitoring] = useState(false)
  const [levels, setLevels] = useState({ mic: 0, system: 0 })
  const [monitorInfo, setMonitorInfo] = useState<{ hasMic: boolean; hasSystem: boolean } | null>(
    null
  )
  const monitorRef = useRef<LevelMonitor | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        s.getTracks().forEach((t) => t.stop())
      } catch {
        /* labels may be blank without permission */
      }
      const devices = await navigator.mediaDevices.enumerateDevices()
      if (!active) return
      setInputs(devices.filter((d) => d.kind === 'audioinput'))
      setOutputs(devices.filter((d) => d.kind === 'audiooutput'))
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    return () => monitorRef.current?.stop()
  }, [])

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        <Spinner />
      </div>
    )
  }

  const set = (patch: Partial<AppSettings>): void => void updateSettings(patch)

  const fetchModels = async (): Promise<void> => {
    setLoadingModels(true)
    setModelsMsg('')
    const res = await window.api.llm.getModels(settings.notesApiKeys?.openrouter ?? '')
    setLoadingModels(false)
    if (res.models) {
      setOrModels(res.models)
      setModelsMsg(t('llm.modelsLoaded', { n: res.models.length }))
    } else {
      setModelsMsg(t('llm.modelsError'))
    }
  }

  const toggleMonitor = async (): Promise<void> => {
    if (monitoring) {
      monitorRef.current?.stop()
      monitorRef.current = null
      setMonitoring(false)
      setLevels({ mic: 0, system: 0 })
      return
    }
    setMonitoring(true)
    const mon = await startLevelMonitor(settings.micDeviceId, (l) => setLevels(l))
    monitorRef.current = mon
    setMonitorInfo({ hasMic: mon.hasMic, hasSystem: mon.hasSystem })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 pt-7 pb-4">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
          {t('settings.title')}
        </h1>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-8 pb-10">
        <Section title={t('section.recording')}>
          <Row label={t('field.mic')}>
            <select
              className={selectClass()}
              value={settings.micDeviceId ?? 'default'}
              onChange={(e) => set({ micDeviceId: e.target.value === 'default' ? null : e.target.value })}
            >
              <option value="default">{t('opt.default')}</option>
              {inputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `${t('field.mic')} ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('field.output')}>
            <select
              className={selectClass()}
              value={settings.outputDeviceId ?? 'default'}
              onChange={(e) =>
                set({ outputDeviceId: e.target.value === 'default' ? null : e.target.value })
              }
            >
              <option value="default">{t('opt.default')}</option>
              {outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `${t('field.outputShort')} ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('field.keepMix')}>
            <Toggle checked={settings.keepMixed} onChange={(v) => set({ keepMixed: v })} />
          </Row>
          <Row label={t('field.levelCheck')}>
            <Button variant={monitoring ? 'danger' : 'secondary'} onClick={() => void toggleMonitor()}>
              {monitoring ? <Square className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
              {monitoring ? t('btn.stop') : t('btn.check')}
            </Button>
          </Row>
          <Row label={t('field.asrEngine')} hint={t('asr.hint')}>
            {/* CPU = ONNX (light, default), GPU = NeMo (fast, needs NVIDIA). Labeled by what the
                user actually cares about (device/speed), not the backend's name. */}
            <Segmented<'onnx' | 'nemo'>
              value={settings.asrEngine}
              onChange={(v) => set({ asrEngine: v })}
              options={[
                { value: 'onnx', label: 'CPU' },
                { value: 'nemo', label: 'GPU' }
              ]}
            />
          </Row>
          {monitoring && (
            <div className="space-y-2 px-5 py-4">
              <LevelBar label={t('level.mic')} value={levels.mic} />
              <LevelBar label={t('level.meeting')} value={levels.system} />
              {monitorInfo && (!monitorInfo.hasMic || !monitorInfo.hasSystem) && (
                <p className="pt-1 text-xs text-amber-600 dark:text-amber-400">
                  {!monitorInfo.hasMic && t('level.micUnavailable')}
                  {!monitorInfo.hasSystem && t('level.systemUnavailable')}
                </p>
              )}
            </div>
          )}
        </Section>

        <DictationSection />

        <Section title={t('section.tts')}>
          <Row label={t('field.ttsEnable')}>
            <Toggle checked={settings.ttsEnabled} onChange={(v) => set({ ttsEnabled: v })} />
          </Row>
          <Row label={t('field.ttsHotkey')}>
            <HotkeyField binding={settings.ttsHotkey} onChange={(b) => set({ ttsHotkey: b })} />
          </Row>
          <Row label={t('field.ttsLang')}>
            <select
              className={selectClass()}
              value={settings.ttsLang}
              onChange={(e) => set({ ttsLang: e.target.value })}
            >
              <option value="auto">{t('tts.langAuto')}</option>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('field.ttsSpeed')}>
            <Segmented
              value={String(settings.ttsSpeed)}
              onChange={(v) => set({ ttsSpeed: Number(v) })}
              options={[
                { value: '0.8', label: '0.8×' },
                { value: '1', label: '1×' },
                { value: '1.2', label: '1.2×' },
                { value: '1.5', label: '1.5×' }
              ]}
            />
          </Row>
        </Section>

        <Section title={t('section.llm')} description={t('section.llm.desc')}>
          <Row label={t('field.provider')}>
            <Segmented<NotesProvider>
              value={settings.notesProvider}
              onChange={(v) => set({ notesProvider: v })}
              options={[
                { value: 'deepseek', label: 'DeepSeek' },
                { value: 'openrouter', label: 'OpenRouter' },
                { value: 'mistral', label: 'Mistral' }
              ]}
            />
          </Row>
          <Row label={t('field.model')}>
            <div className="relative flex flex-col items-end gap-1.5">
              <input
                className={inputClass()}
                placeholder="deepseek-v4-flash"
                value={settings.notesModel}
                onChange={(e) => {
                  set({ notesModel: e.target.value })
                  setModelOpen(true)
                }}
                onFocus={() => orModels.length > 0 && setModelOpen(true)}
                onBlur={() => window.setTimeout(() => setModelOpen(false), 150)}
              />
              {settings.notesProvider === 'openrouter' &&
                modelOpen &&
                orModels.length > 0 &&
                (() => {
                  const q = settings.notesModel.toLowerCase()
                  const matches = orModels.filter((m) => m.toLowerCase().includes(q)).slice(0, 200)
                  if (matches.length === 0) return null
                  return (
                    <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-900">
                      {matches.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className="block w-full truncate px-2.5 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700/60"
                          // onMouseDown (not onClick) + preventDefault: fires before the input's
                          // onBlur, so the selection registers without the dropdown closing first.
                          onMouseDown={(e) => {
                            e.preventDefault()
                            set({ notesModel: m })
                            setModelOpen(false)
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )
                })()}
              {settings.notesProvider === 'openrouter' && (
                <div className="flex items-center gap-2">
                  {modelsMsg && <span className="text-xs text-neutral-500">{modelsMsg}</span>}
                  <Button
                    variant="secondary"
                    onClick={() => void fetchModels()}
                    disabled={loadingModels || !settings.notesApiKeys?.openrouter}
                  >
                    {loadingModels ? <Spinner /> : t('field.getModels')}
                  </Button>
                </div>
              )}
            </div>
          </Row>
          <Row label={t('field.apiKey')}>
            <input
              type="password"
              className={inputClass()}
              placeholder={t('placeholder.providerKey')}
              value={settings.notesApiKeys?.[settings.notesProvider] ?? ''}
              onChange={(e) =>
                set({
                  notesApiKeys: {
                    ...settings.notesApiKeys,
                    [settings.notesProvider]: e.target.value || undefined
                  }
                })
              }
            />
          </Row>
        </Section>

        <Section title={t('section.notesPrompt')}>
          <div className="px-5 py-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {t('field.template')}
              </span>
              <button
                onClick={() => set({ notesPrompt: DEFAULT_NOTES_PROMPT })}
                className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-300"
              >
                {t('common.reset')}
              </button>
            </div>
            <textarea
              value={settings.notesPrompt}
              onChange={(e) => set({ notesPrompt: e.target.value })}
              rows={7}
              className="app-no-drag w-full resize-y rounded-lg border border-neutral-200 bg-white p-3 font-mono text-xs leading-relaxed text-neutral-800 focus:border-accent-400 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <p className="mt-1.5 text-xs text-neutral-400">{t('notesPrompt.vars')}</p>
          </div>
        </Section>

        <Section title={t('section.diarization')} description={t('section.diarization.desc')}>
          <Row label={t('field.hfToken')}>
            <input
              type="password"
              className={inputClass()}
              placeholder="hf_..."
              value={settings.hfToken ?? ''}
              onChange={(e) => set({ hfToken: e.target.value || null })}
            />
          </Row>
        </Section>

        <Section title={t('section.autoAfter')}>
          <Row label={t('field.autoTranscript')}>
            <Toggle checked={settings.autoTranscribe} onChange={(v) => set({ autoTranscribe: v })} />
          </Row>
          <Row label={t('field.autoDiarize')}>
            <Toggle checked={settings.autoDiarize} onChange={(v) => set({ autoDiarize: v })} />
          </Row>
          <Row label={t('field.autoNotes')}>
            <Toggle checked={settings.autoNotes} onChange={(v) => set({ autoNotes: v })} />
          </Row>
        </Section>

        <Section title={t('section.overlay')}>
          <Row label={t('field.overlayPos')}>
            <Segmented<'bottom' | 'top'>
              value={settings.overlayPosition}
              onChange={(v) => set({ overlayPosition: v })}
              options={[
                { value: 'bottom', label: t('opt.bottom') },
                { value: 'top', label: t('opt.top') }
              ]}
            />
          </Row>
          <Row label={t('field.overlayOpacity')}>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={settings.overlayOpacity}
              onChange={(e) => set({ overlayOpacity: Number(e.target.value) })}
              className="app-no-drag w-40 accent-accent-500"
            />
          </Row>
        </Section>

        <Section title={t('section.recordsFolder')}>
          <Row label={settings.recordsDir}>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  const dir = await window.api.settings.chooseRecordsDir()
                  if (dir) void updateSettings({ recordsDir: dir })
                }}
              >
                {t('common.change')}
              </Button>
              <Button variant="ghost" onClick={() => void window.api.app.openRecordsFolder()}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </Row>
        </Section>

        <Section title={t('section.system')}>
          <Row label={t('field.language')}>
            <select
              className={selectClass()}
              value={settings.language}
              onChange={(e) => set({ language: e.target.value as AppSettings['language'] })}
            >
              <option value="system">{t('opt.themeSystem')}</option>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('field.autoStart')}>
            <Toggle checked={settings.autoStart} onChange={(v) => set({ autoStart: v })} />
          </Row>
          <Row label={t('field.startMinimized')}>
            <Toggle checked={settings.startMinimized} onChange={(v) => set({ startMinimized: v })} />
          </Row>
          <Row label={t('field.theme')}>
            <Segmented
              value={settings.theme}
              onChange={(v) => set({ theme: v })}
              options={[
                { value: 'system', label: t('opt.themeSystem') },
                { value: 'light', label: t('opt.themeLight') },
                { value: 'dark', label: t('opt.themeDark') }
              ]}
            />
          </Row>
        </Section>

        <Section title={t('section.integration')} description={t('section.integration.desc')}>
          <Row label={t('field.localApi')}>
            <Toggle checked={settings.localApiEnabled} onChange={(v) => set({ localApiEnabled: v })} />
          </Row>
          {settings.localApiEnabled && (
            <Row label={`${t('field.port')} (127.0.0.1:${settings.localApiPort})`}>
              <input
                type="number"
                className={inputClass()}
                value={settings.localApiPort}
                onChange={(e) => set({ localApiPort: Number(e.target.value) || 47800 })}
              />
            </Row>
          )}
        </Section>

        <Section title={t('section.about')}>
          <Row label={t('field.developer')}>
            <span className="text-sm text-neutral-500">Jurijs Ivanenko</span>
          </Row>
          <Row label={t('field.version')}>
            <span className="text-sm text-neutral-500">{version || '—'}</span>
          </Row>
          <Row label={t('field.logs')}>
            <Button variant="secondary" onClick={() => void window.api.app.openLogs()}>
              {t('btn.openLogs')}
            </Button>
          </Row>
          <Row label={t('field.support')}>
            <Button
              variant="secondary"
              title={t('support.tooltip')}
              onClick={() => void window.api.app.openExternal(DONATE_URL)}
            >
              {t('btn.support')}
            </Button>
          </Row>
        </Section>
      </div>
    </div>
  )
}
