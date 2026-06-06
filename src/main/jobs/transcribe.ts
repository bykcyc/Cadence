import { join } from 'node:path'
import { writeFile, rm } from 'node:fs/promises'
import { IPC } from '@shared/ipc'
import type { ArtifactStatus, JobKind, Meeting, TranscriptFile, TranscriptSegment } from '@shared/types'
import { getMeeting, writeMeeting, meetingFolder } from '../meetings'
import { getSettings } from '../settings'
import { toMono16kWav } from '../audio/ffmpeg'
import { transcribeAudio, diarizeAudio } from '../ml-manager'
import {
  assignSpeaker,
  buildPlainSegments,
  groupTaggedWords,
  normalizeDiarSegments,
  segmentsToText,
  type Word
} from '../transcript'
import { broadcast } from '../broadcast'
import { log } from '../logger'
import { mt } from '../i18n'

const inFlight = new Set<string>()

function jobKey(id: string, diarize: boolean): string {
  return `${id}:${diarize}`
}

function progress(
  meetingId: string,
  kind: JobKind,
  status: ArtifactStatus,
  message: string,
  percent?: number
): void {
  broadcast(IPC.jobProgressEvent, { meetingId, kind, status, message, percent })
}

async function setArtifact(
  meetingId: string,
  kind: 'transcript' | 'diarizedTranscript',
  patch: Partial<Meeting['artifacts']['transcript']>
): Promise<void> {
  const meeting = await getMeeting(meetingId)
  if (!meeting) return
  meeting.artifacts[kind] = { ...meeting.artifacts[kind], ...patch }
  await writeMeeting(meeting)
  broadcast(IPC.meetingsChangedEvent)
}

function defaultLabel(speaker: string): string {
  if (speaker === 'me') return mt('speaker.me')
  if (speaker === 'them') return mt('speaker.them')
  if (speaker === 'speaker') return mt('speaker.one') // single neutral stream (bleed)
  const m = speaker.match(/^spk_(\d+)$/)
  return m ? mt('speaker.n', { n: m[1] }) : speaker
}

async function ensureSpeakerLabels(meetingId: string, speakers: string[]): Promise<void> {
  const meeting = await getMeeting(meetingId)
  if (!meeting) return
  let changed = false
  for (const s of speakers) {
    if (!meeting.speakers[s]) {
      meeting.speakers[s] = defaultLabel(s)
      changed = true
    }
  }
  if (changed) await writeMeeting(meeting)
}

/** Run transcription (and optional diarization) for one meeting. */
export async function runTranscription(meetingId: string, diarize: boolean): Promise<void> {
  const key = jobKey(meetingId, diarize)
  if (inFlight.has(key)) return
  inFlight.add(key)

  const kind: JobKind = diarize ? 'diarizedTranscript' : 'transcript'
  const artifactKey = diarize ? 'diarizedTranscript' : 'transcript'
  const folder = meetingFolder(meetingId)
  const temps: string[] = []

  try {
    const meeting = await getMeeting(meetingId)
    if (!meeting) throw new Error('meeting not found')

    await setArtifact(meetingId, artifactKey, { status: 'running', error: null })
    progress(meetingId, kind, 'running', mt('job.prepAudio'))

    const settings = getSettings()
    const micFile = meeting.audio.mic
    const systemFile = meeting.audio.system

    // Resample present tracks to 16 kHz mono.
    let micWav: string | null = null
    let systemWav: string | null = null
    if (micFile) {
      micWav = join(folder, '_mic16.wav')
      await toMono16kWav(join(folder, micFile), micWav)
      temps.push(micWav)
    }
    if (systemFile) {
      systemWav = join(folder, '_system16.wav')
      await toMono16kWav(join(folder, systemFile), systemWav)
      temps.push(systemWav)
    }

    // ASR each track.
    let micWords: Word[] = []
    let systemWords: Word[] = []
    let language: string | null = meeting.language
    if (micWav) {
      const msg = mt('job.recognizeMic')
      progress(meetingId, kind, 'running', msg, 0)
      const r = await transcribeAudio(micWav, (v) =>
        progress(meetingId, kind, 'running', msg, v)
      )
      micWords = r.words
    }
    if (systemWav) {
      const msg = mt('job.recognizeSystem')
      progress(meetingId, kind, 'running', msg, 0)
      const r = await transcribeAudio(systemWav, (v) =>
        progress(meetingId, kind, 'running', msg, v)
      )
      systemWords = r.words
    }

    let segments: TranscriptSegment[]
    const usedSpeakers = new Set<string>()

    if (diarize && systemWav) {
      // No hard token requirement — once the gated model is cached it loads without one.
      // If it's missing and not cached, the worker returns a clear token/license error.
      const hfToken = settings.hfToken
      progress(meetingId, kind, 'running', mt('job.diarizing'))
      const diar = await diarizeAudio(systemWav, hfToken ?? '')
      const { segments: normSegs, speakers } = normalizeDiarSegments(diar.segments)
      // Interleave mic ('me') + system (per pyannote speaker) words by time → correct turn order.
      const tagged = [
        ...micWords.map((w) => ({ ...w, speaker: 'me' })),
        ...systemWords.map((w) => ({ ...w, speaker: assignSpeaker(w, normSegs) }))
      ]
      segments = groupTaggedWords(tagged)
      if (micWords.length) usedSpeakers.add('me')
      speakers.forEach((s) => usedSpeakers.add(s))
    } else {
      // Plain transcript: auto — clean tracks → interleaved me/them; bleed → one chronological stream.
      const plain = buildPlainSegments(micWords, systemWords)
      segments = plain.segments
      plain.speakers.forEach((s) => usedSpeakers.add(s))
    }

    await ensureSpeakerLabels(meetingId, [...usedSpeakers])

    const labelsMeeting = await getMeeting(meetingId)
    const labels = labelsMeeting?.speakers ?? {}

    const file: TranscriptFile = {
      language,
      durationSec: meeting.durationSec,
      diarized: diarize,
      engine: diarize ? 'parakeet-v3 + pyannote (local)' : 'parakeet-v3 (local)',
      createdAt: new Date().toISOString(),
      segments,
      text: segmentsToText(segments, labels)
    }

    const relPath = diarize ? 'transcript.diarized.json' : 'transcript.json'
    await writeFile(join(folder, relPath), JSON.stringify(file, null, 2), 'utf8')

    await setArtifact(meetingId, artifactKey, {
      status: 'done',
      path: relPath,
      engine: file.engine,
      completedAt: new Date().toISOString(),
      error: null
    })
    progress(meetingId, kind, 'done', mt('job.done'))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log('error', `transcription (${kind}) failed for ${meetingId}:`, message)
    await setArtifact(meetingId, artifactKey, { status: 'error', error: message })
    progress(meetingId, kind, 'error', message)
  } finally {
    for (const t of temps) await rm(t, { force: true }).catch(() => {})
    inFlight.delete(key)
  }
}
