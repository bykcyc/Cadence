import { describe, it, expect } from 'vitest'
import {
  groupWords,
  normalizeDiarSegments,
  groupWordsByDiarization,
  mergeSegments,
  segmentsToText
} from './transcript'

describe('groupWords', () => {
  it('joins words within the gap and splits on long silence', () => {
    const segs = groupWords(
      [
        { start: 0, end: 0.5, word: 'hello' },
        { start: 0.6, end: 1.0, word: 'world' },
        { start: 5.0, end: 5.4, word: 'again' } // > 1.2s gap → new utterance
      ],
      'me'
    )
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ speaker: 'me', text: 'hello world', start: 0, end: 1.0 })
    expect(segs[1].text).toBe('again')
  })

  it('returns nothing for empty input', () => {
    expect(groupWords([], 'me')).toEqual([])
  })
})

describe('normalizeDiarSegments', () => {
  it('maps raw pyannote labels to spk_1.. in first-by-time order', () => {
    const { segments, speakers } = normalizeDiarSegments([
      { start: 2, end: 3, speaker: 'SPEAKER_01' },
      { start: 0, end: 1, speaker: 'SPEAKER_00' },
      { start: 4, end: 5, speaker: 'SPEAKER_01' }
    ])
    expect(speakers).toEqual(['spk_1', 'spk_2'])
    expect(segments.find((s) => s.start === 0)?.speaker).toBe('spk_1') // SPEAKER_00, earliest
    expect(segments.find((s) => s.start === 2)?.speaker).toBe('spk_2')
  })
})

describe('groupWordsByDiarization', () => {
  it('assigns each word to the most-overlapping speaker and splits on speaker change', () => {
    const diar = [
      { start: 0, end: 2, speaker: 'spk_1' },
      { start: 2, end: 4, speaker: 'spk_2' }
    ]
    const segs = groupWordsByDiarization(
      [
        { start: 0.1, end: 0.5, word: 'a' },
        { start: 0.6, end: 1.0, word: 'b' },
        { start: 2.1, end: 2.5, word: 'c' }
      ],
      diar
    )
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ speaker: 'spk_1', text: 'a b' })
    expect(segs[1]).toMatchObject({ speaker: 'spk_2', text: 'c' })
  })
})

describe('mergeSegments + segmentsToText', () => {
  it('merges two tracks chronologically', () => {
    const merged = mergeSegments(
      [{ speaker: 'me', start: 0, end: 1, text: 'hi' }],
      [{ speaker: 'spk_1', start: 0.5, end: 1.5, text: 'yo' }]
    )
    expect(merged.map((s) => s.text)).toEqual(['hi', 'yo'])
  })

  it('renders segments with their speaker labels', () => {
    const txt = segmentsToText(
      [
        { speaker: 'me', start: 0, end: 1, text: 'hi' },
        { speaker: 'spk_1', start: 1, end: 2, text: 'yo' }
      ],
      { me: 'Me', spk_1: 'Alice' }
    )
    expect(txt).toBe('Me: hi\nAlice: yo')
  })

  it('falls back to the raw speaker id when no label is set', () => {
    const txt = segmentsToText([{ speaker: 'spk_2', start: 0, end: 1, text: 'x' }], {})
    expect(txt).toBe('spk_2: x')
  })
})
