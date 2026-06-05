import type { Locale } from './i18n'

/** Default Edge (Microsoft) neural voice per language for read-aloud. */
export const VOICE_BY_LANG: Record<string, string> = {
  ru: 'ru-RU-SvetlanaNeural',
  en: 'en-US-AriaNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  pt: 'pt-BR-FranciscaNeural',
  it: 'it-IT-ElsaNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  ar: 'ar-SA-ZariyahNeural',
  hi: 'hi-IN-SwaraNeural',
  tr: 'tr-TR-EmelNeural',
  pl: 'pl-PL-ZofiaNeural'
}

/** Best-effort language detection from the dominant Unicode script of `text`.
 *  Reliable for distinct scripts (Cyrillic, Hangul, Kana, Han, Arabic, Devanagari);
 *  Latin-script languages can't be told apart by script → returns null. */
export function detectScriptLang(text: string): Locale | null {
  if (/[Ѐ-ӿ]/.test(text)) return 'ru' // Cyrillic
  if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'ko' // Hangul
  if (/[぀-ヿ]/.test(text)) return 'ja' // Hiragana / Katakana (check before Han)
  if (/[一-鿿]/.test(text)) return 'zh' // Han
  if (/[؀-ۿݐ-ݿ]/.test(text)) return 'ar' // Arabic
  if (/[ऀ-ॿ]/.test(text)) return 'hi' // Devanagari
  return null
}

/** Resolve the Edge voice for read-aloud.
 *  - `ttsLang === 'auto'` (or empty) → detect from the text; Latin/unknown → `fallback`.
 *  - otherwise → the configured language's voice. */
export function resolveVoice(ttsLang: string, text: string, fallback: Locale = 'en'): string {
  const lang = ttsLang && ttsLang !== 'auto' ? ttsLang : (detectScriptLang(text) ?? fallback)
  return VOICE_BY_LANG[lang] ?? VOICE_BY_LANG[fallback] ?? VOICE_BY_LANG.en
}
