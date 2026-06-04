export function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    let s = input[i]
    if (s > 1) s = 1
    else if (s < -1) s = -1
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export function workletBlobUrl(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
}

/** Build a 16-bit mono WAV ArrayBuffer from Int16 PCM. */
export function buildWav(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const dataLen = pcm.length * 2
  const buffer = new ArrayBuffer(44 + dataLen)
  const view = new DataView(buffer)
  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataLen, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataLen, true)
  new Int16Array(buffer, 44).set(pcm)
  return buffer
}
