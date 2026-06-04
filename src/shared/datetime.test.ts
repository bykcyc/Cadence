import { describe, it, expect } from 'vitest'
import { formatDateTime } from './datetime'

describe('formatDateTime', () => {
  it('returns the input unchanged for an invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
  })

  it('formats a valid ISO timestamp into a non-empty, different string', () => {
    const out = formatDateTime('2026-06-04T15:30:00+03:00')
    expect(out).toBeTruthy()
    expect(out).not.toBe('2026-06-04T15:30:00+03:00')
  })
})
