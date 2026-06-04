import { useEffect, useState, type ReactNode } from 'react'
import { AppProvider, useApp } from './state/app'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { MeetingsScreen } from './screens/Meetings'
import { SettingsScreen } from './screens/Settings'
import type { View } from './types'

function Welcome(): ReactNode {
  const { settings, updateSettings, t } = useApp()
  if (!settings || settings.onboardingDone) return null
  return (
    <div className="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t('onboarding.title')}
        </h2>
        <p className="mt-1.5 text-sm text-neutral-500">{t('onboarding.intro')}</p>
        <ul className="mt-4 space-y-2.5 text-sm text-neutral-700 dark:text-neutral-200">
          {[t('onboarding.tip1'), t('onboarding.tip2'), t('onboarding.tip3')].map((tip, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-accent-500">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={() => void updateSettings({ onboardingDone: true })}
          className="mt-5 w-full rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600"
        >
          {t('onboarding.cta')}
        </button>
      </div>
    </div>
  )
}

function viewFromHash(): View {
  return window.location.hash.includes('settings') ? 'settings' : 'meetings'
}

function Shell(): ReactNode {
  const [view, setView] = useState<View>(viewFromHash)
  // Allow navigation via URL hash (used for automated screenshots; harmless otherwise).
  useEffect(() => {
    const onHash = (): void => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return (
    <div className="flex h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar view={view} onView={setView} />
        <main className="min-w-0 flex-1 overflow-hidden bg-neutral-50 dark:bg-neutral-950/40">
          {view === 'meetings' ? <MeetingsScreen /> : <SettingsScreen />}
        </main>
      </div>
      <Welcome />
    </div>
  )
}

export default function App(): ReactNode {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
