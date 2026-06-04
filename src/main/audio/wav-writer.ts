import { createWriteStream, type WriteStream } from 'node:fs'
import { open } from 'node:fs/promises'

/**
 * Streaming 16-bit PCM WAV writer.
 * Writes a 44-byte header with placeholder sizes, appends PCM as it arrives,
 * then patches the two size fields on finalize. Crash-safe enough that a partial
 * file can still be repaired later from its data length.
 */
export class WavWriter {
  private stream: WriteStream | null = null
  private dataBytes = 0
  private finalized = false

  constructor(
    public readonly filePath: string,
    private readonly sampleRate: number,
    private readonly channels = 1,
    private readonly bitDepth = 16
  ) {}

  private buildHeader(dataLength: number): Buffer {
    const blockAlign = (this.channels * this.bitDepth) / 8
    const byteRate = this.sampleRate * blockAlign
    const header = Buffer.alloc(44)
    header.write('RIFF', 0, 'ascii')
    header.writeUInt32LE(36 + dataLength, 4)
    header.write('WAVE', 8, 'ascii')
    header.write('fmt ', 12, 'ascii')
    header.writeUInt32LE(16, 16) // PCM fmt chunk size
    header.writeUInt16LE(1, 20) // audio format = PCM
    header.writeUInt16LE(this.channels, 22)
    header.writeUInt32LE(this.sampleRate, 24)
    header.writeUInt32LE(byteRate, 28)
    header.writeUInt16LE(blockAlign, 32)
    header.writeUInt16LE(this.bitDepth, 34)
    header.write('data', 36, 'ascii')
    header.writeUInt32LE(dataLength, 40)
    return header
  }

  start(): void {
    this.stream = createWriteStream(this.filePath)
    this.stream.write(this.buildHeader(0))
  }

  write(chunk: Buffer): void {
    if (!this.stream || this.finalized) return
    this.dataBytes += chunk.length
    this.stream.write(chunk)
  }

  get bytesWritten(): number {
    return this.dataBytes
  }

  /** Duration in seconds from bytes written. */
  get durationSec(): number {
    const blockAlign = (this.channels * this.bitDepth) / 8
    return this.dataBytes / (this.sampleRate * blockAlign)
  }

  async finalize(): Promise<void> {
    if (this.finalized) return
    this.finalized = true
    const stream = this.stream
    if (!stream) return
    await new Promise<void>((resolve) => stream.end(() => resolve()))
    // Patch RIFF chunk size (offset 4) and data chunk size (offset 40).
    const fh = await open(this.filePath, 'r+')
    try {
      const riffSize = Buffer.alloc(4)
      riffSize.writeUInt32LE(36 + this.dataBytes, 0)
      await fh.write(riffSize, 0, 4, 4)
      const dataSize = Buffer.alloc(4)
      dataSize.writeUInt32LE(this.dataBytes, 0)
      await fh.write(dataSize, 0, 4, 40)
    } finally {
      await fh.close()
    }
  }
}
