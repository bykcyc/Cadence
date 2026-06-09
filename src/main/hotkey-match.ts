// Pure chord matcher (no electron / native imports) so it can be unit-tested.
// `rightToLeft` maps right-hand modifier keycodes to their left equivalents, so AltGr and
// right-Ctrl/Shift/Meta still match a binding stored with the left keycode.
export function chordMatches(
  pressed: Iterable<number>,
  keys: number[],
  rightToLeft: Record<number, number> = {}
): boolean {
  if (keys.length === 0) return false
  const norm = (c: number): number => rightToLeft[c] ?? c
  const p = new Set<number>()
  for (const c of pressed) p.add(norm(c))
  const k = new Set<number>()
  for (const c of keys) k.add(norm(c))
  if (p.size !== k.size) return false
  for (const c of k) if (!p.has(c)) return false
  return true
}

/** True when EVERY chord key is currently held, even if extra keys are also down. Used to keep a
 *  hold-mode binding active until a chord key is actually released — pressing unrelated keys must
 *  not drop it (an exact-match drop turned a stuck modifier + any keystroke into a start/stop storm). */
export function chordHeld(
  pressed: Iterable<number>,
  keys: number[],
  rightToLeft: Record<number, number> = {}
): boolean {
  if (keys.length === 0) return false
  const norm = (c: number): number => rightToLeft[c] ?? c
  const p = new Set<number>()
  for (const c of pressed) p.add(norm(c))
  for (const c of keys) if (!p.has(norm(c))) return false
  return true
}

/** Whether a binding should be active now: activate only on an EXACT chord (so Ctrl+Space doesn't
 *  fire under Ctrl+Shift+Space), but once active stay active while the chord keys are held. */
export function isActive(
  wasActive: boolean,
  pressed: Iterable<number>,
  keys: number[],
  rightToLeft: Record<number, number> = {}
): boolean {
  return wasActive
    ? chordHeld(pressed, keys, rightToLeft)
    : chordMatches(pressed, keys, rightToLeft)
}
