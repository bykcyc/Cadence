import type { RecorderStartConfig, RecorderTrack } from '@shared/types'
import { translate, type Locale } from '@shared/i18n'
import { PCM_WORKLET_SOURCE } from './pcm-worklet'
import { getMicStream, getSystemStream } from './streams'

interface TrackPipeline {
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  node: AudioWorkletNode
  chunks: Int16Array[]
  pending: number
}

interface CaptureState {
  ctx: AudioContext
  sink: GainNode
  flushSamples: number
  pipelines: Partial<Record<RecorderTrack, TrackPipeline>>
  levelTimer: number | null
  recent: Record<RecorderTrack, { sum: number; count: number }>
}

let state: CaptureState | null = null

function workletBlobUrl(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    let s = input[i]
    if (s > 1) s = 1
    else if (s < -1) s = -1
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function attachTrack(track: RecorderTrack, stream: MediaStream): void {
  if (!state) return
  const source = state.ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(state.ctx, 'pcm-capture')
  const pipeline: TrackPipeline = { stream, source, node, chunks: [], pending: 0 }
  node.port.onmessage = (e: MessageEvent<Float32Array>): void => onFrame(track, e.data)
  source.connect(node)
  node.connect(state.sink) // keep the graph pulling; sink gain is 0 (silent)
  state.pipelines[track] = pipeline
}

function onFrame(track: RecorderTrack, frame: Float32Array): void {
  if (!state) return
  const pipeline = state.pipelines[track]
  if (!pipeline) return

  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  const recent = state.recent[track]
  recent.sum += sum
  recent.count += frame.length

  pipeline.chunks.push(floatToInt16(frame))
  pipeline.pending += frame.length
  if (pipeline.pending >= state.flushSamples) flushTrack(track)
}

function flushTrack(track: RecorderTrack): void {
  if (!state) return
  const pipeline = state.pipelines[track]
  if (!pipeline || pipeline.pending === 0) return
  const merged = new Int16Array(pipeline.pending)
  let offset = 0
  for (const chunk of pipeline.chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  pipeline.chunks = []
  pipeline.pending = 0
  window.api.recorder.sendChunk(track, merged.buffer)
}

function emitLevel(): void {
  if (!state) return
  const level = (track: RecorderTrack): number => {
    const r = state!.recent[track]
    const rms = r.count > 0 ? Math.sqrt(r.sum / r.count) : 0
    r.sum = 0
    r.count = 0
    return Math.min(1, rms * 3) // light gain so quiet speech still shows
  }
  window.api.recorder.sendEvent({ type: 'level', mic: level('mic'), system: level('system') })
}

async function start(cfg: RecorderStartConfig): Promise<void> {
  if (state) return
  try {
    // Both tracks are best-effort; we proceed if at least one succeeds.
    let micStream: MediaStream | null = null
    try {
      micStream = await getMicStream(cfg.micDeviceId)
    } catch (err) {
      console.error('[capture] microphone capture failed:', err)
    }
    let systemStream: MediaStream | null = null
    try {
      systemStream = await getSystemStream()
    } catch (err) {
      console.error('[capture] system loopback failed:', err)
    }

    if (!micStream && !systemStream) {
      window.api.recorder.sendEvent({
        type: 'error',
        message: translate((document.documentElement.lang || 'en') as Locale, 'error.noAudio')
      })
      return
    }

    const ctx = new AudioContext({ sampleRate: cfg.sampleRate })
    await ctx.audioWorklet.addModule(workletBlobUrl(PCM_WORKLET_SOURCE))
    const sink = ctx.createGain()
    sink.gain.value = 0
    sink.connect(ctx.destination)

    state = {
      ctx,
      sink,
      flushSamples: Math.round(cfg.sampleRate * 0.5),
      pipelines: {},
      levelTimer: null,
      recent: { mic: { sum: 0, count: 0 }, system: { sum: 0, count: 0 } }
    }

    if (micStream) attachTrack('mic', micStream)
    if (systemStream) attachTrack('system', systemStream)

    state.levelTimer = window.setInterval(emitLevel, 120)
    window.api.recorder.sendEvent({ type: 'started' })
  } catch (err) {
    await teardown()
    const message = err instanceof Error ? err.message : String(err)
    window.api.recorder.sendEvent({ type: 'error', message })
  }
}

async function teardown(): Promise<void> {
  if (!state) return
  const s = state
  state = null
  if (s.levelTimer !== null) clearInterval(s.levelTimer)
  for (const track of Object.keys(s.pipelines) as RecorderTrack[]) {
    const p = s.pipelines[track]
    if (!p) continue
    try {
      p.node.port.onmessage = null
      p.node.disconnect()
      p.source.disconnect()
      p.stream.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
  }
  try {
    s.sink.disconnect()
    await s.ctx.close()
  } catch {
    /* ignore */
  }
}

async function stop(): Promise<void> {
  if (!state) {
    window.api.recorder.sendEvent({ type: 'stopped' })
    return
  }
  // Flush any buffered audio before closing.
  flushTrack('mic')
  flushTrack('system')
  await teardown()
  window.api.recorder.sendEvent({ type: 'stopped' })
}

/** Register the capture bridge. Call once at renderer startup. */
export function initRecorder(): void {
  window.api.recorder.onStart((cfg) => void start(cfg))
  window.api.recorder.onStop(() => void stop())
  // Tell main the bridge is live so it won't send a start command we'd miss.
  window.api.recorder.ready()
}
