import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { IPC } from '@shared/ipc'
import type { JobKind, NotesProvider, TranscriptFile } from '@shared/types'
import { getMeeting, writeMeeting, meetingFolder, readArtifact } from '../meetings'
import { getSettings } from '../settings'
import { segmentsToText } from '../transcript'
import { formatDateTime } from '@shared/datetime'
import { broadcast } from '../broadcast'
import { mt } from '../i18n'

const PROVIDER_ENDPOINTS: Record<NotesProvider, string> = {
  deepseek: 'https://api.deepseek.com/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions'
}

const inFlight = new Set<string>()

function progress(meetingId: string, status: 'running' | 'done' | 'error', message: string): void {
  const kind: JobKind = 'notes'
  broadcast(IPC.jobProgressEvent, { meetingId, kind, status, message })
}

export async function runNotes(meetingId: string): Promise<void> {
  if (inFlight.has(meetingId)) return
  inFlight.add(meetingId)
  const folder = meetingFolder(meetingId)
  try {
    const meeting = await getMeeting(meetingId)
    if (!meeting) throw new Error('meeting not found')

    const settings = getSettings()
    if (!settings.notesApiKey) {
      throw new Error(mt('llm.errNoApiKey'))
    }

    // Prefer the diarized transcript, fall back to the plain one.
    const rel =
      meeting.artifacts.diarizedTranscript.status === 'done'
        ? meeting.artifacts.diarizedTranscript.path
        : meeting.artifacts.transcript.status === 'done'
          ? meeting.artifacts.transcript.path
          : null
    if (!rel) throw new Error(mt('tip.needTranscript'))

    meeting.artifacts.notes = { ...meeting.artifacts.notes, status: 'running', error: null }
    await writeMeeting(meeting)
    broadcast(IPC.meetingsChangedEvent)
    progress(meetingId, 'running', mt('notes.generating'))

    const file = (await readArtifact(meetingId, rel)) as TranscriptFile | null
    if (!file) throw new Error(mt('notes.errReadTranscript'))
    const transcriptText = segmentsToText(file.segments, meeting.speakers)

    const prompt = settings.notesPrompt
      .replaceAll('{{transcript}}', transcriptText)
      .replaceAll('{{date}}', formatDateTime(meeting.createdAt))
      .replaceAll('{{title}}', meeting.title)
      .replaceAll('{{participants}}', Object.values(meeting.speakers).join(', '))

    const endpoint = PROVIDER_ENDPOINTS[settings.notesProvider]
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.notesApiKey}`,
        'X-Title': 'Cadence'
      },
      body: JSON.stringify({
        model: settings.notesModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        stream: false
      }),
      signal: AbortSignal.timeout(180_000)
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`${settings.notesProvider} API ${res.status}: ${detail.slice(0, 300)}`)
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error(mt('llm.errEmpty'))

    await writeFile(join(folder, 'notes.md'), content, 'utf8')

    const updated = await getMeeting(meetingId)
    if (updated) {
      updated.artifacts.notes = {
        status: 'done',
        path: 'notes.md',
        model: settings.notesModel,
        completedAt: new Date().toISOString(),
        error: null
      }
      await writeMeeting(updated)
    }
    broadcast(IPC.meetingsChangedEvent)
    progress(meetingId, 'done', mt('job.done'))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const m = await getMeeting(meetingId)
    if (m) {
      m.artifacts.notes = { ...m.artifacts.notes, status: 'error', error: message }
      await writeMeeting(m)
      broadcast(IPC.meetingsChangedEvent)
    }
    progress(meetingId, 'error', message)
  } finally {
    inFlight.delete(meetingId)
  }
}
