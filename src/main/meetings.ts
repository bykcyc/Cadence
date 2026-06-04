import { shell } from 'electron'
import { mkdir, readdir, readFile, writeFile, rename, stat, rm } from 'node:fs/promises'
import { join, normalize, sep } from 'node:path'
import { getRecordsDir } from './settings'
import { MEETING_SCHEMA_VERSION, type AudioFormat, type Meeting } from '@shared/types'
import { mt } from './i18n'

export async function ensureRecordsDir(): Promise<string> {
  const dir = getRecordsDir()
  await mkdir(dir, { recursive: true })
  return dir
}

export async function openRecordsFolder(): Promise<void> {
  const dir = await ensureRecordsDir()
  await shell.openPath(dir)
}

export function meetingFolder(id: string): string {
  return join(getRecordsDir(), id)
}

export async function openMeetingFolder(id: string): Promise<void> {
  await shell.openPath(meetingFolder(id))
}

/** Folder id format: YYYY-MM-DD_HH-MM-SS (local time). */
export function folderIdToDate(id: string): Date | null {
  const m = id.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  return Number.isNaN(date.getTime()) ? null : date
}

export function defaultMeeting(id: string, createdAt: string): Meeting {
  return {
    schemaVersion: MEETING_SCHEMA_VERSION,
    id,
    title: id,
    createdAt,
    durationSec: 0,
    language: null,
    audio: { mic: null, system: null, mixed: null, format: 'flac', sampleRate: 48000 },
    artifacts: {
      transcript: { status: 'none', path: null },
      diarizedTranscript: { status: 'none', path: null },
      notes: { status: 'none', path: null }
    },
    speakers: { me: mt('speaker.me') },
    processed: false,
    processedAt: null,
    processedBy: null,
    tags: []
  }
}

async function detectAudio(folder: string): Promise<Meeting['audio']> {
  let mic: string | null = null
  let system: string | null = null
  let mixed: string | null = null
  let format: AudioFormat = 'flac'
  try {
    const files = await readdir(folder)
    for (const f of files) {
      const lower = f.toLowerCase()
      if (/^mic\.(wav|flac)$/.test(lower)) {
        mic = f
        format = lower.endsWith('.wav') ? 'wav' : 'flac'
      } else if (/^system\.(wav|flac)$/.test(lower)) {
        system = f
      } else if (/^mixed\.(wav|flac)$/.test(lower)) {
        mixed = f
      }
    }
  } catch {
    // folder unreadable -> leave nulls
  }
  return { mic, system, mixed, format, sampleRate: 48000 }
}

/** Load meeting.json for a folder, or synthesize a record from what's on disk. */
async function readMeeting(id: string): Promise<Meeting | null> {
  const folder = meetingFolder(id)
  let info: import('node:fs').Stats
  try {
    info = await stat(folder)
  } catch {
    return null
  }
  if (!info.isDirectory()) return null

  const metaPath = join(folder, 'meeting.json')
  try {
    const raw = await readFile(metaPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<Meeting>
    const createdAt = parsed.createdAt ?? folderIdToDate(id)?.toISOString() ?? info.birthtime.toISOString()
    // Merge over defaults so older/partial files stay valid.
    return { ...defaultMeeting(id, createdAt), ...parsed, id }
  } catch {
    // No (or invalid) meeting.json -> synthesize from folder contents.
    const createdAt = folderIdToDate(id)?.toISOString() ?? info.birthtime.toISOString()
    const synthesized = defaultMeeting(id, createdAt)
    synthesized.audio = await detectAudio(folder)
    return synthesized
  }
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  return readMeeting(id)
}

export async function listMeetings(): Promise<Meeting[]> {
  const dir = await ensureRecordsDir()
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const meetings: Meeting[] = []
  for (const name of entries) {
    const m = await readMeeting(name)
    if (m) meetings.push(m)
  }
  meetings.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return meetings
}

/** Atomic write of meeting.json (temp file + rename). */
export async function writeMeeting(meeting: Meeting): Promise<Meeting> {
  const folder = meetingFolder(meeting.id)
  await mkdir(folder, { recursive: true })
  const target = join(folder, 'meeting.json')
  const tmp = join(folder, `meeting.json.tmp-${process.pid}`)
  await writeFile(tmp, JSON.stringify(meeting, null, 2), 'utf8')
  await rename(tmp, target)
  return meeting
}

export async function renameMeeting(id: string, title: string): Promise<Meeting | null> {
  const meeting = await getMeeting(id)
  if (!meeting) return null
  meeting.title = title.trim() || id
  return writeMeeting(meeting)
}

export async function setSpeakerLabels(
  id: string,
  labels: Record<string, string>
): Promise<Meeting | null> {
  const meeting = await getMeeting(id)
  if (!meeting) return null
  meeting.speakers = { ...meeting.speakers, ...labels }
  return writeMeeting(meeting)
}

/** Read and parse a JSON artifact (transcript / diarized / notes meta) from a meeting folder. */
export async function readArtifact(id: string, relPath: string): Promise<unknown | null> {
  // Guard against path traversal — only allow simple file names within the folder.
  if (relPath.includes('..') || relPath.includes('/') || relPath.includes('\\')) return null
  try {
    const raw = await readFile(join(meetingFolder(id), relPath), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Delete a meeting folder (with path-traversal safety). */
export async function deleteMeeting(id: string): Promise<boolean> {
  const base = normalize(getRecordsDir())
  const target = normalize(meetingFolder(id))
  if (target === base || !target.startsWith(base + sep)) return false
  await rm(target, { recursive: true, force: true })
  return true
}

export async function setProcessed(
  id: string,
  processed: boolean,
  by: string | null = 'app'
): Promise<Meeting | null> {
  const meeting = await getMeeting(id)
  if (!meeting) return null
  meeting.processed = processed
  meeting.processedAt = processed ? new Date().toISOString() : null
  meeting.processedBy = processed ? by : null
  return writeMeeting(meeting)
}
