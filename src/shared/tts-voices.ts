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

export interface TtsVoice {
  id: string // Edge voice id, e.g. 'ru-RU-DmitryNeural'
  lang: string // UI locale key (ru, en, …) — the language this voice speaks
  label: string // display name shown in the picker (incl. M/F)
}

/** Curated Edge neural voices offered in the read-aloud voice picker — female + male per language
 *  (a couple of accents for ru/en). All are standard Microsoft online voices. */
export const TTS_VOICES: TtsVoice[] = [
  { id: 'ru-RU-SvetlanaNeural', lang: 'ru', label: 'Светлана (Ж)' },
  { id: 'ru-RU-DmitryNeural', lang: 'ru', label: 'Дмитрий (М)' },
  { id: 'ru-RU-DariyaNeural', lang: 'ru', label: 'Дарья (Ж)' },
  { id: 'en-US-AriaNeural', lang: 'en', label: 'Aria · US (F)' },
  { id: 'en-US-GuyNeural', lang: 'en', label: 'Guy · US (M)' },
  { id: 'en-GB-SoniaNeural', lang: 'en', label: 'Sonia · UK (F)' },
  { id: 'en-GB-RyanNeural', lang: 'en', label: 'Ryan · UK (M)' },
  { id: 'zh-CN-XiaoxiaoNeural', lang: 'zh', label: 'Xiaoxiao (F)' },
  { id: 'zh-CN-YunxiNeural', lang: 'zh', label: 'Yunxi (M)' },
  { id: 'es-ES-ElviraNeural', lang: 'es', label: 'Elvira (F)' },
  { id: 'es-ES-AlvaroNeural', lang: 'es', label: 'Álvaro (M)' },
  { id: 'fr-FR-DeniseNeural', lang: 'fr', label: 'Denise (F)' },
  { id: 'fr-FR-HenriNeural', lang: 'fr', label: 'Henri (M)' },
  { id: 'de-DE-KatjaNeural', lang: 'de', label: 'Katja (F)' },
  { id: 'de-DE-ConradNeural', lang: 'de', label: 'Conrad (M)' },
  { id: 'pt-BR-FranciscaNeural', lang: 'pt', label: 'Francisca (F)' },
  { id: 'pt-BR-AntonioNeural', lang: 'pt', label: 'Antônio (M)' },
  { id: 'it-IT-ElsaNeural', lang: 'it', label: 'Elsa (F)' },
  { id: 'it-IT-DiegoNeural', lang: 'it', label: 'Diego (M)' },
  { id: 'ja-JP-NanamiNeural', lang: 'ja', label: 'Nanami (F)' },
  { id: 'ja-JP-KeitaNeural', lang: 'ja', label: 'Keita (M)' },
  { id: 'ko-KR-SunHiNeural', lang: 'ko', label: 'SunHi (F)' },
  { id: 'ko-KR-InJoonNeural', lang: 'ko', label: 'InJoon (M)' },
  { id: 'ar-SA-ZariyahNeural', lang: 'ar', label: 'Zariyah (F)' },
  { id: 'ar-SA-HamedNeural', lang: 'ar', label: 'Hamed (M)' },
  { id: 'hi-IN-SwaraNeural', lang: 'hi', label: 'Swara (F)' },
  { id: 'hi-IN-MadhurNeural', lang: 'hi', label: 'Madhur (M)' },
  { id: 'tr-TR-EmelNeural', lang: 'tr', label: 'Emel (F)' },
  { id: 'tr-TR-AhmetNeural', lang: 'tr', label: 'Ahmet (M)' },
  { id: 'pl-PL-ZofiaNeural', lang: 'pl', label: 'Zofia (F)' },
  { id: 'pl-PL-MarekNeural', lang: 'pl', label: 'Marek (M)' }
]

/** Language a voice id speaks, e.g. 'ru-RU-DmitryNeural' → 'ru'. */
export function voiceLang(voiceId: string): string {
  return (voiceId.split('-')[0] || 'en').toLowerCase()
}

/** Resolve the Edge voice for read-aloud.
 *  - `ttsLang === 'auto'` (or empty) → detect the language from the text; Latin/unknown → `fallback`.
 *  - A specific chosen `ttsVoice` wins, but ONLY when it matches the language being spoken — so an
 *    English passage is never read by a Russian voice just because one was picked. */
export function resolveVoice(
  ttsLang: string,
  text: string,
  ttsVoice?: string,
  fallback: Locale = 'en'
): string {
  const lang = ttsLang && ttsLang !== 'auto' ? ttsLang : (detectScriptLang(text) ?? fallback)
  if (ttsVoice && voiceLang(ttsVoice) === lang) return ttsVoice
  return VOICE_BY_LANG[lang] ?? VOICE_BY_LANG[fallback] ?? VOICE_BY_LANG.en
}
