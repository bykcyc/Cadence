import type { ReactNode } from 'react'
import { useApp } from '../state/app'
import { formatDuration } from '../lib/format'

export function TitleBar(): ReactNode {
  const { recording } = useApp()
  const active = recording.status === 'recording' || recording.status === 'starting'

  return (
    <div className="app-drag flex h-10 shrink-0 items-center justify-between border-b border-neutral-200/70 bg-white/60 pr-[140px] pl-4 backdrop-blur-md dark:border-neutral-700/50 dark:bg-neutral-900/50">
      <div className="text-[13px] font-semibold tracking-tight text-neutral-700 dark:text-neutral-200">
        Cadence
      </div>
      {active && (
        <div className="app-no-drag flex items-center gap-2 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="tabular-nums">{formatDuration(recording.durationSec)}</span>
        </div>
      )}
    </div>
  )
}
