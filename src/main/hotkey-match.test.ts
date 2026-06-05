import { describe, it, expect } from 'vitest'
import { chordMatches } from './hotkey-match'

// Synthetic keycodes (values don't matter, only the set logic).
const Ctrl = 29
const Alt = 56
const AltRight = 3640
const Shift = 42
const R = 19
const Space = 57
const R2L = { [AltRight]: Alt }

describe('chordMatches', () => {
  it('matches an exact chord regardless of order', () => {
    expect(chordMatches([Ctrl, Alt, R], [Ctrl, Alt, R])).toBe(true)
    expect(chordMatches([R, Ctrl, Alt], [Ctrl, Alt, R])).toBe(true)
  })

  it('treats right Alt as left Alt via the map (fixes Ctrl+Alt+R / AltGr)', () => {
    expect(chordMatches([Ctrl, AltRight, R], [Ctrl, Alt, R], R2L)).toBe(true)
    // Without the mapping the right Alt would NOT match — the original bug.
    expect(chordMatches([Ctrl, AltRight, R], [Ctrl, Alt, R])).toBe(false)
  })

  it('rejects partial chords and extra keys', () => {
    expect(chordMatches([Ctrl, Alt], [Ctrl, Alt, R])).toBe(false)
    expect(chordMatches([Ctrl, Alt, R, Space], [Ctrl, Alt, R])).toBe(false)
    expect(chordMatches([Ctrl, Shift, R], [Ctrl, Alt, R], R2L)).toBe(false)
  })

  it('an empty binding never matches', () => {
    expect(chordMatches([Ctrl], [])).toBe(false)
    expect(chordMatches([], [])).toBe(false)
  })
})
