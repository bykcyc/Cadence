import { describe, it, expect } from 'vitest'
import { chordMatches, chordHeld, isActive } from './hotkey-match'

// Synthetic keycodes (values don't matter, only the set logic).
const Ctrl = 29
const Alt = 56
const AltRight = 3640
const Shift = 42
const R = 19
const Space = 57
const Backspace = 14
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

describe('chordHeld (all chord keys down, extras allowed)', () => {
  it('true when every chord key is held, even with extra keys down', () => {
    expect(chordHeld([Ctrl, Space], [Ctrl, Space])).toBe(true)
    expect(chordHeld([Ctrl, Space, Backspace], [Ctrl, Space])).toBe(true)
  })
  it('false when a chord key is missing', () => {
    expect(chordHeld([Ctrl], [Ctrl, Space])).toBe(false)
    expect(chordHeld([Space, Backspace], [Ctrl, Space])).toBe(false)
  })
  it('normalizes right-hand modifiers', () => {
    expect(chordHeld([Ctrl, AltRight, R], [Ctrl, Alt, R], R2L)).toBe(true)
  })
})

describe('isActive (activate exact, stay active while held)', () => {
  const keys = [Ctrl, Space]
  it('activates only on an exact chord', () => {
    expect(isActive(false, [Ctrl, Space], keys)).toBe(true)
    expect(isActive(false, [Ctrl, Space, Shift], keys)).toBe(false) // extra key → not a clean activate
  })
  it('STORM GUARD: once active, an unrelated keystroke does NOT drop it', () => {
    // A missed key-up leaves Ctrl+Space "stuck"; pressing backspace used to break the exact match
    // and start/stop a dictation cycle on every keystroke. Now it stays active.
    expect(isActive(true, [Ctrl, Space, Backspace], keys)).toBe(true)
  })
  it('deactivates only when a chord key is actually released', () => {
    expect(isActive(true, [Ctrl], keys)).toBe(false) // Space released
    expect(isActive(true, [Backspace], keys)).toBe(false) // both chord keys gone
  })
})
