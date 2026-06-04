import { getSettings } from '../settings'
import { chatComplete } from '../providers/chat'

/** Run the dictation transcript through the DeepSeek "editor" prompt.
 *  The instructions go in a cached system message and only the transcript in the user
 *  message, so the provider can reuse the cached prefix → faster on repeat use.
 *  No max_tokens cap — some models spend tokens on internal reasoning and would otherwise
 *  return empty content if the cap is hit before the final answer. */
function polishSystem(): string {
  const tmpl = getSettings().dictationPolishPrompt
  return tmpl.includes('{{text}}') ? tmpl.replace(/\{\{text\}\}/g, '').trim() : tmpl
}

export async function runPolish(text: string): Promise<string> {
  return chatComplete(text, { system: polishSystem(), temperature: 0.2 })
}

/** Polish (per the editor prompt) AND translate the result into `lang` (English name). */
export async function runPolishTranslate(text: string, lang: string): Promise<string> {
  const target = lang || 'English'
  const system =
    `${polishSystem()}\n\n` +
    `After applying the above, TRANSLATE the result into ${target}. ` +
    `Output ONLY the final text in ${target} — no preamble, notes, or the original.`
  return chatComplete(text, { system, temperature: 0.2 })
}
