import { Tray, Menu, nativeImage, app } from 'electron'
import { recordingStore } from './state'
import { showMainWindow, toggleMainWindow, setQuitting } from './windows'
import { startRecording, stopRecording } from './recording'
import { openRecordsFolder } from './meetings'
import { resourcePath } from './resources'
import { mt } from './i18n'

let tray: Tray | null = null

function loadIcon(file: string): Electron.NativeImage {
  const img = nativeImage.createFromPath(resourcePath(file))
  if (img.isEmpty()) console.error('[tray] icon failed to load:', resourcePath(file))
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16 })
}

const idleImage = (): Electron.NativeImage => loadIcon('tray-idle.png')
const recordingImage = (): Electron.NativeImage => loadIcon('tray-recording.png')

export function createTray(): void {
  if (tray) return
  tray = new Tray(idleImage())
  tray.setToolTip(mt('tray.idle'))
  refresh()

  tray.on('click', () => toggleMainWindow())

  recordingStore.on('change', () => refresh())
}

function refresh(): void {
  if (!tray) return
  const active = recordingStore.isActive()
  tray.setImage(active ? recordingImage() : idleImage())
  tray.setToolTip(active ? mt('tray.recording') : mt('tray.idle'))

  const menu = Menu.buildFromTemplate([
    active
      ? { label: `⏹  ${mt('tray.stop')}`, click: () => void stopRecording() }
      : { label: `▶  ${mt('tray.start')}`, click: () => void startRecording() },
    { type: 'separator' },
    { label: mt('tray.open'), click: () => showMainWindow() },
    { label: mt('tray.openFolder'), click: () => void openRecordsFolder() },
    { type: 'separator' },
    {
      label: mt('tray.quit'),
      click: () => {
        setQuitting(true)
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
