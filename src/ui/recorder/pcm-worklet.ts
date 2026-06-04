// AudioWorkletProcessor source, loaded into the audio thread via a Blob URL.
// Forwards each 128-sample frame (downmixed to mono) to the main thread.
export const PCM_WORKLET_SOURCE = `
class PCMCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input.length > 0 && input[0]) {
      const ch0 = input[0]
      let out
      if (input.length > 1 && input[1]) {
        const ch1 = input[1]
        out = new Float32Array(ch0.length)
        for (let i = 0; i < ch0.length; i++) out[i] = (ch0[i] + ch1[i]) * 0.5
      } else {
        out = new Float32Array(ch0)
      }
      this.port.postMessage(out, [out.buffer])
    }
    return true
  }
}
registerProcessor('pcm-capture', PCMCapture)
`
