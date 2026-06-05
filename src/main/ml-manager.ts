import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { IPC } from '@shared/ipc'
import type { MlState } from '@shared/types'
import { broadcast } from './broadcast'
import { getSettings } from './settings'
import { log } from './logger'
import { mt } from './i18n'

const PYTORCH_INDEX = 'https://download.pytorch.org/whl/cu124'

let state: MlState = { status: 'idle', message: '', device: null, progress: null }
let proc: ChildProcess | null = null
let port = 0
let readyPromise: Promise<string> | null = null

// Optional second ASR engine: Parakeet via ONNX (no torch/NeMo). Runs as its own lightweight
// worker; selected via settings.asrEngine. Diarization always stays on the NeMo worker above.
let onnxProc: ChildProcess | null = null
let onnxPort = 0
let onnxReadyPromise: Promise<string> | null = null

function setState(patch: Partial<MlState>): void {
  state = { ...state, ...patch }
  broadcast(IPC.mlStatusEvent, state)
}

export function getMlState(): MlState {
  return state
}

function mlSrcDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'ml') : join(app.getAppPath(), 'ml')
}

function workerScript(): string {
  return join(mlSrcDir(), 'worker.py')
}

function onnxWorkerScript(): string {
  return join(mlSrcDir(), 'onnx_worker.py')
}

function requirementsFile(): string {
  return join(mlSrcDir(), 'requirements.txt')
}

/** venv python, in priority order:
 *  1) explicit override from settings
 *  2) in-tree dev venv (npm run dev)
 *  3) the conventional project venv under Documents (reuses a prepared env)
 *  4) the writable user-data venv (created by setup) */
function venvPythonCandidates(): string[] {
  const override = getSettings().mlPythonPath
  const documentsVenv = join(
    app.getPath('documents'),
    'AiProgramming',
    'Transcriber',
    'ml',
    '.venv',
    'Scripts',
    'python.exe'
  )
  return [
    ...(override ? [override] : []),
    join(mlSrcDir(), '.venv', 'Scripts', 'python.exe'),
    documentsVenv,
    join(app.getPath('userData'), 'ml-venv', 'Scripts', 'python.exe')
  ]
}

export function findVenvPython(): string | null {
  return venvPythonCandidates().find((p) => existsSync(p)) ?? null
}

function userVenvDir(): string {
  return join(app.getPath('userData'), 'ml-venv')
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const p = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(p))
    })
  })
}

function run(cmd: string, args: string[], onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    const handle = (buf: Buffer): void => {
      for (const line of buf.toString().split(/\r?\n/)) {
        const t = line.trim()
        if (t) onLine(t)
      }
    }
    child.stdout?.on('data', handle)
    child.stderr?.on('data', handle)
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))
    )
  })
}

let uvCmd: string | null = null

function canRun(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const c = spawn(cmd, ['--version'], { windowsHide: true })
      c.on('error', () => resolve(false))
      c.on('close', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

/** Returns a usable `uv` command, installing it via the official standalone installer
 *  (no admin needed) if it isn't already on PATH. Lets the app set up the ML env on a
 *  fresh machine that doesn't have uv. */
async function ensureUv(silent = false): Promise<string> {
  if (uvCmd) return uvCmd
  if (await canRun('uv')) return (uvCmd = 'uv')
  const local = join(app.getPath('home'), '.local', 'bin', 'uv.exe')
  if (existsSync(local)) return (uvCmd = local)
  // `silent` = called from the lightweight TTS path; don't touch the heavy ML engine banner.
  if (!silent) setState({ status: 'setup', message: mt('ml.installUv'), progress: 0.02 })
  await run(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'irm https://astral.sh/uv/install.ps1 | iex'
    ],
    (l) => {
      if (!silent) setState({ message: l.slice(0, 120) })
    }
  )
  if (existsSync(local)) return (uvCmd = local)
  if (await canRun('uv')) return (uvCmd = 'uv')
  throw new Error('uv installation failed')
}

function ttsVenvDir(): string {
  return join(app.getPath('userData'), 'tts-venv')
}

function canImport(py: string, moduleName: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const c = spawn(py, ['-c', `import ${moduleName}`], { windowsHide: true })
      c.on('error', () => resolve(false))
      c.on('close', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

let ttsPyPromise: Promise<string> | null = null

/** A Python interpreter that has `edge-tts`, for read-aloud. Reuses the full ML venv when it
 *  already has edge-tts; otherwise creates a tiny dedicated venv (no torch/NeMo) so read-aloud
 *  works without the heavy ML setup. The in-flight promise is cached so the startup prewarm and a
 *  concurrent hotkey press can't both create/install the venv at once (a venv-corrupting race). */
export function ensureTtsPython(): Promise<string> {
  if (ttsPyPromise) return ttsPyPromise
  ttsPyPromise = (async () => {
    const heavy = findVenvPython()
    if (heavy && (await canImport(heavy, 'edge_tts'))) return heavy
    const venv = ttsVenvDir()
    const py = join(venv, 'Scripts', 'python.exe')
    if (existsSync(py) && (await canImport(py, 'edge_tts'))) return py
    const uv = await ensureUv(true) // silent: don't touch the heavy ML banner
    await run(uv, ['venv', '--python', '3.12', venv], () => {})
    await run(uv, ['pip', 'install', '--python', py, 'edge-tts==7.2.8'], () => {})
    return py
  })()
  // On failure, clear the cache so a later call can retry (e.g. transient network error).
  ttsPyPromise.catch(() => {
    ttsPyPromise = null
  })
  return ttsPyPromise
}

function onnxVenvDir(): string {
  return join(app.getPath('userData'), 'onnx-venv')
}

let onnxPyPromise: Promise<string> | null = null

/** A Python interpreter with `onnx-asr` (+ fastapi/uvicorn for the worker), for the lightweight
 *  ONNX ASR engine — no torch/NeMo. Creates a tiny dedicated `onnx-venv` on first use. Promise is
 *  cached (reset on failure) so concurrent calls share one venv creation. */
function ensureOnnxPython(): Promise<string> {
  if (onnxPyPromise) return onnxPyPromise
  onnxPyPromise = (async () => {
    const venv = onnxVenvDir()
    const py = join(venv, 'Scripts', 'python.exe')
    if (existsSync(py) && (await canImport(py, 'onnx_asr'))) return py
    const uv = await ensureUv()
    setState({ status: 'setup', message: mt('ml.creatingEnv'), progress: 0.1 })
    await run(uv, ['venv', '--python', '3.12', venv], () => {})
    setState({ message: mt('ml.installDeps'), progress: 0.5 })
    await run(
      uv,
      ['pip', 'install', '--python', py, 'onnx-asr[cpu,hub]', 'fastapi', 'uvicorn'],
      (l) => setState({ message: l.slice(0, 120) })
    )
    setState({ message: mt('ml.envReady'), progress: 0.95 })
    return py
  })()
  onnxPyPromise.catch(() => {
    onnxPyPromise = null
  })
  return onnxPyPromise
}

/** Abort setup early with a clear message if the disk is too small for the ~8 GB ML stack. */
async function assertEnoughDisk(): Promise<void> {
  let freeGb = Infinity
  try {
    const st = await statfs(app.getPath('userData'))
    freeGb = (st.bavail * st.bsize) / 1e9
  } catch {
    /* statfs unavailable — skip the check rather than block setup */
  }
  if (freeGb < 6) throw new Error(mt('ml.lowDisk'))
}

async function runSetup(): Promise<string> {
  await assertEnoughDisk()
  const uv = await ensureUv()
  setState({ status: 'setup', message: mt('ml.creatingEnv'), progress: 0.05 })
  const venv = userVenvDir()
  const python = join(venv, 'Scripts', 'python.exe')

  // 1) venv
  await run(uv, ['venv', '--python', '3.12', venv], (l) => setState({ message: l }))

  // 2) torch (CUDA)
  setState({ message: mt('ml.installTorch'), progress: 0.2 })
  await run(
    'uv',
    ['pip', 'install', '--python', python, 'torch==2.6.0', 'torchaudio==2.6.0', '--index-url', PYTORCH_INDEX],
    (l) => setState({ message: l.slice(0, 120) })
  )

  // 3) the rest (NeMo, pyannote, fastapi, numpy<2, …)
  setState({ message: mt('ml.installDeps'), progress: 0.6 })
  await run(uv, ['pip', 'install', '--python', python, '-r', requirementsFile()], (l) =>
    setState({ message: l.slice(0, 120) })
  )

  setState({ message: mt('ml.envReady'), progress: 0.95 })
  return python
}

async function waitForHealth(baseUrl: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const body = (await res.json()) as { device?: string }
        setState({ device: body.device ?? null })
        return
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('ML worker did not become healthy in time')
}

async function spawnWorker(python: string): Promise<string> {
  port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  setState({ status: 'starting', message: mt('ml.startingEngine'), progress: null })

  proc = spawn(python, [workerScript(), '--port', String(port), '--warmup'], {
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', KMP_DUPLICATE_LIB_OK: 'TRUE' }
  })
  proc.stdout?.on('data', (b: Buffer) => console.log('[ml]', b.toString().trim()))
  proc.stderr?.on('data', (b: Buffer) => console.log('[ml:err]', b.toString().trim()))
  proc.on('close', (code) => {
    console.log('[ml] worker exited', code)
    proc = null
    readyPromise = null
    if (state.status === 'ready') setState({ status: 'idle', message: mt('ml.engineStopped') })
  })

  await waitForHealth(baseUrl)
  setState({ status: 'ready', message: mt('ml.engineReady'), progress: null })
  log('info', 'ml worker ready', baseUrl, 'device=' + (state.device ?? '?'))
  return baseUrl
}

/** Ensure the worker is set up and running; returns its base URL. */
export function ensureReady(): Promise<string> {
  if (readyPromise) return readyPromise
  readyPromise = (async () => {
    try {
      let python = findVenvPython()
      if (!python) python = await runSetup()
      return await spawnWorker(python)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setState({ status: 'error', message, progress: null })
      log('error', 'ml engine failed to start:', message)
      readyPromise = null
      throw e
    }
  })()
  return readyPromise
}

async function spawnOnnxWorker(python: string): Promise<string> {
  onnxPort = await getFreePort()
  const baseUrl = `http://127.0.0.1:${onnxPort}`
  setState({ status: 'starting', message: mt('ml.startingEngine'), progress: null })

  onnxProc = spawn(python, [onnxWorkerScript(), '--port', String(onnxPort), '--warmup'], {
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  })
  onnxProc.stdout?.on('data', (b: Buffer) => console.log('[onnx]', b.toString().trim()))
  onnxProc.stderr?.on('data', (b: Buffer) => console.log('[onnx:err]', b.toString().trim()))
  onnxProc.on('close', (code) => {
    console.log('[onnx] worker exited', code)
    onnxProc = null
    onnxReadyPromise = null
  })

  await waitForHealth(baseUrl)
  setState({ status: 'ready', message: mt('ml.engineReady'), progress: null })
  log('info', 'onnx worker ready', baseUrl, 'device=' + (state.device ?? '?'))
  return baseUrl
}

/** Ensure the lightweight ONNX ASR worker is set up and running; returns its base URL. */
export function ensureOnnxReady(): Promise<string> {
  if (onnxReadyPromise) return onnxReadyPromise
  onnxReadyPromise = (async () => {
    try {
      const python = await ensureOnnxPython()
      return await spawnOnnxWorker(python)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setState({ status: 'error', message, progress: null })
      log('error', 'onnx engine failed to start:', message)
      onnxReadyPromise = null
      throw e
    }
  })()
  return onnxReadyPromise
}

/** A dropped connection (vs. an HTTP error or a timeout) — i.e. the worker process died. */
function isWorkerDown(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return false // genuine timeout, not a crash
  const cause = (e as { cause?: { code?: string } }).cause?.code ?? ''
  return /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|terminated|other side closed/i.test(
    `${e.message} ${cause}`
  )
}

interface WorkerEngine {
  ensure: () => Promise<string>
  stop: () => void
}
const nemoEngine: WorkerEngine = { ensure: ensureReady, stop: stopNemoWorker }
const onnxEngine: WorkerEngine = { ensure: ensureOnnxReady, stop: stopOnnxWorker }

async function postTo<T>(
  engine: WorkerEngine,
  path: string,
  body: unknown,
  timeoutMs = 600_000,
  canRetry = true
): Promise<T> {
  const baseUrl = await engine.ensure()
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`worker ${path} failed: ${res.status} ${detail}`)
    }
    return (await res.json()) as T
  } catch (e) {
    // The ASR worker can hard-crash on a back-to-back call (a CUDA/Lhotse bug on Windows — a fresh
    // worker always handles its first call fine). Recover transparently: stop the dead worker and
    // retry the request once, which respawns it and runs on the fresh process.
    if (canRetry && isWorkerDown(e)) {
      log('warn', `ml worker connection lost on ${path} — restarting worker and retrying once`)
      engine.stop()
      return postTo<T>(engine, path, body, timeoutMs, false)
    }
    throw e
  }
}

export interface TranscribeResult {
  text: string
  words: { start: number; end: number; word: string }[]
  segments: { start: number; end: number; text: string }[]
}

export interface DiarizeResult {
  segments: { start: number; end: number; speaker: string }[]
}

export function transcribeAudio(audioPath: string): Promise<TranscribeResult> {
  // ONNX (lightweight, no torch) or NeMo (default), per the user's settings.
  const engine = getSettings().asrEngine === 'onnx' ? onnxEngine : nemoEngine
  return postTo<TranscribeResult>(engine, '/transcribe', { audio_path: audioPath })
}

export function diarizeAudio(
  audioPath: string,
  hfToken: string,
  opts: { minSpeakers?: number; maxSpeakers?: number } = {}
): Promise<DiarizeResult> {
  // Diarization (pyannote) always runs on the NeMo/torch worker — ONNX engine has no diarization.
  return postTo<DiarizeResult>(nemoEngine, '/diarize', {
    audio_path: audioPath,
    hf_token: hfToken,
    min_speakers: opts.minSpeakers,
    max_speakers: opts.maxSpeakers
  })
}

function stopNemoWorker(): void {
  if (proc) {
    proc.kill()
    proc = null
    readyPromise = null
  }
}

function stopOnnxWorker(): void {
  if (onnxProc) {
    onnxProc.kill()
    onnxProc = null
    onnxReadyPromise = null
  }
}

/** Stop both ASR workers (e.g. on app quit). */
export function stopWorker(): void {
  stopNemoWorker()
  stopOnnxWorker()
}
