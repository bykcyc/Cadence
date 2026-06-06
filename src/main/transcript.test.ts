import { describe, it, expect } from 'vitest'
import {
  groupWords,
  normalizeDiarSegments,
  groupTaggedWords,
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
      'speaker'
    )
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ speaker: 'speaker', text: 'hello world', start: 0, end: 1.0 })
    expect(segs[1].text).toBe('again')
  })

  it('returns nothing for empty input', () => {
    expect(groupWords([], 'speaker')).toEqual([])
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

describe('groupTaggedWords (diarized turn interleave)', () => {
  it('groups words by time, splitting on speaker change', () => {
    const segs = groupTaggedWords([
      { start: 0.0, end: 0.4, word: 'hi', speaker: 'spk_1' },
      { start: 0.5, end: 0.9, word: 'yo', speaker: 'spk_2' },
      { start: 1.0, end: 1.4, word: 'sup', speaker: 'spk_1' }
    ])
    expect(segs.map((s) => `${s.speaker}:${s.text}`)).toEqual(['spk_1:hi', 'spk_2:yo', 'spk_1:sup'])
  })

  it('sorts out-of-order words by start time', () => {
    const segs = groupTaggedWords([
      { start: 0.6, end: 1.0, word: 'b', speaker: 'spk_1' },
      { start: 0.0, end: 0.4, word: 'a', speaker: 'spk_1' }
    ])
    expect(segs[0].text).toBe('a b')
  })
})

describe('segmentsToText', () => {
  it('renders segments with their speaker labels', () => {
    const txt = segmentsToText(
      [
        { speaker: 'spk_1', start: 0, end: 1, text: 'hi' },
        { speaker: 'spk_2', start: 1, end: 2, text: 'yo' }
      ],
      { spk_1: 'Alice', spk_2: 'Bob' }
    )
    expect(txt).toBe('Alice: hi\nBob: yo')
  })

  it('falls back to the raw speaker id when no label is set', () => {
    const txt = segmentsToText([{ speaker: 'spk_2', start: 0, end: 1, text: 'x' }], {})
    expect(txt).toBe('spk_2: x')
  })
})
