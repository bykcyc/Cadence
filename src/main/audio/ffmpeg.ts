import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import { resourcePath } from '../resources'

const run = promisify(execFile)

/** Resolve the ffmpeg binary. In packaged builds it is shipped as a plain
 *  resource (resources/ffmpeg.exe) — far more reliable than asar-unpack path
 *  tricks (which broke in the portable build → ENOENT). */
export function ffmpegPath(): string {
  if (app.isPackaged) return resourcePath('ffmpeg.exe')
  const p = ffmpegStatic as unknown as string | null
  if (!p) throw new Error('ffmpeg-static binary not found')
  return p
}

/** Resample any audio to 16 kHz mono WAV (what the ASR/diarization models expect). */
export async function toMono16kWav(input: string, output: string): Promise<void> {
  await run(ffmpegPath(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    '-ar',
    '16000',
    '-ac',
    '1',
    output
  ])
}

export async function transcodeToFlac(input: string, output: string): Promise<void> {
  await run(ffmpegPath(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    '-c:a',
    'flac',
    '-compression_level',
    '5',
    output
  ])
}

/** Mix two tracks AND downsample to 16 kHz mono in one pass — the single stream we transcribe
 *  when a recording has no pre-mixed file saved. */
export async function mixToMono16kWav(
  micInput: string,
  systemInput: string,
  output: string
): Promise<void> {
  await run(ffmpegPath(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    micInput,
    '-i',
    systemInput,
    '-filter_complex',
    'amix=inputs=2:duration=longest:normalize=0',
    '-ar',
    '16000',
    '-ac',
    '1',
    output
  ])
}

/** Mix two mono tracks into one file for easy human playback. */
export async function mixTracks(
  micInput: string,
  systemInput: string,
  output: string,
  codec: 'flac' | 'pcm_s16le'
): Promise<void> {
  await run(ffmpegPath(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    micInput,
    '-i',
    systemInput,
    '-filter_complex',
    'amix=inputs=2:duration=longest:normalize=0',
    '-c:a',
    codec,
    output
  ])
}
