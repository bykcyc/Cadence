import { BrowserWindow, shell, nativeTheme } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import type { AppSettings } from '@shared/types'
import { resourcePath } from './resources'

let mainWindow: BrowserWindow | null = null
let quitting = false
let themeListenerAttached = false

function overlayColors(dark: boolean): { color: string; symbolColor: string; height: number } {
  return dark
    ? { color: '#171717', symbolColor: '#e5e5ea', height: 40 }
    : { color: '#ffffff', symbolColor: '#3f3f46', height: 40 }
}

/** Sync the native window controls (min/max/close) + dialogs to the app theme. */
export function applyThemeToWindow(theme: AppSettings['theme']): void {
  nativeTheme.themeSource = theme
  if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitleBarOverlay(overlayColors(nativeTheme.shouldUseDarkColors))
  }
}

export function setQuitting(value: boolean): void {
  quitting = value
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

export function createMainWindow(show = true): BrowserWindow {
  const existing = getMainWindow()
  if (existing) {
    if (show) showMainWindow()
    return existing
  }

  mainWindow = new BrowserWindow({
    width: 1140,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#f5f5f7',
    title: 'Cadence',
    icon: resourcePath('icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#3f3f46',
      height: 40
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false,
      // Needed so the recorder running inside this window keeps capturing audio
      // while the window is hidden to the tray.
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (show) mainWindow?.show()
  })

  // Close button hides to tray instead of quitting (app lives in the tray).
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // Minimize also goes to the tray (tray-centric app).
  mainWindow.on('minimize', () => {
    mainWindow?.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Keep native window controls in sync when the OS theme changes (theme: system).
  if (!themeListenerAttached) {
    themeListenerAttached = true
    nativeTheme.on('updated', () => {
      if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitleBarOverlay(overlayColors(nativeTheme.shouldUseDarkColors))
      }
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Forward renderer console to the main process for debugging (dev only).
  if (is.dev) {
    mainWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log('[renderer]', message)
    })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function showMainWindow(): void {
  const win = getMainWindow() ?? createMainWindow(true)
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function toggleMainWindow(): void {
  const win = getMainWindow()
  if (win && win.isVisible() && !win.isMinimized()) {
    win.hide()
  } else {
    showMainWindow()
  }
}
