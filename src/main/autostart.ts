import { app } from 'electron'

/** Register/unregister launch-at-login. Guarded to packaged builds so we never
 *  register the dev Electron binary as a startup item during development. */
export function applyAutoStart(enabled: boolean, startMinimized: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: startMinimized,
    args: startMinimized ? ['--hidden'] : []
  })
}

export function syncAutoStartFromSettings(enabled: boolean, startMinimized: boolean): void {
  applyAutoStart(enabled, startMinimized)
}
