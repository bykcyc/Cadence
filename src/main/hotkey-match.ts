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
