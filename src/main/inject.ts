import { clipboard } from 'electron'
import { execFile } from 'node:child_process'

export function copyToClipboard(text: string): void {
  clipboard.writeText(text)
}

/** Paste `text` at the cursor: put it on the clipboard and synthesize Ctrl+V into
 *  the foreground app (our windows never take focus). Optionally restore clipboard. */
export async function insertText(text: string, restoreClipboard: boolean): Promise<void> {
  const previous = restoreClipboard ? clipboard.readText() : null
  clipboard.writeText(text)
  await sendPaste()
  if (restoreClipboard && previous !== null) {
    setTimeout(() => clipboard.writeText(previous), 600)
  }
}

// Robust Ctrl+V via the Win32 keybd_event API. We first release any modifier the user
// may still be physically holding from the hotkey (Ctrl/Shift/Alt/Win) — otherwise a
// lingering Shift turns the paste into Shift+V and a literal "V" gets typed instead of
// pasting. Then we send a clean Ctrl-down, V, Ctrl-up. Delivered via -EncodedCommand
// (base64 UTF-16LE) so the embedded quotes survive Node's argument escaping intact.
const PASTE_PS = [
  "$s = '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, System.UIntPtr e);'",
  '$k = Add-Type -MemberDefinition $s -Name KbInject -Namespace Win32 -PassThru',
  'Start-Sleep -Milliseconds 80',
  // KEYEVENTF_KEYUP = 0x2 — release Shift, Ctrl, Alt, LWin, RWin if still held
  'foreach ($vk in 0x10,0x11,0x12,0x5B,0x5C) { $k::keybd_event([byte]$vk,0,0x2,[System.UIntPtr]::Zero) }',
  'Start-Sleep -Milliseconds 30',
  '$k::keybd_event(0x11,0,0,[System.UIntPtr]::Zero)', // Ctrl down
  '$k::keybd_event(0x56,0,0,[System.UIntPtr]::Zero)', // V down
  'Start-Sleep -Milliseconds 20',
  '$k::keybd_event(0x56,0,0x2,[System.UIntPtr]::Zero)', // V up
  '$k::keybd_event(0x11,0,0x2,[System.UIntPtr]::Zero)' // Ctrl up
].join('\n')

function sendPaste(): Promise<void> {
  const encoded = Buffer.from(PASTE_PS, 'utf16le').toString('base64')
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true },
      () => resolve()
    )
  })
}

// Ctrl+C via keybd_event (same robustness as paste). 0x43 = 'C'.
const COPY_PS = [
  "$s = '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, System.UIntPtr e);'",
  '$k = Add-Type -MemberDefinition $s -Name KbCopy -Namespace Win32 -PassThru',
  'Start-Sleep -Milliseconds 30',
  // release Shift/Alt/Win (the hotkey may hold Alt) so Ctrl+C is clean
  'foreach ($vk in 0x10,0x12,0x5B,0x5C) { $k::keybd_event([byte]$vk,0,0x2,[System.UIntPtr]::Zero) }',
  'Start-Sleep -Milliseconds 30',
  '$k::keybd_event(0x11,0,0,[System.UIntPtr]::Zero)', // Ctrl down
  '$k::keybd_event(0x43,0,0,[System.UIntPtr]::Zero)', // C down
  'Start-Sleep -Milliseconds 20',
  '$k::keybd_event(0x43,0,0x2,[System.UIntPtr]::Zero)', // C up
  '$k::keybd_event(0x11,0,0x2,[System.UIntPtr]::Zero)' // Ctrl up
].join('\n')

function sendCopy(): Promise<void> {
  const encoded = Buffer.from(COPY_PS, 'utf16le').toString('base64')
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true },
      () => resolve()
    )
  })
}

/** Copy the current selection (Ctrl+C) and return its text, restoring the prior clipboard. */
export async function copySelection(): Promise<string> {
  const previous = clipboard.readText()
  const sentinel = `__cadence_sel_${Date.now()}__`
  clipboard.writeText(sentinel)
  await sendCopy()
  let text = ''
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 50))
    const cur = clipboard.readText()
    if (cur && cur !== sentinel) {
      text = cur
      break
    }
  }
  setTimeout(() => clipboard.writeText(previous), 60)
  return text.trim()
}
