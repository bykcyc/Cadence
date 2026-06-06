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

type TaggedWord = Word & { speaker: string }

/** Group already-tagged words into utterances, interleaving by time: a new segment starts when the
 *  speaker changes or after a long gap. Used to merge two tracks turn-by-turn (correct order). */
export function groupTaggedWords(words: TaggedWord[]): TranscriptSegment[] {
  const sorted = [...words].sort((a, b) => a.start - b.start)
  const out: TranscriptSegment[] = []
  let cur: TranscriptSegment | null = null
  for (const w of sorted) {
    if (!cur || cur.speaker !== w.speaker || w.start - cur.end > GAP) {
      if (cur) out.push(cur)
      cur = { speaker: w.speaker, start: w.start, end: w.end, text: w.word }
    } else {
      cur.end = w.end
      cur.text += ' ' + w.word
    }
  }
  if (cur) out.push(cur)
  return out
}

/** Total duration covered by a track's words (union of intervals — overlaps counted once). */
function unionDuration(words: Word[]): number {
  if (!words.length) return 0
  const ivs = words.map((w) => [w.start, w.end] as [number, number]).sort((a, b) => a[0] - b[0])
  let total = 0
  let [cs, ce] = ivs[0]
  for (let i = 1; i < ivs.length; i++) {
    const [s, e] = ivs[i]
    if (s <= ce) ce = Math.max(ce, e)
    else {
      total += ce - cs
      cs = s
      ce = e
    }
  }
  return total + (ce - cs)
}

/** True when the two tracks overlap heavily in time — i.e. the mic also captured the other side
 *  (speakers instead of headphones), so the mic/system "me vs them" split is meaningless. */
export function tracksBleed(mic: Word[], system: Word[]): boolean {
  const um = unionDuration(mic)
  const us = unionDuration(system)
  if (um < 5 || us < 5) return false // not enough on one side to judge — keep dual-track
  const intersection = um + us - unionDuration([...mic, ...system])
  return intersection / Math.min(um, us) > 0.35
}

/** Build the plain (non-diarized) transcript with the right behavior automatically:
 *  - clean dual-track (headphones): interleave "me"/"them" word-by-word → correct turn order;
 *  - bleed (mic caught both voices): collapse to ONE chronological stream (a single neutral
 *    speaker), since splitting into me/them would be a false "I'm answering myself". */
export function buildPlainSegments(
  micWords: Word[],
  systemWords: Word[]
): { segments: TranscriptSegment[]; speakers: string[] } {
  const hasMic = micWords.length > 0
  const hasSystem = systemWords.length > 0
  if (hasMic && hasSystem && tracksBleed(micWords, systemWords)) {
    // One stream from the fuller track (it captured ~everything); neutral 'speaker' label.
    const src = micWords.length >= systemWords.length ? micWords : systemWords
    return { segments: groupWords(src, 'speaker'), speakers: ['speaker'] }
  }
  const tagged: TaggedWord[] = [
    ...micWords.map((w) => ({ ...w, speaker: 'me' })),
    ...systemWords.map((w) => ({ ...w, speaker: 'them' }))
  ]
  const speakers: string[] = []
  if (hasMic) speakers.push('me')
  if (hasSystem) speakers.push('them')
  return { segments: groupTaggedWords(tagged), speakers }
}

/** Assign each word to the diarization speaker whose turn overlaps it most. */
export function assignSpeaker(word: Word, diar: DiarSeg[]): string {
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
