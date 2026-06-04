import chokidar, { type FSWatcher } from 'chokidar'
import { IPC } from '@shared/ipc'
import { getRecordsDir } from './settings'
import { broadcast } from './broadcast'

let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null

function notify(): void {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => broadcast(IPC.meetingsChangedEvent), 300)
}

/** Watch the Records dir so external edits to meeting.json (e.g. a task-bot
 *  flipping `processed`) refresh the UI live. */
export function startWatcher(): void {
  stopWatcher()
  const dir = getRecordsDir()
  watcher = chokidar.watch(dir, {
    ignoreInitial: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  })
  watcher
    .on('add', notify)
    .on('change', notify)
    .on('unlink', notify)
    .on('addDir', notify)
    .on('unlinkDir', notify)
}

export function stopWatcher(): void {
  if (watcher) {
    void watcher.close()
    watcher = null
  }
}
