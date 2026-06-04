// Plays the read-aloud (TTS) MP3 sent from the main process. Lives in the main window
// renderer (always alive, hidden-to-tray) so playback survives when the window is hidden.
let audio: HTMLAudioElement | null = null

function stop(): void {
  if (!audio) return
  try {
    audio.pause()
  } catch {
    /* ignore */
  }
  if (audio.src) URL.revokeObjectURL(audio.src)
  audio = null
}

export function initTtsPlayback(): void {
  window.api.tts.onPlay((buf) => {
    stop()
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }))
    const el = new Audio(url)
    audio = el
    const done = (): void => {
      if (audio === el) {
        URL.revokeObjectURL(url)
        audio = null
      }
      window.api.tts.sendEnded()
    }
    el.onended = done
    el.onerror = done
    void el.play().catch(done)
  })
  window.api.tts.onStop(() => stop())
}
