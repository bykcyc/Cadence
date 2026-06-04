import { EventEmitter } from 'node:events'
import type { RecordingState } from '@shared/types'

/** Central recording state, owned by the main process.
 *  Tray, windows and IPC all read from / subscribe to this. */
class RecordingStore extends EventEmitter {
  private state: RecordingState = {
    status: 'idle',
    meetingId: null,
    startedAt: null,
    durationSec: 0
  }

  get(): RecordingState {
    return { ...this.state }
  }

  set(patch: Partial<RecordingState>): void {
    this.state = { ...this.state, ...patch }
    this.emit('change', this.get())
  }

  isActive(): boolean {
    return this.state.status === 'recording' || this.state.status === 'starting'
  }
}

export const recordingStore = new RecordingStore()
