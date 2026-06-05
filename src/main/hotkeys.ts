import { uIOhook, UiohookKey } from 'uiohook-napi'
import type { HotkeyBinding, HotkeyMode } from '@shared/types'
import { chordMatches } from './hotkey-match'
import { log } from './logger'

// `kind` is a generic action id: dictation kinds ('plain'|'polish'|'translate') or 'tts'.
interface Handlers {
  onActivate: (kind: string, mode: HotkeyMode) => void
  onDeactivate: (kind: string, mode: HotkeyMode) => void
}

let handlers: Handlers = { onActivate: () => {}, onDeactivate: () => {} }
let bindings: { kind: string; binding: HotkeyBinding }[] = []
let started = false

const pressed = new Set<number>()
const activeKinds = new Set<string>()

let captureCb: ((b: { keys: number[]; label: string }) => void) | null = null
let captureCurrent: number[] = []
let captureMax: number[] = []

// ---- keycode labels ----
const REVERSE: Record<number, string> = {}
for (const [name, code] of Object.entries(UiohookKey)) {
  if (typeof code === 'number' && !(code in REVERSE)) REVERSE[code] = name
}
const FRIENDLY: Record<string, string> = {
  Ctrl: 'Ctrl',
  CtrlRight: 'RCtrl',
  Alt: 'Alt',
  AltRight: 'RAlt',
  Shift: 'Shift',
  ShiftRight: 'RShift',
  Meta: 'Win',
  MetaRight: 'RWin',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Tab: 'Tab'
}

export function keycodeLabel(code: number): string {
  const name = REVERSE[code] ?? String(code)
  return FRIENDLY[name] ?? name
}

function modifierRank(code: number): number {
  const n = REVERSE[code] ?? ''
  if (/Ctrl/.test(n)) return 0
  if (/Alt/.test(n)) return 1
  if (/Shift/.test(n)) return 2
  if (/Meta/.test(n)) return 3
  return 9
}

export function labelForKeys(keys: number[]): string {
  return [...keys].sort((a, b) => modifierRank(a) - modifierRank(b)).map(keycodeLabel).join(' + ')
}

// ---- matching ----
// Right-hand modifiers map to their left equivalents so AltGr / right-Ctrl (common on Windows,
// where Ctrl+Alt is often reported as Ctrl + *right* Alt) still match a binding stored with the
// left keycode — the cause of Ctrl+Alt+R / Ctrl+Alt+Space never firing.
const RIGHT_TO_LEFT: Record<number, number> = {
  [UiohookKey.CtrlRight]: UiohookKey.Ctrl,
  [UiohookKey.AltRight]: UiohookKey.Alt,
  [UiohookKey.ShiftRight]: UiohookKey.Shift,
  [UiohookKey.MetaRight]: UiohookKey.Meta
}

function exactMatch(keys: number[]): boolean {
  return chordMatches(pressed, keys, RIGHT_TO_LEFT)
}

function recompute(): void {
  for (const { kind, binding } of bindings) {
    const matched = exactMatch(binding.keys)
    const was = activeKinds.has(kind)
    if (matched && !was) {
      activeKinds.add(kind)
      log('info', 'hotkey activate:', kind, `(${labelForKeys(binding.keys)})`)
      handlers.onActivate(kind, binding.mode)
    } else if (!matched && was) {
      activeKinds.delete(kind)
      handlers.onDeactivate(kind, binding.mode)
    }
  }
}

function onKeydown(e: { keycode: number }): void {
  if (captureCb) {
    if (!captureCurrent.includes(e.keycode)) captureCurrent.push(e.keycode)
    if (captureCurrent.length > captureMax.length) captureMax = [...captureCurrent]
    return
  }
  if (!pressed.has(e.keycode)) {
    pressed.add(e.keycode)
    recompute()
  }
}

function onKeyup(e: { keycode: number }): void {
  if (captureCb) {
    captureCurrent = captureCurrent.filter((k) => k !== e.keycode)
    if (captureCurrent.length === 0 && captureMax.length > 0) {
      const keys = captureMax
      captureMax = []
      const cb = captureCb
      cb({ keys, label: labelForKeys(keys) })
    }
    return
  }
  if (pressed.has(e.keycode)) {
    pressed.delete(e.keycode)
    recompute()
  }
}

export function startHotkeys(h: Handlers): void {
  handlers = h
  if (started) return
  uIOhook.on('keydown', onKeydown)
  uIOhook.on('keyup', onKeyup)
  uIOhook.start()
  started = true
}

export function setBindings(list: { kind: string; binding: HotkeyBinding }[]): void {
  bindings = list
  activeKinds.clear()
  pressed.clear()
}

export function stopHotkeys(): void {
  if (!started) return
  try {
    uIOhook.stop()
  } catch {
    /* ignore */
  }
  started = false
}

/** Begin capturing a key combo for the settings UI. cb fires once when keys release. */
export function beginCapture(cb: (b: { keys: number[]; label: string }) => void): void {
  captureCb = cb
  captureCurrent = []
  captureMax = []
}

export function endCapture(): void {
  captureCb = null
  captureCurrent = []
  captureMax = []
}
