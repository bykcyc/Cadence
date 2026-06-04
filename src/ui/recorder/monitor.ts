import { getMicStream, getSystemStream } from './streams'

export interface LevelMonitor {
  stop: () => void
  hasMic: boolean
  hasSystem: boolean
}

/** Live mic + system level meter that writes nothing to disk. Renderer-only. */
export async function startLevelMonitor(
  micDeviceId: string | null,
  onLevel: (level: { mic: number; system: number }) => void
): Promise<LevelMonitor> {
  const ctx = new AudioContext()
  let micStream: MediaStream | null = null
  let systemStream: MediaStream | null = null
  try {
    micStream = await getMicStream(micDeviceId)
  } catch {
    /* no mic */
  }
  try {
    systemStream = await getSystemStream()
  } catch {
    /* no system audio */
  }

  const makeAnalyser = (stream: MediaStream): AnalyserNode => {
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    return analyser
  }

  const micAnalyser = micStream ? makeAnalyser(micStream) : null
  const systemAnalyser = systemStream ? makeAnalyser(systemStream) : null
  const buffer = new Float32Array(1024)

  const rms = (analyser: AnalyserNode | null): number => {
    if (!analyser) return 0
    analyser.getFloatTimeDomainData(buffer)
    let sum = 0
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
    return Math.min(1, Math.sqrt(sum / buffer.length) * 3)
  }

  let raf = 0
  const tick = (): void => {
    onLevel({ mic: rms(micAnalyser), system: rms(systemAnalyser) })
    raf = requestAnimationFrame(tick)
  }
  tick()

  return {
    hasMic: !!micStream,
    hasSystem: !!systemStream,
    stop: () => {
      cancelAnimationFrame(raf)
      micStream?.getTracks().forEach((t) => t.stop())
      systemStream?.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
  }
}
