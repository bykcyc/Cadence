import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { AppSettings, JobProgress, Meeting, MlState, RecordingState } from '@shared/types'
import { isRtl, resolveLocale, translate, type Locale } from '@shared/i18n'

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

interface AppContextValue {
  settings: AppSettings | null
  meetings: Meeting[]
  recording: RecordingState
  ml: MlState
  jobs: Record<string, JobProgress>
  loading: boolean
  locale: Locale
  t: TranslateFn
  refreshMeetings: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  toggleRecording: () => Promise<void>
  runTranscription: (id: string, diarize: boolean, numSpeakers?: number) => Promise<void>
  runNotes: (id: string) => Promise<void>
}

export function jobKey(meetingId: string, kind: JobProgress['kind']): string {
  return `${meetingId}:${kind}`
}

const AppContext = createContext<AppContextValue | null>(null)

const initialRecording: RecordingState = {
  status: 'idle',
  meetingId: null,
  startedAt: null,
  durationSec: 0
}

function applyTheme(theme: AppSettings['theme']): void {
  const root = document.documentElement
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
}

function currentLocale(settings: AppSettings | null): Locale {
  return resolveLocale(settings?.language ?? 'system', navigator.language)
}

function applyLocale(locale: Locale): void {
  const root = document.documentElement
  root.lang = locale
  root.dir = isRtl(locale) ? 'rtl' : 'ltr'
}

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [recording, setRecording] = useState<RecordingState>(initialRecording)
  const [ml, setMl] = useState<MlState>({ status: 'idle', message: '', device: null, progress: null })
  const [jobs, setJobs] = useState<Record<string, JobProgress>>({})
  const [loading, setLoading] = useState(true)

  const runTranscription = useCallback(
    async (id: string, diarize: boolean, numSpeakers?: number) => {
      await window.api.transcription.run(id, { diarize, numSpeakers })
    },
    []
  )

  const runNotes = useCallback(async (id: string) => {
    await window.api.transcription.runNotes(id)
  }, [])

  const refreshMeetings = useCallback(async () => {
    const list = await window.api.meetings.list()
    setMeetings(list)
  }, [])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await window.api.settings.set(patch)
    setSettings(next)
    if ('theme' in patch) applyTheme(next.theme)
    if ('language' in patch) applyLocale(currentLocale(next))
  }, [])

  const toggleRecording = useCallback(async () => {
    await window.api.recording.toggle()
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      const [s, r] = await Promise.all([
        window.api.settings.get(),
        window.api.recording.get()
      ])
      if (!active) return
      setSettings(s)
      applyTheme(s.theme)
      applyLocale(resolveLocale(s.language, navigator.language))
      setRecording(r)
      const mlState = await window.api.ml.get()
      if (active) setMl(mlState)
      await refreshMeetings()
      setLoading(false)
    })()

    const offState = window.api.recording.onState((state) => setRecording(state))
    const offChanged = window.api.meetings.onChanged(() => void refreshMeetings())
    const offMl = window.api.ml.onStatus((s) => setMl(s))
    const offJob = window.api.transcription.onProgress((p) =>
      setJobs((prev) => ({ ...prev, [`${p.meetingId}:${p.kind}`]: p }))
    )
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = (): void => {
      // Re-apply only when following the system theme.
      window.api.settings.get().then((s) => {
        if (s.theme === 'system') applyTheme('system')
      })
    }
    mq.addEventListener('change', onScheme)

    return () => {
      active = false
      offState()
      offChanged()
      offMl()
      offJob()
      mq.removeEventListener('change', onScheme)
    }
  }, [refreshMeetings])

  const locale = useMemo(() => currentLocale(settings), [settings])
  const t = useCallback<TranslateFn>((key, vars) => translate(locale, key, vars), [locale])

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      meetings,
      recording,
      ml,
      jobs,
      loading,
      locale,
      t,
      refreshMeetings,
      updateSettings,
      toggleRecording,
      runTranscription,
      runNotes
    }),
    [
      settings,
      meetings,
      recording,
      ml,
      jobs,
      loading,
      locale,
      t,
      refreshMeetings,
      updateSettings,
      toggleRecording,
      runTranscription,
      runNotes
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
