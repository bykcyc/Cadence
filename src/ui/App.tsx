import { useEffect, useState, type ReactNode } from 'react'
import { AppProvider } from './state/app'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { MeetingsScreen } from './screens/Meetings'
import { SettingsScreen } from './screens/Settings'
import type { View } from './types'

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
