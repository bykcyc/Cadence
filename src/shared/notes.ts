import type { AppSettings, NotesProvider } from './types'

/** The API key for the currently-selected LLM provider (per-provider storage). */
export function currentApiKey(s: AppSettings): string | null {
  return s.notesApiKeys?.[s.notesProvider] ?? null
}

/** Sensible default model per provider (OpenRouter has none — the user fetches & picks). */
export const DEFAULT_MODELS: Record<NotesProvider, string> = {
  deepseek: 'deepseek-v4-flash',
  openrouter: '',
  mistral: 'mistral-large-latest'
}

/** The model for the currently-selected provider (per-provider storage, with a sensible default). */
export function currentModel(s: AppSettings): string {
  return s.notesModels?.[s.notesProvider] ?? DEFAULT_MODELS[s.notesProvider] ?? ''
}

export const DEFAULT_NOTES_PROMPT = `You are an assistant that writes clear, well-structured notes for a work meeting.

Based on the transcript below, prepare:
1. **Summary** — 2–3 sentences on the gist of the meeting.
2. **Key topics and decisions** — a bulleted list.
3. **Action items** — who / what / due date (if mentioned).
4. **Open questions** — what was left unresolved.

Be concise and to the point. Do not invent facts that are not in the transcript.
Write the notes in the same language as the transcript (Russian transcript → Russian notes, English → English, etc.).

Date: {{date}}
Meeting title: {{title}}

Transcript:
{{transcript}}`
