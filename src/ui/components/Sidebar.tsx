import type { ReactNode } from 'react'
import { AudioLines, Settings as SettingsIcon } from 'lucide-react'
import { RecordButton } from './RecordButton'
import { cn } from '../lib/cn'
import { useApp } from '../state/app'
import { DONATE_URL } from '@shared/links'
import type { View } from '../types'

const navItems: { id: View; labelKey: string; icon: ReactNode }[] = [
  { id: 'meetings', labelKey: 'nav.recordings', icon: <AudioLines className="h-[18px] w-[18px]" /> },
  { id: 'settings', labelKey: 'nav.settings', icon: <SettingsIcon className="h-[18px] w-[18px]" /> }
]

export function Sidebar({ view, onView }: { view: View; onView: (v: View) => void }): ReactNode {
  const { t } = useApp()
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-4 border-r border-neutral-200/70 bg-neutral-100/40 p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
      <RecordButton />

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onView(item.id)}
            className={cn(
              'app-no-drag flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              view === item.id
                ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200/80 dark:bg-neutral-800 dark:text-white dark:ring-neutral-700'
                : 'text-neutral-600 hover:bg-white/60 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-100'
            )}
          >
            {item.icon}
            {t(item.labelKey)}
          </button>
        ))}
      </nav>

      <div className="mt-auto">
        <button
          onClick={() => void window.api.app.openExternal(DONATE_URL)}
          title={t('support.tooltip')}
          className="app-no-drag flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-500 ring-1 ring-rose-200/70 transition-colors hover:bg-rose-50 dark:text-rose-300 dark:ring-rose-500/30 dark:hover:bg-rose-500/10"
        >
          {t('btn.support')}
        </button>
      </div>
    </aside>
  )
}
