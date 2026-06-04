import { translate, type Locale } from '@shared/i18n'
import { PCM_WORKLET_SOURCE } from './pcm-worklet'
import { getMicStream } from './streams'
import { buildWav, floatToInt16, workletBlobUrl } from './wav'

const RATE = 16000

interface Capture {
  ctx: AudioContext
  stream: MediaStream
  node: AudioWorkletNode
  source: MediaStreamAudioSourceNode
  sink: GainNode
  chunks: Int16Array[]
  pending: number
}

let capture: Capture | null = null

async function start(micDeviceId: string | null): Promise<void> {
  if (capture) return
  let stream: MediaStream
  try {
    stream = await getMicStream(micDeviceId)
  } catch {
    window.api.dictation.sendError(
      translate((document.documentElement.lang || 'en') as Locale, 'error.noMic')
    )
    return
  }
  const ctx = new AudioContext({ sampleRate: RATE })
  await ctx.audioWorklet.addModule(workletBlobUrl(PCM_WORKLET_SOURCE))
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-capture')
  const sink = ctx.createGain()
  sink.gain.value = 0
  sink.connect(ctx.destination)
  const cap: Capture = { ctx, stream, node, source, sink, chunks: [], pending: 0 }
  let levelEma = 0
  let lastLevelSent = 0
  let lastLevelValue = -1
  node.port.onmessage = (e: MessageEvent<Float32Array>): void => {
    const f = e.data
    const i16 = floatToInt16(f)
    cap.chunks.push(i16)
    cap.pending += i16.length
    // Live mic level for the overlay meter (RMS → 0..1, smoothed). Sent sparingly: at
    // most ~8/s and only when it changed meaningfully. Keeping this IPC light matters —
    // a steady flood can starve the global-hotkey key-up event during long recordings.
    let sum = 0
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i]
    const rms = Math.sqrt(sum / Math.max(1, f.length))
    levelEma = levelEma * 0.7 + rms * 0.3
    const level = Math.max(0, Math.min(1, Math.sqrt(levelEma) * 3.2))
    const now = performance.now()
    if (now - lastLevelSent > 120 && Math.abs(level - lastLevelValue) > 0.04) {
      lastLevelSent = now
      lastLevelValue = level
      window.api.dictation.sendLevel(level)
    }
  }
  source.connect(node)
  node.connect(sink)
  capture = cap
}

async function stop(): Promise<void> {
  window.api.dictation.sendLevel(0)
  if (!capture) {
    window.api.dictation.sendAudio(buildWav(new Int16Array(0), RATE))
    return
  }
  const cap = capture
  capture = null
  const pcm = new Int16Array(cap.pending)
  let offset = 0
  for (const chunk of cap.chunks) {
    pcm.set(chunk, offset)
    offset += chunk.length
  }
  try {
    cap.node.port.onmessage = null
    cap.node.disconnect()
    cap.source.disconnect()
    cap.sink.disconnect()
    cap.stream.getTracks().forEach((t) => t.stop())
    await cap.ctx.close()
  } catch {
    /* ignore */
  }
  window.api.dictation.sendAudio(buildWav(pcm, RATE))
}

/** Register the dictation capture bridge. Call once at renderer startup. */
export function initDictationCapture(): void {
  window.api.dictation.onCaptureStart((cfg) => void start(cfg.micDeviceId))
  window.api.dictation.onCaptureStop(() => void stop())
}
