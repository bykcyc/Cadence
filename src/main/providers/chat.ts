import { getSettings } from '../settings'
import type { NotesProvider } from '@shared/types'
import { currentApiKey } from '@shared/notes'
import { mt } from '../i18n'

const ENDPOINTS: Record<NotesProvider, string> = {
  deepseek: 'https://api.deepseek.com/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions'
}

/** Single-prompt chat completion via the configured provider (OpenAI-compatible).
 *  Passing `system` keeps the instructions in a separate, stable message so the provider
 *  can cache that prefix across calls (DeepSeek does this automatically) — faster repeats. */
export async function chatComplete(
  prompt: string,
  opts: { temperature?: number; system?: string; maxTokens?: number } = {}
): Promise<string> {
  const s = getSettings()
  const apiKey = currentApiKey(s)
  if (!apiKey) throw new Error(mt('llm.errNoApiKey'))
  if (!s.notesModel?.trim()) throw new Error(mt('llm.errNoModel'))
  const messages = opts.system
    ? [
        { role: 'system', content: opts.system },
        { role: 'user', content: prompt }
      ]
    : [{ role: 'user', content: prompt }]
  const res = await fetch(ENDPOINTS[s.notesProvider], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Title': 'Cadence'
    },
    body: JSON.stringify({
      model: s.notesModel,
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      stream: false
    }),
    signal: AbortSignal.timeout(180_000)
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${s.notesProvider} API ${res.status}: ${detail.slice(0, 300)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error(mt('llm.errEmpty'))
  return content
}
