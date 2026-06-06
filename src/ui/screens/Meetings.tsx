import { useEffect, useState, type ReactNode } from 'react'
import {
  AudioLines,
  ChevronLeft,
  FolderOpen,
  Pencil,
  Check,
  FileText,
  Users,
  StickyNote,
  Clock,
  Mic,
  Wand2,
  AlertCircle,
  CheckCircle2,
  Circle,
  Trash2
} from 'lucide-react'
import type { JobKind, Meeting, TranscriptFile, TranscriptSegment } from '@shared/types'
import { currentApiKey } from '@shared/notes'
import { useApp, jobKey } from '../state/app'
import { formatDuration, formatDateTime, formatRelativeDay } from '../lib/format'
import { mediaUrl } from '../lib/media'
import { cn } from '../lib/cn'
import { Badge, Button, Card, IconButton, Spinner, Toggle } from '../components/ui'

type Filter = 'all' | 'unprocessed' | 'processed'

function meetingIdFromHash(): string | null {
  const m = window.location.hash.match(/^#meeting\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export function MeetingsScreen(): ReactNode {
  const { meetings, loading } = useApp()
  const [selectedId, setSelectedId] = useState<string | null>(meetingIdFromHash)
  // Deep-link support (used for automated screenshots; harmless otherwise).
  useEffect(() => {
    const onHash = (): void => {
      const id = meetingIdFromHash()
      if (id) setSelectedId(id)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const selected = meetings.find((m) => m.id === selectedId) ?? null

  if (selected) {
    return <MeetingDetail meeting={selected} onBack={() => setSelectedId(null)} />
  }
  return <MeetingList meetings={meetings} loading={loading} onOpen={setSelectedId} />
}

function RowActions({ meeting }: { meeting: Meeting }): ReactNode {
  const { runTranscription, runNotes, jobs, settings, t } = useApp()
  const hasTranscript =
    meeting.artifacts.transcript.status === 'done' ||
    meeting.artifacts.diarizedTranscript.status === 'done'

  const items: {
    key: JobKind
    label: string
    icon: typeof FileText
    artifact: { status: string }
    run: () => Promise<void>
    disabled?: boolean
    title?: string
  }[] = [
    {
      key: 'transcript',
      label: t('action.transcript'),
      icon: FileText,
      artifact: meeting.artifacts.transcript,
      run: () => runTranscription(meeting.id, false)
    },
    {
      key: 'diarizedTranscript',
      label: t('action.speakers'),
      icon: Users,
      artifact: meeting.artifacts.diarizedTranscript,
      run: () => runTranscription(meeting.id, true),
      title: settings?.hfToken ? undefined : t('tip.needHfToken')
    },
    {
      key: 'notes',
      label: t('action.notes'),
      icon: StickyNote,
      artifact: meeting.artifacts.notes,
      run: () => runNotes(meeting.id),
      disabled: !hasTranscript,
      title: hasTranscript ? undefined : t('tip.needTranscript')
    }
  ]

  return (
    <div className="flex items-center gap-1.5">
      {items.map((it) => {
        const job = jobs[jobKey(meeting.id, it.key)]
        const running = it.artifact.status === 'running' || job?.status === 'running'
        const done = it.artifact.status === 'done'
        const error = it.artifact.status === 'error'
        const Icon = it.icon
        return (
          <button
            key={it.key}
            title={it.title}
            disabled={running || it.disabled}
            onClick={(e) => {
              e.stopPropagation()
              void it.run()
            }}
            className={cn(
              'app-no-drag inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
              done
                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300'
                : error
                  ? 'bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 dark:bg-neutral-700/60 dark:text-neutral-300 dark:hover:bg-neutral-700'
            )}
          >
            {running ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : done ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

function MeetingList({
  meetings,
  loading,
  onOpen
}: {
  meetings: Meeting[]
  loading: boolean
  onOpen: (id: string) => void
}): ReactNode {
  const { t } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const filtered = meetings.filter((m) =>
    filter === 'all' ? true : filter === 'processed' ? m.processed : !m.processed
  )
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('filter.all') },
    { id: 'unprocessed', label: t('filter.unprocessed') },
    { id: 'processed', label: t('filter.processed') }
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 px-8 pt-7 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
            {t('meetings.title')}
          </h1>
          <p className="text-sm text-neutral-500">
            {meetings.length > 0 ? t('meetings.count', { n: meetings.length }) : t('meetings.none')}
          </p>
        </div>
        {meetings.length > 0 && (
          <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-700/60">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  filter === f.id
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-8 pt-1 pb-8">
        {loading ? (
          <div className="flex h-full items-center justify-center text-neutral-400">
            <Spinner />
          </div>
        ) : meetings.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-neutral-500">
            {t('meetings.emptyFilter')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((m) => (
              <MeetingRow key={m.id} meeting={m} onOpen={() => onOpen(m.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState(): ReactNode {
  const { t } = useApp()
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-50 text-accent-500 dark:bg-accent-500/15">
        <Mic className="h-8 w-8" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-neutral-800 dark:text-neutral-100">
        {t('meetings.emptyTitle')}
      </h2>
      <p className="mt-1 max-w-xs text-sm text-neutral-500">{t('meetings.emptyText')}</p>
    </div>
  )
}

function MeetingRow({ meeting, onOpen }: { meeting: Meeting; onOpen: () => void }): ReactNode {
  const { refreshMeetings, t } = useApp()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(meeting.title)

  const save = async (): Promise<void> => {
    setEditing(false)
    const trimmed = title.trim()
    if (trimmed && trimmed !== meeting.title) {
      await window.api.meetings.rename(meeting.id, trimmed)
      await refreshMeetings()
    } else {
      setTitle(meeting.title)
    }
  }

  return (
    <div
      onClick={() => !editing && onOpen()}
      className="group flex cursor-pointer items-center gap-4 rounded-xl bg-white px-4 py-3 ring-1 ring-neutral-200/70 transition-all hover:ring-accent-300 hover:shadow-sm dark:bg-neutral-800/50 dark:ring-neutral-700/60 dark:hover:ring-accent-500/50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 dark:bg-neutral-700/60">
        <AudioLines className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') {
                setTitle(meeting.title)
                setEditing(false)
              }
            }}
            onBlur={() => void save()}
            className="w-full rounded-md border border-accent-400 bg-white px-2 py-1 text-sm font-medium text-neutral-900 focus:outline-none dark:bg-neutral-900 dark:text-white"
          />
        ) : (
          <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {meeting.title}
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
          <span>{formatRelativeDay(meeting.createdAt)}</span>
          <span className="text-neutral-300 dark:text-neutral-600">•</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="h-3 w-3" />
            {formatDuration(meeting.durationSec)}
          </span>
        </div>
      </div>

      <RowActions meeting={meeting} />

      <button
        title={meeting.processed ? t('meetings.unmarkProcessed') : t('meetings.markProcessed')}
        onClick={(e) => {
          e.stopPropagation()
          void window.api.meetings.setProcessed(meeting.id, !meeting.processed).then(refreshMeetings)
        }}
        className={cn(
          'app-no-drag flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          meeting.processed
            ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
            : 'text-neutral-300 hover:bg-neutral-200/70 hover:text-neutral-500 dark:text-neutral-600 dark:hover:bg-neutral-700/70'
        )}
      >
        {meeting.processed ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>

      <div className="flex items-center gap-1">
        <IconButton
          title={t('common.rename')}
          onClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
        >
          {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </IconButton>
        <IconButton
          title={t('common.openFolder')}
          onClick={(e) => {
            e.stopPropagation()
            void window.api.meetings.openFolder(meeting.id)
          }}
        >
          <FolderOpen className="h-4 w-4" />
        </IconButton>
        <IconButton
          title={t('common.delete')}
          className="hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
          onClick={(e) => {
            e.stopPropagation()
            void window.api.meetings.delete(meeting.id).then((ok) => {
              if (ok) void refreshMeetings()
            })
          }}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

function AudioPlayer({ meeting }: { meeting: Meeting }): ReactNode {
  const { t } = useApp()
  const tracks = [
    meeting.audio.mixed && { key: 'mixed', label: t('audio.mix'), file: meeting.audio.mixed },
    meeting.audio.mic && { key: 'mic', label: t('audio.mic'), file: meeting.audio.mic },
    meeting.audio.system && { key: 'system', label: t('audio.system'), file: meeting.audio.system }
  ].filter(Boolean) as { key: string; label: string; file: string }[]
  const [active, setActive] = useState(0)
  useEffect(() => setActive(0), [meeting.id])
  const current = tracks[active]

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
          <AudioLines className="h-4 w-4 text-accent-500" />
          {t('audio.title')} ({formatDuration(meeting.durationSec)})
        </div>
        {tracks.length > 1 && (
          <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-700/60">
            {tracks.map((tr, i) => (
              <button
                key={tr.key}
                onClick={() => setActive(i)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  i === active
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                )}
              >
                {tr.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {current ? (
        <>
          <audio
            key={current.file}
            controls
            src={mediaUrl(meeting.id, current.file)}
            className="w-full"
          />
          <div className="mt-2 text-xs text-neutral-400">
            {current.label} · {meeting.audio.format.toUpperCase()}
          </div>
        </>
      ) : (
        <p className="text-sm text-neutral-400">{t('audio.notFound')}</p>
      )}
    </Card>
  )
}

function MeetingDetail({ meeting, onBack }: { meeting: Meeting; onBack: () => void }): ReactNode {
  const { refreshMeetings, t } = useApp()
  const [title, setTitle] = useState(meeting.title)
  const [editing, setEditing] = useState(false)

  const save = async (): Promise<void> => {
    setEditing(false)
    const trimmed = title.trim()
    if (trimmed && trimmed !== meeting.title) {
      await window.api.meetings.rename(meeting.id, trimmed)
      await refreshMeetings()
    } else {
      setTitle(meeting.title)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-8 pt-7 pb-4">
        <IconButton onClick={onBack} title={t('detail.back')}>
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
                if (e.key === 'Escape') {
                  setTitle(meeting.title)
                  setEditing(false)
                }
              }}
              onBlur={() => void save()}
              className="w-full rounded-md border border-accent-400 bg-white px-2 py-1 text-lg font-semibold text-neutral-900 focus:outline-none dark:bg-neutral-900 dark:text-white"
            />
          ) : (
            <h1
              className="flex items-center gap-2 truncate text-lg font-semibold text-neutral-900 dark:text-white"
              onDoubleClick={() => setEditing(true)}
            >
              {meeting.title}
              <IconButton
                className="h-6 w-6"
                title={t('common.rename')}
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
            </h1>
          )}
          <p className="text-sm text-neutral-500">{formatDateTime(meeting.createdAt)}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          {t('detail.processed')}
          <Toggle
            checked={meeting.processed}
            onChange={(v) =>
              void window.api.meetings.setProcessed(meeting.id, v).then(refreshMeetings)
            }
          />
        </label>
        <Button variant="secondary" onClick={() => void window.api.meetings.openFolder(meeting.id)}>
          <FolderOpen className="h-4 w-4" />
          {t('detail.folder')}
        </Button>
        <Button
          variant="ghost"
          title={t('detail.delete')}
          className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
          onClick={async () => {
            const ok = await window.api.meetings.delete(meeting.id)
            if (ok) onBack()
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-8 pb-8">
        <AudioPlayer meeting={meeting} />

        <TranscriptSection meeting={meeting} />
        <NotesSection meeting={meeting} />
      </div>
    </div>
  )
}

function MiniMarkdown({ text }: { text: string }): ReactNode {
  const lines = text.split(/\r?\n/)
  const inline = (s: string): ReactNode => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
    )
  }
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">
      {lines.map((line, i) => {
        const t = line.trim()
        if (!t) return <div key={i} className="h-1" />
        if (t.startsWith('### '))
          return <h4 key={i} className="pt-1 text-sm font-semibold">{inline(t.slice(4))}</h4>
        if (t.startsWith('## '))
          return <h3 key={i} className="pt-2 text-base font-semibold">{inline(t.slice(3))}</h3>
        if (t.startsWith('# '))
          return <h2 key={i} className="pt-2 text-lg font-semibold">{inline(t.slice(2))}</h2>
        if (/^[-*]\s/.test(t))
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-accent-500">•</span>
              <span>{inline(t.replace(/^[-*]\s/, ''))}</span>
            </div>
          )
        if (/^\d+[.)]\s/.test(t))
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-accent-500">{t.match(/^\d+/)?.[0]}.</span>
              <span>{inline(t.replace(/^\d+[.)]\s/, ''))}</span>
            </div>
          )
        return <p key={i}>{inline(t)}</p>
      })}
    </div>
  )
}

function NotesSection({ meeting }: { meeting: Meeting }): ReactNode {
  const { runNotes, jobs, settings, t } = useApp()
  const [notes, setNotes] = useState<string | null>(null)
  const n = meeting.artifacts.notes
  const job = jobs[jobKey(meeting.id, 'notes')]
  const running = n.status === 'running' || job?.status === 'running'
  const hasTranscript =
    meeting.artifacts.transcript.status === 'done' ||
    meeting.artifacts.diarizedTranscript.status === 'done'

  useEffect(() => {
    if (n.status === 'done' && n.path) {
      void fetch(mediaUrl(meeting.id, n.path))
        .then((r) => r.text())
        .then(setNotes)
        .catch(() => setNotes(null))
    } else setNotes(null)
  }, [meeting.id, n.status, n.path])

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
          <StickyNote className="h-4 w-4 text-accent-500" />
          {t('notes.title')}
          {/* Show the currently-configured model (updates when you change provider/model),
              not the historical artifact model that produced the existing notes. */}
          {settings?.notesModel && (
            <span className="text-xs font-normal text-neutral-400">{settings.notesModel}</span>
          )}
        </div>
        <Button
          variant="primary"
          disabled={running || !hasTranscript}
          title={
            !hasTranscript
              ? t('tip.needTranscript')
              : !(settings && currentApiKey(settings))
                ? t('notes.needApiKey')
                : ''
          }
          onClick={() => void runNotes(meeting.id)}
        >
          {running ? <Spinner className="text-white" /> : <Wand2 className="h-4 w-4" />}
          {n.status === 'done' ? t('notes.update') : t('notes.make')}
        </Button>
      </div>

      {running ? (
        <div className="py-6">
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <Spinner />
            <span>{job?.message ?? t('common.processing')}</span>
            {typeof job?.percent === 'number' && (
              <span className="ml-auto tabular-nums text-neutral-400">
                {Math.round(job.percent * 100)}%
              </span>
            )}
          </div>
          {typeof job?.percent === 'number' && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div
                className="h-full rounded-full bg-accent-500 transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(2, Math.round(job.percent * 100))}%` }}
              />
            </div>
          )}
        </div>
      ) : n.status === 'error' ? (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{n.error ?? job?.message ?? t('common.error')}</span>
        </div>
      ) : notes ? (
        <MiniMarkdown text={notes} />
      ) : (
        <p className="py-4 text-sm text-neutral-500">
          {hasTranscript ? t('notes.empty') : t('notes.needTranscript')}
        </p>
      )}
    </Card>
  )
}

function MlBanner(): ReactNode {
  const { ml, settings, t } = useApp()
  if (ml.status === 'setup' || ml.status === 'starting') {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-accent-50 px-4 py-3 text-sm text-accent-700 dark:bg-accent-500/15 dark:text-accent-100">
        <Spinner />
        <div className="min-w-0">
          <div className="font-medium">
            {ml.status === 'setup' ? t('ml.preparing') : t('ml.starting')}
          </div>
          <div className="truncate text-xs opacity-80">{ml.message}</div>
        </div>
      </div>
    )
  }
  if (ml.status === 'ready' && ml.device === 'cpu' && settings?.asrDevice === 'gpu') {
    // GPU mode is selected but CUDA didn't bind (no NVIDIA GPU / driver) → the worker fell back to
    // the CPU. That's a genuine misconfiguration worth flagging. The default CPU mode running on the
    // CPU is expected and shows no banner.
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{t('ml.cpuWarning')}</span>
      </div>
    )
  }
  return null
}

function SpeakerChips({ meeting, speakers }: { meeting: Meeting; speakers: string[] }): ReactNode {
  const { refreshMeetings } = useApp()
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')

  const save = async (key: string): Promise<void> => {
    setEditing(null)
    const v = value.trim()
    if (v && v !== meeting.speakers[key]) {
      await window.api.meetings.setSpeakers(meeting.id, { [key]: v })
      await refreshMeetings()
    }
  }

  if (speakers.length === 0) return null
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {speakers.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-700/60"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: speakerColor(s) }} />
          {editing === s ? (
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => void save(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save(s)
                if (e.key === 'Escape') setEditing(null)
              }}
              className="w-24 bg-transparent focus:outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setEditing(s)
                setValue(meeting.speakers[s] ?? s)
              }}
              className="font-medium hover:underline"
            >
              {meeting.speakers[s] ?? s}
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

const SPEAKER_COLORS = ['#5865f2', '#16a34a', '#ea580c', '#db2777', '#0891b2', '#9333ea']
function speakerColor(speaker: string): string {
  if (speaker === 'me') return '#5865f2'
  let hash = 0
  for (let i = 0; i < speaker.length; i++) hash = (hash * 31 + speaker.charCodeAt(i)) >>> 0
  return SPEAKER_COLORS[hash % SPEAKER_COLORS.length]
}

function TranscriptView({ file, meeting }: { file: TranscriptFile; meeting: Meeting }): ReactNode {
  const speakers = [...new Set(file.segments.map((s) => s.speaker))]
  // Single speaker = a one-stream transcript (e.g. bleed) — drop the speaker column entirely.
  const single = speakers.length <= 1
  return (
    <div>
      {!single && <SpeakerChips meeting={meeting} speakers={speakers} />}
      {/* Fixed-height, self-scrolling window so a long transcript doesn't grow the whole page. */}
      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {file.segments.map((seg: TranscriptSegment, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-28 shrink-0 pt-0.5 text-right">
              {!single && (
                <div className="text-xs font-medium" style={{ color: speakerColor(seg.speaker) }}>
                  {meeting.speakers[seg.speaker] ?? seg.speaker}
                </div>
              )}
              <div className="text-[11px] tabular-nums text-neutral-400">
                {formatDuration(seg.start)}
              </div>
            </div>
            <div className="min-w-0 flex-1 break-words text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">
              {seg.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TranscriptSection({ meeting }: { meeting: Meeting }): ReactNode {
  const { runTranscription, jobs, settings, t } = useApp()
  const [tab, setTab] = useState<'transcript' | 'diarized'>('transcript')
  const [plain, setPlain] = useState<TranscriptFile | null>(null)
  const [diar, setDiar] = useState<TranscriptFile | null>(null)
  // Speaker count hint for diarization: undefined = Auto (let pyannote decide). With bleed
  // (mic on speakers picks up the other side) Auto can over-split, so let the user pin the count.
  const [numSpeakers, setNumSpeakers] = useState<number | undefined>(undefined)

  const tA = meeting.artifacts.transcript
  const dA = meeting.artifacts.diarizedTranscript
  const tJob = jobs[jobKey(meeting.id, 'transcript')]
  const dJob = jobs[jobKey(meeting.id, 'diarizedTranscript')]
  const tRunning = tA.status === 'running' || tJob?.status === 'running'
  const dRunning = dA.status === 'running' || dJob?.status === 'running'

  useEffect(() => {
    if (tA.status === 'done' && tA.path) {
      void window.api.meetings.readArtifact<TranscriptFile>(meeting.id, tA.path).then(setPlain)
    } else setPlain(null)
  }, [meeting.id, tA.status, tA.path])

  useEffect(() => {
    if (dA.status === 'done' && dA.path) {
      void window.api.meetings.readArtifact<TranscriptFile>(meeting.id, dA.path).then(setDiar)
    } else setDiar(null)
  }, [meeting.id, dA.status, dA.path])

  const active = tab === 'transcript' ? plain : diar
  const activeArtifact = tab === 'transcript' ? tA : dA
  const activeJob = tab === 'transcript' ? tJob : dJob
  const activeRunning = tab === 'transcript' ? tRunning : dRunning

  return (
    <Card className="p-5">
      <MlBanner />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-700/60">
          {(['transcript', 'diarized'] as const).map((tabId) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                tab === tabId
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              )}
            >
              {tabId === 'transcript' ? t('tab.transcript') : t('tab.diarized')}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="primary"
            disabled={tRunning}
            onClick={() => {
              setTab('transcript')
              void runTranscription(meeting.id, false)
            }}
          >
            {tRunning ? <Spinner className="text-white" /> : <FileText className="h-4 w-4" />}
            {tA.status === 'done' ? t('btn.again') : t('btn.transcribe')}
          </Button>
          <select
            value={numSpeakers ?? 'auto'}
            disabled={dRunning}
            title={t('diar.speakers')}
            onChange={(e) =>
              setNumSpeakers(e.target.value === 'auto' ? undefined : Number(e.target.value))
            }
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <option value="auto">{`${t('diar.speakers')}: ${t('diar.auto')}`}</option>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{`${t('diar.speakers')}: ${n}`}</option>
            ))}
          </select>
          <Button
            variant="secondary"
            disabled={dRunning}
            title={settings?.hfToken ? '' : t('tip.needHfToken')}
            onClick={() => {
              setTab('diarized')
              void runTranscription(meeting.id, true, numSpeakers)
            }}
          >
            {dRunning ? <Spinner /> : <Users className="h-4 w-4" />}
            {t('btn.bySpeakers')}
          </Button>
        </div>
      </div>

      {activeRunning ? (
        <div className="py-8">
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <Spinner />
            <span>{activeJob?.message ?? t('common.processing')}</span>
            {typeof activeJob?.percent === 'number' && (
              <span className="ml-auto tabular-nums text-neutral-400">
                {Math.round(activeJob.percent * 100)}%
              </span>
            )}
          </div>
          {typeof activeJob?.percent === 'number' && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div
                className="h-full rounded-full bg-accent-500 transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(2, Math.round(activeJob.percent * 100))}%` }}
              />
            </div>
          )}
        </div>
      ) : activeArtifact.status === 'error' ? (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{activeArtifact.error ?? activeJob?.message ?? t('common.error')}</span>
        </div>
      ) : active ? (
        <TranscriptView file={active} meeting={meeting} />
      ) : (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-neutral-500">
          <Wand2 className="h-7 w-7 text-neutral-300" />
          {tab === 'transcript' ? t('transcript.empty') : t('transcript.emptyDiarized')}
        </div>
      )}
    </Card>
  )
}
