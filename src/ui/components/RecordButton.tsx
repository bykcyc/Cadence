import type { ReactNode } from 'react'
import { Mic, Square } from 'lucide-react'
import { useApp } from '../state/app'
import { formatDuration } from '../lib/format'
import { cn } from '../lib/cn'
import { Spinner } from './ui'

export function RecordButton(): ReactNode {
  const { recording, toggleRecording, t } = useApp()
  const status = recording.status
  const active = status === 'recording' || status === 'starting' || status === 'stopping'
  const busy = status === 'starting' || status === 'stopping'

  const label =
    status === 'starting'
      ? t('record.starting')
      : status === 'stopping'
        ? t('record.stopping')
        : active
          ? t('record.stop')
          : t('record.start')

  return (
    <button
      onClick={() => void toggleRecording()}
      disabled={busy}
      className={cn(
        'app-no-drag group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left',
        'shadow-sm transition-all duration-150 disabled:opacity-70',
        active
          ? 'bg-red-500 text-white hover:bg-red-600'
          : 'bg-accent-500 text-white hover:bg-accent-600'
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg',
          active ? 'bg-white/20' : 'bg-white/20'
        )}
      >
        {busy ? (
          <Spinner className="text-white" />
        ) : active ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-white/75 tabular-nums">
          {active ? formatDuration(recording.durationSec) : t('record.subtitle')}
        </span>
      </span>
    </button>
  )
}
