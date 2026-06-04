import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc'
import type { DictationState } from '@shared/types'
import { getSettings } from './settings'

let overlay: BrowserWindow | null = null
// Large enough that the icon's expanding halo radiates fully without being clipped
// by the window edge. The icon is centered inside; the rest is transparent + click-through.
const WIDTH = 200
const HEIGHT = 130

function reposition(): void {
  if (!overlay || overlay.isDestroyed()) return
  const { workArea } = screen.getPrimaryDisplay()
  const x = Math.round(workArea.x + (workArea.width - WIDTH) / 2)
  const top = getSettings().overlayPosition === 'top'
  // Sit just above the taskbar (bottom) / just below the top edge, with a small gap.
  const y = top
    ? Math.round(workArea.y + 8)
    : Math.round(workArea.y + workArea.height - HEIGHT - 8)
  overlay.setBounds({ x, y, width: WIDTH, height: HEIGHT })
}

/** Re-apply position + opacity from settings (called on settings change). */
export function applyOverlaySettings(): void {
  if (!overlay || overlay.isDestroyed()) return
  overlay.setOpacity(getSettings().overlayOpacity)
  reposition()
}

export function createOverlay(): void {
  if (overlay && !overlay.isDestroyed()) return
  overlay = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false
    }
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlay.setIgnoreMouseEvents(true) // click-through

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlay.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#overlay`)
  } else {
    overlay.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
  }
}

function send(state: DictationState): void {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(IPC.dictationStateEvent, state)
}

/** Forward a live mic level (0..1) to the overlay's audio-reactive meter. */
export function sendOverlayLevel(level: number): void {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(IPC.dictationLevel, level)
}

export function showOverlay(state: DictationState): void {
  if (!overlay || overlay.isDestroyed()) createOverlay()
  reposition()
  overlay!.setOpacity(getSettings().overlayOpacity)
  overlay!.showInactive()
  send(state)
}

export function updateOverlay(state: DictationState): void {
  if (!overlay || overlay.isDestroyed()) return
  if (state.phase !== 'idle' && !overlay.isVisible()) {
    reposition()
    overlay.showInactive()
  }
  send(state)
}

export function hideOverlay(): void {
  if (overlay && !overlay.isDestroyed()) overlay.hide()
}

export function destroyOverlay(): void {
  if (overlay && !overlay.isDestroyed()) overlay.destroy()
  overlay = null
}
