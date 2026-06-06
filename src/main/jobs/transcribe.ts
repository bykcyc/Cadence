import { join } from 'node:path'
import { writeFile, rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { IPC } from '@shared/ipc'
import type { ArtifactStatus, JobKind, Meeting, TranscriptFile, TranscriptSegment } from '@shared/types'
import { getMeeting, writeMeeting, meetingFolder } from '../meetings'
import { getSettings } from '../settings'
import { toMono16kWav, mixToMono16kWav } from '../audio/ffmpeg'
import { transcribeAudio, diarizeAudio } from '../ml-manager'
import {
  assignSpeaker,
  groupTaggedWords,
  groupWords,
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
export async function runTranscription(
  meetingId: string,
  diarize: boolean,
  numSpeakers?: number
): Promise<void> {
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
    const { mic, system, mixed } = meeting.audio
    const language: string | null = meeting.language

    // ASR is the slow part. Its word-level result is cached per meeting so that "By speakers"
    // (diarize) can reuse it and skip a second ASR pass — that's the only place the cache is read.
    // The plain "Transcript" (incl. "Redo") ALWAYS re-runs ASR (so Redo does real, visible work)
    // and refreshes the cache for any later diarization.
    const wordsCache = join(folder, 'asr-words.json')
    let cachedWords: Word[] | null = null
    if (diarize && existsSync(wordsCache)) {
      try {
        const w = JSON.parse(await readFile(wordsCache, 'utf8')).words
        if (Array.isArray(w) && w.length) cachedWords = w as Word[]
      } catch {
        /* corrupt cache → just re-transcribe below */
      }
    }

    // The 16 kHz mono WAV is needed when ASR hasn't run yet, or when diarizing (pyannote reads it).
    // ONE stream — the whole conversation on one timeline: prefer the saved mix; else mix the two
    // tracks; else the lone track. (Per-track me/them only worked with headphones; the mix is robust.)
    let asrWav: string | null = null
    if (!cachedWords || diarize) {
      asrWav = join(folder, '_asr16.wav')
      temps.push(asrWav)
      if (mixed) {
        await toMono16kWav(join(folder, mixed), asrWav)
      } else if (mic && system) {
        await mixToMono16kWav(join(folder, mic), join(folder, system), asrWav)
      } else if (mic || system) {
        await toMono16kWav(join(folder, (mic ?? system) as string), asrWav)
      } else {
        throw new Error('meeting has no audio')
      }
    }

    let words: Word[]
    if (cachedWords) {
      words = cachedWords
    } else {
      const msg = mt('job.recognize')
      progress(meetingId, kind, 'running', msg, 0)
      const r = await transcribeAudio(asrWav as string, (v) =>
        progress(meetingId, kind, 'running', msg, v)
      )
      words = r.words
      await writeFile(wordsCache, JSON.stringify({ v: 1, words }), 'utf8').catch(() => {})
    }

    let segments: TranscriptSegment[]
    const usedSpeakers = new Set<string>()

    if (diarize) {
      // Separate speakers by voice (pyannote) on the SAME mixed stream → who-said-what.
      // No hard token requirement — once the gated model is cached it loads without one.
      if (!asrWav) throw new Error('no audio for diarization')
      const hfToken = settings.hfToken
      const dmsg = mt('job.diarizing')
      progress(meetingId, kind, 'running', dmsg, 0)
      const diar = await diarizeAudio(asrWav, hfToken ?? '', { numSpeakers }, (v) =>
        progress(meetingId, kind, 'running', dmsg, v)
      )
      const { segments: normSegs, speakers } = normalizeDiarSegments(diar.segments)
      if (speakers.length > 0) {
        const tagged = words.map((w) => ({ ...w, speaker: assignSpeaker(w, normSegs) }))
        segments = groupTaggedWords(tagged)
        speakers.forEach((s) => usedSpeakers.add(s))
      } else {
        // Diarization found no speakers — fall back to a single chronological stream.
        segments = groupWords(words, 'speaker')
        usedSpeakers.add('speaker')
      }
    } else {
      // Plain transcript: one chronological stream, single neutral speaker (no false me/them split).
      segments = groupWords(words, 'speaker')
      usedSpeakers.add('speaker')
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
