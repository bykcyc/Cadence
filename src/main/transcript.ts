import type { TranscriptSegment } from '@shared/types'

export interface Word {
  start: number
  end: number
  word: string
}

export interface DiarSeg {
  start: number
  end: number
  speaker: string
}

const GAP = 1.2 // seconds of silence that splits an utterance

/** Group a speaker's words into utterances, splitting on long gaps. */
export function groupWords(words: Word[], speaker: string): TranscriptSegment[] {
  const out: TranscriptSegment[] = []
  let cur: TranscriptSegment | null = null
  for (const w of words) {
    if (!cur || w.start - cur.end > GAP) {
      if (cur) out.push(cur)
      cur = { speaker, start: w.start, end: w.end, text: w.word }
    } else {
      cur.end = w.end
      cur.text += ' ' + w.word
    }
  }
  if (cur) out.push(cur)
  return out
}

/** Assign each word to the diarization speaker whose turn overlaps it most. */
function assignSpeaker(word: Word, diar: DiarSeg[]): string {
  let best = diar[0]?.speaker ?? 'spk_1'
  let bestOverlap = -1
  for (const seg of diar) {
    const overlap = Math.min(word.end, seg.end) - Math.max(word.start, seg.start)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = seg.speaker
    }
  }
  return best
}

/** Map raw pyannote labels (SPEAKER_00, ...) to stable spk_1.. ids in first-appearance order. */
export function normalizeDiarSegments(segments: DiarSeg[]): { segments: DiarSeg[]; speakers: string[] } {
  const map = new Map<string, string>()
  const ordered = [...segments].sort((a, b) => a.start - b.start)
  for (const s of ordered) {
    if (!map.has(s.speaker)) map.set(s.speaker, `spk_${map.size + 1}`)
  }
  const remapped = segments.map((s) => ({ ...s, speaker: map.get(s.speaker) ?? 'spk_1' }))
  return { segments: remapped, speakers: [...map.values()] }
}

/** Split a speaker's words across diarization turns into per-speaker utterances. */
export function groupWordsByDiarization(words: Word[], diar: DiarSeg[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = []
  let cur: TranscriptSegment | null = null
  for (const w of words) {
    const spk = assignSpeaker(w, diar)
    if (!cur || cur.speaker !== spk || w.start - cur.end > GAP) {
      if (cur) out.push(cur)
      cur = { speaker: spk, start: w.start, end: w.end, text: w.word }
    } else {
      cur.end = w.end
      cur.text += ' ' + w.word
    }
  }
  if (cur) out.push(cur)
  return out
}

/** Merge two speaker tracks chronologically. */
export function mergeSegments(a: TranscriptSegment[], b: TranscriptSegment[]): TranscriptSegment[] {
  return [...a, ...b].sort((x, y) => x.start - y.start)
}

export function segmentsToText(segments: TranscriptSegment[], labels: Record<string, string>): string {
  return segments
    .map((s) => `${labels[s.speaker] ?? s.speaker}: ${s.text}`)
    .join('\n')
}
